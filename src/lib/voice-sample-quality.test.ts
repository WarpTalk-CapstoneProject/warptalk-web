import assert from "node:assert/strict";
import test from "node:test";

import { assessPcmVoiceSample } from "./voice-sample-quality.ts";

const sampleRate = 1_000;

test("rejects a sample that is too short for a voice profile", () => {
  const result = assessPcmVoiceSample(new Float32Array(4 * sampleRate).fill(0.2), sampleRate);
  assert.equal(result.accepted, false);
  assert.match(result.message, /at least 5 seconds/i);
});

test("rejects silence instead of accepting any audio MIME type", () => {
  const result = assessPcmVoiceSample(new Float32Array(10 * sampleRate), sampleRate);
  assert.equal(result.accepted, false);
  assert.match(result.message, /no clear human speech/i);
});

test("rejects heavily clipped recordings", () => {
  const result = assessPcmVoiceSample(new Float32Array(10 * sampleRate).fill(1), sampleRate);
  assert.equal(result.accepted, false);
  assert.match(result.message, /distorted/i);
});

test("rejects a steady tone that has no speech-like energy variation", () => {
  const samples = Float32Array.from(
    { length: 10 * sampleRate },
    (_, index) => Math.sin((index / sampleRate) * Math.PI * 2 * 120) * 0.12,
  );
  const result = assessPcmVoiceSample(samples, sampleRate);
  assert.equal(result.accepted, false);
  assert.match(result.message, /natural speech/i);
});

test("accepts a clear sample with speech-like pauses and energy variation", () => {
  const samples = Float32Array.from(
    { length: 10 * sampleRate },
    (_, index) => {
      const second = index / sampleRate;
      const phraseEnvelope = second % 2 < 1.4 ? 0.06 + 0.08 * Math.abs(Math.sin(second * 3.1)) : 0.004;
      return Math.sin(second * Math.PI * 2 * (110 + 35 * Math.sin(second * 1.7))) * phraseEnvelope;
    },
  );
  const result = assessPcmVoiceSample(samples, sampleRate);
  assert.equal(result.accepted, true);
});
