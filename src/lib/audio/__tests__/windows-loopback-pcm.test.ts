import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeS16lePcmChunk,
  planSilencePadding,
  type WindowsLoopbackPcmFrame,
} from "../windows-loopback-pcm.ts";

function frame(overrides: Partial<WindowsLoopbackPcmFrame> = {}): WindowsLoopbackPcmFrame {
  return {
    samples: new Float32Array(480),
    sampleRate: 48000,
    channelCount: 1,
    capturedAtMs: 0,
    ...overrides,
  };
}

test("does not insert silence before the first Windows loopback PCM frame", () => {
  assert.equal(planSilencePadding(null, frame()), null);
});

test("does not insert silence for continuous PCM frames", () => {
  const previous = frame({ capturedAtMs: 1000 });
  const next = frame({ capturedAtMs: 1010 });

  assert.equal(planSilencePadding(previous, next), null);
});

test("plans silence for no-packet gaps so the STT timeline stays continuous", () => {
  const previous = frame({ capturedAtMs: 1000 });
  const next = frame({ capturedAtMs: 1060 });

  assert.deepEqual(planSilencePadding(previous, next), {
    startsAtMs: 1010,
    durationMs: 50,
    sampleCount: 2400,
  });
});

test("does not bridge silence across format changes", () => {
  const previous = frame({ capturedAtMs: 1000, channelCount: 2, samples: new Float32Array(960) });
  const next = frame({ capturedAtMs: 1060, channelCount: 1 });

  assert.equal(planSilencePadding(previous, next), null);
});

test("decodes native s16le PCM chunks into float frames for Web Audio", () => {
  const decoded = decodeS16lePcmChunk({
    data: new Uint8Array([0, 0, 255, 127, 0, 128, 255, 255]),
    format: "s16le",
    sampleRate: 48000,
    channelCount: 2,
    capturedAtMs: 1234,
  });

  assert.equal(decoded.sampleRate, 48000);
  assert.equal(decoded.channelCount, 2);
  assert.equal(decoded.capturedAtMs, 1234);
  assert.equal(decoded.samples[0], 0);
  assert.equal(decoded.samples[1], 1);
  assert.equal(decoded.samples[2], -1);
  assert.ok(decoded.samples[3] < 0);
});
