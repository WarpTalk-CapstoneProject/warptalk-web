/**
 * The Google Meet window, published so the recorder always has a picture to decode. WT-910
 * follow-up: a bridge recording came out solid black from start to end, audio intact.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MEET_WINDOW_CAPTURE_CONSTRAINTS,
  MEET_WINDOW_PUBLISH_OPTIONS,
  MEET_WINDOW_REPEAT_INTERVAL_MS,
  shouldRepeatFrame,
  steadyFrameTrack,
} from "../meet-window-track.ts";

test("the window is published as one VP8 layer with no backup codec", () => {
  // Every extra layer is one more thing the SFU can mark stopped while the window sits still.
  assert.equal(MEET_WINDOW_PUBLISH_OPTIONS.simulcast, false);
  assert.equal(MEET_WINDOW_PUBLISH_OPTIONS.videoCodec, "vp8");
  assert.equal(MEET_WINDOW_PUBLISH_OPTIONS.backupCodec, false);
  assert.equal(MEET_WINDOW_PUBLISH_OPTIONS.degradationPreference, "maintain-resolution");
  assert.equal(MEET_WINDOW_PUBLISH_OPTIONS.screenShareEncoding.maxFramerate, 15);
});

test("the capture is capped at 15 fps and 1080p", () => {
  assert.deepEqual(MEET_WINDOW_CAPTURE_CONSTRAINTS.frameRate, { ideal: 15, max: 15 });
  assert.deepEqual(MEET_WINDOW_CAPTURE_CONSTRAINTS.width, { max: 1920 });
  assert.deepEqual(MEET_WINDOW_CAPTURE_CONSTRAINTS.height, { max: 1080 });
});

test("a static window still sends at least 5 frames a second", () => {
  assert.equal(MEET_WINDOW_REPEAT_INTERVAL_MS, 200);
  assert.equal(shouldRepeatFrame(1_000, 1_199), false);
  assert.equal(shouldRepeatFrame(1_000, 1_200), true);
  assert.equal(shouldRepeatFrame(1_000, 5_000), true);
});

test("nothing is repeated before the window's first frame", () => {
  // There is no picture to repeat yet, and a made-up one would be a black frame.
  assert.equal(shouldRepeatFrame(null, 10_000), false);
});

test("without insertable streams the source is published unchanged, as before", async () => {
  // Node has no MediaStreamTrackProcessor; neither would a browser without insertable streams.
  let stops = 0;
  const source = { kind: "video", stop: () => stops++ } as unknown as MediaStreamTrack;

  const steady = await steadyFrameTrack(source);

  assert.equal(steady.track, source);
  assert.equal(steady.wrapped, false);
  steady.stop();
  assert.equal(stops, 1);
});
