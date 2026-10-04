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
  frameVisibleArea,
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

// ── the crop (production recording, 03 Oct: the whole Chrome window was recorded) ────────────

type Rect = { x: number; y: number; width: number; height: number };

/** A stand-in VideoFrame: remembers what it was made from and how, and whether it was closed. */
class FakeFrame {
  static made: FakeFrame[] = [];
  static refuse = false;
  closed = false;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly visibleRect: Rect;
  readonly timestamp: number;
  readonly from: FakeFrame | null;
  readonly init: Record<string, unknown> | null;
  constructor(source: FakeFrame | { codedWidth: number; codedHeight: number; timestamp: number }, init?: Record<string, unknown>) {
    if (init?.visibleRect && FakeFrame.refuse) throw new TypeError("visibleRect refused");
    const base = source as FakeFrame;
    this.codedWidth = base.codedWidth;
    this.codedHeight = base.codedHeight;
    this.visibleRect = (init?.visibleRect as Rect) ?? base.visibleRect ?? { x: 0, y: 0, width: base.codedWidth, height: base.codedHeight };
    this.timestamp = (init?.timestamp as number) ?? base.timestamp;
    this.from = source instanceof FakeFrame ? source : null;
    this.init = init ?? null;
    if (init) FakeFrame.made.push(this);
  }
  clone() {
    return new FakeFrame(this);
  }
  close() {
    this.closed = true;
  }
}

/** Insertable streams over a queue the test pushes frames into, and a list of what was written. */
function installFakeInsertableStreams() {
  const written: FakeFrame[] = [];
  let push: (frame: FakeFrame) => void = () => {};
  const g = globalThis as Record<string, unknown>;
  g.VideoFrame = FakeFrame;
  g.MediaStreamTrackProcessor = class {
    readable = new ReadableStream<FakeFrame>({
      start(controller) {
        push = (frame) => controller.enqueue(frame);
      },
    });
  };
  g.MediaStreamTrackGenerator = class {
    kind = "video";
    writable = new WritableStream<FakeFrame>({ write: (frame) => void written.push(frame) });
    stop() {}
  };
  return {
    written,
    push: (frame: FakeFrame) => push(frame),
    uninstall: () => {
      delete g.VideoFrame;
      delete g.MediaStreamTrackProcessor;
      delete g.MediaStreamTrackGenerator;
      FakeFrame.made = [];
      FakeFrame.refuse = false;
    },
  };
}

const sourceFrame = (timestamp: number) => new FakeFrame({ codedWidth: 1286, codedHeight: 800, timestamp });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fakeSource = () => ({ kind: "video", stop: () => {} }) as unknown as MediaStreamTrack;

test("frames, live and repeated, go out as views of the crop; the kept frame stays whole", async () => {
  const fake = installFakeInsertableStreams();
  try {
    let crop: Rect | null = { x: 0, y: 116, width: 1286, height: 684 };
    const asked: Rect[] = [];
    const steady = await steadyFrameTrack(fakeSource(), {
      intervalMs: 40,
      firstFrameTimeoutMs: 50,
      visibleRect: (frame) => {
        asked.push(frame);
        return crop;
      },
    });
    const live = sourceFrame(1);
    fake.push(live);
    await sleep(20);
    assert.equal(fake.written.length, 1);
    assert.deepEqual(fake.written[0].visibleRect, { x: 0, y: 116, width: 1286, height: 684 });
    assert.equal(fake.written[0].init?.displayWidth, 1286);
    assert.equal(fake.written[0].init?.displayHeight, 684);
    // Asked with the WHOLE frame's area, not an earlier crop.
    assert.deepEqual(asked[0], { x: 0, y: 0, width: 1286, height: 800 });

    // The bookmarks bar hidden while the window sits still: the next repeat already has it.
    crop = { x: 0, y: 86, width: 1286, height: 714 };
    await sleep(70);
    const repeats = fake.written.slice(1);
    assert.ok(repeats.length >= 1, "a static window still repeats");
    const lastRepeat = repeats[repeats.length - 1];
    assert.deepEqual(lastRepeat.visibleRect, { x: 0, y: 86, width: 1286, height: 714 });
    // Made from the kept, uncropped source frame, with a fresh timestamp.
    assert.equal(lastRepeat.from, live);
    assert.notEqual(lastRepeat.timestamp, 1);
    for (const rect of asked) assert.deepEqual(rect, { x: 0, y: 0, width: 1286, height: 800 });

    // No crop any more (no layout): whole frames, as before.
    crop = null;
    await sleep(70);
    const whole = fake.written[fake.written.length - 1];
    assert.deepEqual(whole.visibleRect, { x: 0, y: 0, width: 1286, height: 800 });
    steady.stop();
    assert.equal(live.closed, true, "the kept frame is released on stop");
  } finally {
    fake.uninstall();
  }
});

test("a crop the browser refuses, or a crop callback that throws, sends the frame whole", async () => {
  const fake = installFakeInsertableStreams();
  try {
    FakeFrame.refuse = true;
    const steady = await steadyFrameTrack(fakeSource(), {
      intervalMs: 1_000,
      firstFrameTimeoutMs: 50,
      visibleRect: () => ({ x: 1, y: 115, width: 1285, height: 685 }),
    });
    fake.push(sourceFrame(1));
    await sleep(20);
    assert.equal(fake.written.length, 1);
    assert.deepEqual(fake.written[0].visibleRect, { x: 0, y: 0, width: 1286, height: 800 });
    steady.stop();

    FakeFrame.refuse = false;
    const throwing = await steadyFrameTrack(fakeSource(), {
      intervalMs: 1_000,
      firstFrameTimeoutMs: 50,
      visibleRect: () => {
        throw new Error("bad layout");
      },
    });
    fake.push(sourceFrame(2));
    await sleep(20);
    assert.deepEqual(fake.written[fake.written.length - 1].visibleRect, { x: 0, y: 0, width: 1286, height: 800 });
    throwing.stop();
  } finally {
    fake.uninstall();
  }
});

test("a frame's visible area: its visibleRect, else its coded size, else unknown", () => {
  assert.deepEqual(frameVisibleArea({ codedWidth: 1296, codedHeight: 800, visibleRect: { x: 0, y: 0, width: 1286, height: 800 } }), {
    x: 0,
    y: 0,
    width: 1286,
    height: 800,
  });
  assert.deepEqual(frameVisibleArea({ codedWidth: 640, codedHeight: 360, visibleRect: null }), { x: 0, y: 0, width: 640, height: 360 });
  assert.equal(frameVisibleArea({}), null);
});
