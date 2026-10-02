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
  shouldFallBackFromMeetSighting,
} from "../bridge-inbound-source.ts";

interface FakeBridge {
  startAudioCapture?: (request?: unknown) => Promise<unknown>;
  stopAudioCapture?: () => Promise<void>;
  onWindowsLoopbackPcmChunk?: (callback: (chunk: unknown) => void) => () => void;
  getCaptureState?: () => Promise<unknown>;
  onAudioCaptureStopped?: (callback: (event: { reason: string }) => void) => () => void;
}

// Cast through `unknown` to a bag of properties. Typing this as `typeof globalThis` fights the DOM
// lib on every line — `window` is declared non-optional there, so `delete` is rejected, and a stub
// standing in for AudioContext can never satisfy its 30-odd members. The test needs to set two
// globals and put them back, not to model the browser.
const globals = globalThis as unknown as Record<string, unknown>;

/** Enough of an AudioContext for the PCM bridge to build a track it never has to play. */
class StubAudioContext {
  /**
   * Counted across instances, because the bridge constructs its own context from this global and
   * the test never gets a handle on it. Releasing that context is what stops a few join/leave
   * cycles from exhausting the browser's AudioContext budget, so it is worth asserting rather
   * than assuming.
   */
  static closes = 0;

  destination = {};
  currentTime = 0;

  close(): Promise<void> {
    StubAudioContext.closes += 1;
    return Promise.resolve();
  }

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
  StubAudioContext.closes = 0;
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
  // The context the bridge created is released with everything else. It used to survive, and a
  // handful of join/leave cycles then failed at construction with a message naming the wrong cause.
  assert.equal(StubAudioContext.closes, 1);
});

test("a desktop build without the capture API is refused, not silently ignored", async () => {
  install({});

  const error = await openLoopbackInboundSource({ consentGranted: true }).then(
    () => null,
    (thrown: unknown) => thrown,
  );

  assert.ok(error instanceof LoopbackInboundError);
});

// --- capture target: the desktop's Meet sighting first, the picked window as the fallback -------

/** A desktop build with the capture-target API, answering the sighting attempt with `sighting`. */
function sightingDesktop(sighting: { started: boolean; riskId?: string; reason?: string }) {
  const requests: Array<Record<string, unknown>> = [];
  const stoppedListeners = new Set<(event: { reason: string }) => void>();
  const bridge: FakeBridge = {
    onWindowsLoopbackPcmChunk: () => () => {},
    getCaptureState: async () => ({ capturing: false, mode: null, targetProcessId: null, startedVia: null }),
    onAudioCaptureStopped: (callback) => {
      stoppedListeners.add(callback);
      return () => stoppedListeners.delete(callback);
    },
    startAudioCapture: async (request) => {
      const asked = { ...(request as Record<string, unknown>) };
      requests.push(asked);
      return asked.target === "meet-sighting" ? sighting : { started: true };
    },
    stopAudioCapture: async () => undefined,
  };
  return { bridge, requests, stoppedListeners };
}

test("a desktop that supports it is asked for the Meet sighting first, with the stop opted in", async () => {
  const desktop = sightingDesktop({ started: true });
  install(desktop.bridge);

  const handles = await openLoopbackInboundSource({
    consentGranted: true,
    sourceId: "window:1:0",
    preferMeetSighting: true,
    onCaptureStopped: () => {},
  });

  assert.equal(desktop.requests.length, 1);
  assert.equal(desktop.requests[0].target, "meet-sighting");
  assert.equal(desktop.requests[0].stopWhenMeetGone, true);
  assert.equal(desktop.requests[0].consentGranted, true);
  assert.equal(handles.capturedVia, "meet-sighting");
});

test("no sighting falls back to the picked window, which the desktop never stops on its own", async () => {
  for (const reason of ["meet-sighting-missing", "meet-sighting-no-process"]) {
    const desktop = sightingDesktop({ started: false, riskId: "R8", reason });
    install(desktop.bridge);

    const handles = await openLoopbackInboundSource({
      consentGranted: true,
      sourceId: "window:1:0",
      preferMeetSighting: true,
      onCaptureStopped: () => {},
    });

    assert.equal(desktop.requests.length, 2);
    assert.equal(desktop.requests[1].target, undefined);
    assert.equal(desktop.requests[1].stopWhenMeetGone, undefined);
    assert.equal(desktop.requests[1].sourceId, "window:1:0");
    assert.equal(handles.capturedVia, "picker");
    // The stop listener went with the sighting attempt.
    assert.equal(desktop.stoppedListeners.size, 0);
  }
});

test("a refusal the picked window would get too (consent) is not retried", async () => {
  const desktop = sightingDesktop({ started: false, riskId: "R5", reason: "consent-required" });
  install(desktop.bridge);

  const error = await openLoopbackInboundSource({
    consentGranted: true,
    sourceId: "window:1:0",
    preferMeetSighting: true,
  }).then(
    () => null,
    (thrown: unknown) => thrown,
  );

  assert.ok(error instanceof LoopbackInboundError);
  assert.equal(error.reason, "consent-required");
  assert.equal(desktop.requests.length, 1);
});

test("an older desktop (no capture-target API) is asked exactly as before", async () => {
  const requests: Array<Record<string, unknown>> = [];
  install({
    onWindowsLoopbackPcmChunk: () => () => {},
    startAudioCapture: async (request) => {
      requests.push({ ...(request as Record<string, unknown>) });
      return { started: true };
    },
  });

  const handles = await openLoopbackInboundSource({
    consentGranted: true,
    sourceId: "window:1:0",
    preferMeetSighting: true,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].target, undefined);
  assert.equal(requests[0].sourceId, "window:1:0");
  assert.equal(handles.capturedVia, "picker");
});

test("an older desktop that ignores `target` and says target-process-required counts as a fallback", () => {
  assert.equal(
    shouldFallBackFromMeetSighting({ started: false, riskId: "R8", reason: "target-process-required" }),
    true,
  );
  assert.equal(shouldFallBackFromMeetSighting({ started: false, riskId: "R1", reason: "target-is-warptalk" }), false);
  assert.equal(shouldFallBackFromMeetSighting({ started: true }), false);
});

test("the desktop stopping a sighting capture reaches the caller, and not after dispose", async () => {
  const desktop = sightingDesktop({ started: true });
  install(desktop.bridge);
  const stops: string[] = [];

  const handles = await openLoopbackInboundSource({
    consentGranted: true,
    sourceId: "window:1:0",
    preferMeetSighting: true,
    onCaptureStopped: (reason) => stops.push(reason),
  });
  for (const listener of desktop.stoppedListeners) listener({ reason: "meet-gone" });
  assert.deepEqual(stops, ["meet-gone"]);

  await handles.dispose();
  assert.equal(desktop.stoppedListeners.size, 0);
});
