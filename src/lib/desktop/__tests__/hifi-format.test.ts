/**
 * Hi-Fi Cable format checks.
 *
 * The expensive mistake in both directions: warning about a mismatch we cannot actually see (one
 * side unread) sends the user into Sound settings for nothing, and treating a missing desktop
 * method as a failure shows an error where manual steps belong. Both are pinned here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { DesktopBridge, VirtualAudioStatus } from "../bridge.ts";
import {
  alignHiFiCableFormatViaDesktop,
  describeHiFiFormat,
  hifiFormatMismatch,
} from "../hifi-format.ts";

const F48_24 = { sampleRate: 48000, bitsPerSample: 24, channels: 2 };
const F44_16 = { sampleRate: 44100, bitsPerSample: 16, channels: 2 };
const F48_16 = { sampleRate: 48000, bitsPerSample: 16, channels: 2 };

function status(overrides: Partial<VirtualAudioStatus> = {}): VirtualAudioStatus {
  return { platform: "win32", supported: true, devices: [], ready: true, foreignDrivers: [], ...overrides };
}

function withBridge(bridge: DesktopBridge | undefined, run: () => Promise<void>): Promise<void> {
  const g = globalThis as { window?: unknown };
  const previous = g.window;
  g.window = bridge ? { warptalk: bridge } : {};
  return run().finally(() => {
    g.window = previous;
  });
}

test("describes a format in the words Windows' Advanced tab uses", () => {
  assert.equal(describeHiFiFormat(F48_24), "24-bit, 48000 Hz");
  assert.equal(describeHiFiFormat(null), "unknown");
});

test("the desktop's own flag wins over the mirrored comparison", () => {
  assert.equal(hifiFormatMismatch(status({ hifiFormatMismatch: true, hifiFormat: { input: F48_24, output: F48_24 } })), true);
  assert.equal(hifiFormatMismatch(status({ hifiFormatMismatch: false, hifiFormat: { input: F48_24, output: F44_16 } })), false);
});

test("without the flag, rate or depth alone is a mismatch", () => {
  assert.equal(hifiFormatMismatch(status({ hifiFormat: { input: F48_24, output: F44_16 } })), true);
  assert.equal(hifiFormatMismatch(status({ hifiFormat: { input: F48_24, output: F48_16 } })), true);
  assert.equal(hifiFormatMismatch(status({ hifiFormat: { input: F48_24, output: { ...F48_24, channels: 8 } } })), false);
});

test("one unread side, no data, or no status is never a mismatch", () => {
  assert.equal(hifiFormatMismatch(status({ hifiFormat: { input: F48_24, output: null } })), false);
  assert.equal(hifiFormatMismatch(status()), false);
  assert.equal(hifiFormatMismatch(null), false);
});

test("a bridge without the method is unsupported, not a failure", async () => {
  await withBridge({}, async () => {
    assert.deepEqual(await alignHiFiCableFormatViaDesktop(), { kind: "unsupported" });
  });
  await withBridge(undefined, async () => {
    assert.deepEqual(await alignHiFiCableFormatViaDesktop(), { kind: "unsupported" });
  });
});

test("passes the desktop's result through", async () => {
  const result = { ok: true, before: { input: F48_24, output: F44_16 }, after: { input: F48_24, output: F48_24 } };
  await withBridge({ alignHiFiCableFormat: async () => result }, async () => {
    assert.deepEqual(await alignHiFiCableFormatViaDesktop(), { kind: "result", ...result });
  });
});

test("a rejected call becomes ok:false with its message", async () => {
  await withBridge(
    {
      alignHiFiCableFormat: async () => {
        throw new Error("access denied");
      },
    },
    async () => {
      const outcome = await alignHiFiCableFormatViaDesktop();
      assert.equal(outcome.kind, "result");
      if (outcome.kind !== "result") return;
      assert.equal(outcome.ok, false);
      assert.equal(outcome.error, "access denied");
    },
  );
});
