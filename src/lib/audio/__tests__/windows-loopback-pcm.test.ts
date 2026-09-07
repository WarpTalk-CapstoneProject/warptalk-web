import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeS16lePcmChunk,
  WindowsLoopbackPcmTrackBridge,
  type WindowsLoopbackPcmFrame,
} from "../windows-loopback-pcm.ts";

/**
 * A clock and a scheduler, which is all these tests are about.
 *
 * The previous suite tested only the pure gap-planning helper and stubbed `createBuffer()` to
 * return `{ duration: 0 }` — so `nextStartTimeSeconds` never advanced in any test, and the
 * scheduling arithmetic was invisible. That is why a defect that put the whole inbound leg
 * permanently behind could sit in this file with every test green. The fake below reports real
 * durations and lets a test advance the clock, so the arithmetic is the thing under test.
 */
function fakeAudioContext() {
  let currentTime = 0;
  const startedAt: number[] = [];
  let closed = false;
  let trackStopped = false;

  const context = {
    get currentTime() {
      return currentTime;
    },
    createMediaStreamDestination() {
      return {
        stream: {
          getAudioTracks: () => [
            {
              stop() {
                trackStopped = true;
              },
            },
          ],
        },
      };
    },
    createBuffer(channelCount: number, length: number, sampleRate: number) {
      return {
        duration: length / sampleRate,
        numberOfChannels: channelCount,
        length,
        getChannelData: () => new Float32Array(length),
      };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start(when: number) {
          startedAt.push(when);
        },
      };
    },
    close() {
      closed = true;
      return Promise.resolve();
    },
  };

  return {
    context: context as unknown as AudioContext,
    advance(seconds: number) {
      currentTime += seconds;
    },
    startedAt,
    get closed() {
      return closed;
    },
    get trackStopped() {
      return trackStopped;
    },
  };
}

/** One 10 ms stereo frame at 48 kHz, the cadence WASAPI shared mode actually delivers. */
function frame(capturedAtMs: number): WindowsLoopbackPcmFrame {
  return {
    samples: new Float32Array(480 * 2),
    sampleRate: 48000,
    channelCount: 2,
    capturedAtMs,
  };
}

test("consecutive frames are scheduled back to back", () => {
  const fake = fakeAudioContext();
  const bridge = new WindowsLoopbackPcmTrackBridge({ audioContext: fake.context });

  bridge.pushFrame(frame(1000));
  bridge.pushFrame(frame(1010));
  bridge.pushFrame(frame(1020));

  assert.deepEqual(fake.startedAt, [0, 0.01, 0.02]);
});

/**
 * The regression this file exists for.
 *
 * A silence gap used to be filled with a synthesised buffer of the same length, which pushed the
 * next real frame a full gap into the future and never gave the time back. Latency converged on
 * the longest silence in the meeting. The frame after a gap must start NOW, not one gap from now.
 */
test("a frame after a long silence starts immediately, not one gap later", () => {
  const fake = fakeAudioContext();
  const bridge = new WindowsLoopbackPcmTrackBridge({ audioContext: fake.context });

  bridge.pushFrame(frame(1000));
  // Sixty seconds in which the browser rendered nothing, so no chunk arrived.
  fake.advance(60);
  bridge.pushFrame(frame(61_000));

  assert.deepEqual(fake.startedAt, [0, 60]);
});

test("latency does not accumulate across repeated gaps", () => {
  const fake = fakeAudioContext();
  const bridge = new WindowsLoopbackPcmTrackBridge({ audioContext: fake.context });

  for (let gap = 0; gap < 3; gap += 1) {
    bridge.pushFrame(frame(gap * 10_000));
    fake.advance(10);
  }

  // Every frame lands at the clock reading of its own moment. Under the old padding it would have
  // been 0, 10, then 20 seconds late and climbing.
  assert.deepEqual(fake.startedAt, [0, 10, 20]);
});

test("a burst arriving faster than real time still plays in order without overlap", () => {
  const fake = fakeAudioContext();
  const bridge = new WindowsLoopbackPcmTrackBridge({ audioContext: fake.context });

  // Four frames delivered in one IPC turn: the clock has not moved between them.
  for (let index = 0; index < 4; index += 1) bridge.pushFrame(frame(1000 + index * 10));

  assert.deepEqual(fake.startedAt, [0, 0.01, 0.02, 0.03]);
});

test("closing stops the track and releases a context it created", () => {
  const fake = fakeAudioContext();
  const bridge = new WindowsLoopbackPcmTrackBridge({ audioContext: fake.context });

  bridge.close();

  assert.equal(fake.trackStopped, true);
  // Injected, so it belongs to the caller and must survive.
  assert.equal(fake.closed, false);
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
