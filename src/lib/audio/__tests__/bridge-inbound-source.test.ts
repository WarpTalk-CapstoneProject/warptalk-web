/**
 * Resolving where the inbound leg's audio comes from.
 *
 * The bug this guards against is a leak nobody sees. A loopback capture lives in the desktop main
 * process; if the web side gives up without telling it to stop, the capture keeps running against
 * a browser the user has stopped meeting in, and the only symptom is a machine that gets slower
 * every time somebody joins and leaves a bridge room.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  deviceInboundSource,
  LoopbackInboundError,
  openLoopbackInboundSource,
} from "../bridge-inbound-source.ts";

interface FakeBridge {
  startAudioCapture?: (request?: unknown) => Promise<unknown>;
  stopAudioCapture?: () => Promise<void>;
  onWindowsLoopbackPcmChunk?: (callback: (chunk: unknown) => void) => () => void;
}

// Cast through `unknown` to a bag of properties. Typing this as `typeof globalThis` fights the DOM
// lib on every line — `window` is declared non-optional there, so `delete` is rejected, and a stub
// standing in for AudioContext can never satisfy its 30-odd members. The test needs to set two
// globals and put them back, not to model the browser.
const globals = globalThis as unknown as Record<string, unknown>;

/** Enough of an AudioContext for the PCM bridge to build a track it never has to play. */
class StubAudioContext {
  destination = {};
  currentTime = 0;
  createMediaStreamDestination() {
    return { stream: { getAudioTracks: () => [{ stop() {}, kind: "audio" }] } };
  }
  createBuffer() {
    return { duration: 0, getChannelData: () => new Float32Array(0) };
  }
  createBufferSource() {
    return { buffer: null, connect() {}, start() {} };
  }
}

function install(bridge: FakeBridge | null): void {
  globals.AudioContext = StubAudioContext;
  globals.window = { warptalk: bridge ?? undefined, AudioContext: StubAudioContext };
}

afterEach(() => {
  // Assigned back to undefined rather than deleted: `typeof window` reads "undefined" either way,
  // which is the check `getDesktopBridge` makes, and this keeps the DOM lib out of the argument.
  globals.window = undefined;
  globals.AudioContext = undefined;
});

test("a device source creates nothing, so disposing it releases nothing", async () => {
  const handles = deviceInboundSource("cable-b-output");

  assert.deepEqual(handles.source, { kind: "device", deviceId: "cable-b-output" });
  // The publisher opens and closes that track itself. A dispose that also stopped it would close
  // the same track twice, from two owners, on every teardown.
  await handles.dispose();
});

test("a refusal keeps the risk id, so the UI can say which gate stopped it", async () => {
  install({
    onWindowsLoopbackPcmChunk: () => () => {},
    startAudioCapture: async () => ({ started: false, riskId: "R5", reason: "consent-required" }),
  });

  const error = await openLoopbackInboundSource({ consentGranted: true }).then(
    () => null,
    (thrown: unknown) => thrown,
  );

  assert.ok(error instanceof LoopbackInboundError);
  assert.equal(error.riskId, "R5");
  assert.equal(error.reason, "consent-required");
});

test("a refusal unsubscribes, so a rejected start leaves no listener behind", async () => {
  let subscribed = 0;
  install({
    onWindowsLoopbackPcmChunk: () => {
      subscribed += 1;
      return () => {
        subscribed -= 1;
      };
    },
    startAudioCapture: async () => ({ started: false, riskId: "R8", reason: "target-process-required" }),
  });

  await openLoopbackInboundSource({ consentGranted: true }).catch(() => undefined);

  assert.equal(subscribed, 0);
});

test("the subscription is in place before capture starts", async () => {
  const order: string[] = [];
  install({
    onWindowsLoopbackPcmChunk: () => {
      order.push("subscribe");
      return () => {};
    },
    startAudioCapture: async () => {
      order.push("start");
      return { started: true };
    },
  });

  await openLoopbackInboundSource({ consentGranted: true });

  // Chunks that arrive between a start and a late subscription are simply dropped, and a bridge
  // missing its opening seconds is much harder to recognise as broken than one that never starts.
  assert.deepEqual(order, ["subscribe", "start"]);
});

test("disposing stops the capture in the main process, and only once", async () => {
  let stops = 0;
  let subscribed = 1;
  install({
    onWindowsLoopbackPcmChunk: () => () => {
      subscribed -= 1;
    },
    startAudioCapture: async () => ({ started: true }),
    stopAudioCapture: async () => {
      stops += 1;
    },
  });

  const handles = await openLoopbackInboundSource({ consentGranted: true });
  await handles.dispose();
  await handles.dispose();

  assert.equal(stops, 1);
  assert.equal(subscribed, 0);
});

test("a desktop build without the capture API is refused, not silently ignored", async () => {
  install({});

  const error = await openLoopbackInboundSource({ consentGranted: true }).then(
    () => null,
    (thrown: unknown) => thrown,
  );

  assert.ok(error instanceof LoopbackInboundError);
});
