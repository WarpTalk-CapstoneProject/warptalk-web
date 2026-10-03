/**
 * The Google Meet window as a track the recorder can actually see. WT-910 follow-up.
 *
 * THE BUG
 *   A bridge recording came out solid black for its whole length, with the audio intact. The file
 *   settles it: every frame of the 1280x720 video is luma 0, the template was in its `meet-window`
 *   layout throughout (the grid's light stage never appears), so the egress subscribed to the Meet
 *   window and its <video> never got one decodable frame.
 *
 * WHY THE TRACK STARVES
 *   The desktop captures the Meet window with Windows Graphics Capture, which delivers a frame only
 *   when the window's pixels change (measured on Electron 42: a static window gave 2 frames in 25 s,
 *   and the track never fired `mute`). The window is published before the egress exists — the
 *   picture comes first, then the recording starts — so by the time the recorder subscribes, the
 *   one keyframe is long gone. The SFU marks a screen-share layer stopped after ~2 s without
 *   packets, and a keyframe request can only be answered when the next captured frame arrives. With
 *   simulcast on (the default) there are two such layers to starve.
 *
 * WHAT THIS DOES
 *   `steadyFrameTrack` re-sends the last frame whenever the window has not produced a new one for
 *   MEET_WINDOW_REPEAT_INTERVAL_MS, so the encoder always has something to make a keyframe from and
 *   the SFU never sees the layer go quiet. Measured on Electron 42 against a static window: 2 source
 *   frames became 19-22 output frames in 5 s, with the window's real pixels. Published with one
 *   layer (MEET_WINDOW_PUBLISH_OPTIONS) so there is no second layer to stop.
 *
 *   It runs in the desktop app's main window, which is hidden behind Meet for the whole call. Its
 *   timers are not throttled: the desktop creates it with `backgroundThrottling: false`.
 *
 * CROPPED TO THE PAGE (production recording, 03 Oct)
 *   The capture is the whole browser window, tab strip and address bar included. `visibleRect`, when
 *   given, is asked for every frame written — the live ones AND the repeats, so a layout change
 *   (the bookmarks bar toggled) reaches a static window too — and the frame goes out as a WebCodecs
 *   view of just that area (`new VideoFrame(frame, { visibleRect })`, no pixel copy). The last frame
 *   is kept UNCROPPED, because a visibleRect is always relative to the coded frame, never to a
 *   previous crop. A null answer, or a crop the browser refuses, sends the frame whole: what was
 *   recorded before. See meet-window-crop.ts for how the rectangle is chosen.
 *
 * Where the browser has no insertable streams it hands back the source unchanged, which is exactly
 * the behaviour before this file existed (and uncropped).
 */

import type { TrackPublishOptions } from "livekit-client";

/** The frame floor: a static Meet window still sends 5 frames a second. */
export const MEET_WINDOW_REPEAT_INTERVAL_MS = 200;

/**
 * What the window capture is asked for. 15 fps is plenty for a meeting UI, and the cap keeps a
 * 4K-scaled window from being encoded at full size.
 */
export const MEET_WINDOW_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  frameRate: { ideal: 15, max: 15 },
  width: { max: 1920 },
  height: { max: 1080 },
};

/**
 * How the window is published. One layer, VP8, no backup codec: the recorder is the only
 * subscriber that matters, it always wants the full picture, and every extra layer is one more
 * thing the SFU can mark stopped. `maintain-resolution` because a meeting UI is text and faces at a
 * fixed size; dropping frames is fine, blurring the grid is not.
 */
export const MEET_WINDOW_PUBLISH_OPTIONS = {
  simulcast: false,
  videoCodec: "vp8",
  backupCodec: false,
  screenShareEncoding: { maxBitrate: 2_000_000, maxFramerate: 15 },
  degradationPreference: "maintain-resolution",
} satisfies TrackPublishOptions;

/** Whether the last frame is due to be sent again. Pure, for the tests. */
export function shouldRepeatFrame(
  lastFrameAtMs: number | null,
  nowMs: number,
  intervalMs: number = MEET_WINDOW_REPEAT_INTERVAL_MS,
): boolean {
  if (lastFrameAtMs === null) return false;
  return nowMs - lastFrameAtMs >= intervalMs;
}

export interface SteadyFrameTrack {
  /** What to publish. The source itself when the browser cannot wrap it. */
  track: MediaStreamTrack;
  /** Whether `track` is the wrapper (false: the source, unchanged). */
  wrapped: boolean;
  /** Stops the wrapper and the source. Safe to call twice. */
  stop: () => void;
}

/** A rectangle in a frame's coded pixels (WebCodecs DOMRectInit). */
export interface FrameRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* Insertable streams are Chromium-only and not in the DOM lib this project compiles against. */
interface VideoFrameLike {
  clone(): VideoFrameLike;
  close(): void;
  readonly codedWidth?: number;
  readonly codedHeight?: number;
  readonly visibleRect?: FrameRectLike | null;
}
interface VideoFrameInitLike {
  timestamp?: number;
  visibleRect?: FrameRectLike;
  displayWidth?: number;
  displayHeight?: number;
}
interface InsertableStreamsGlobals {
  MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => {
    readable: ReadableStream<VideoFrameLike>;
  };
  MediaStreamTrackGenerator?: new (init: { kind: "video" }) => MediaStreamTrack & {
    writable: WritableStream<VideoFrameLike>;
  };
  VideoFrame?: new (source: VideoFrameLike, init: VideoFrameInitLike) => VideoFrameLike;
}

/** The frame's own visible area in coded pixels, or null when the frame does not say. */
export function frameVisibleArea(frame: Pick<VideoFrameLike, "codedWidth" | "codedHeight" | "visibleRect">): FrameRectLike | null {
  const rect = frame.visibleRect;
  if (rect && rect.width > 0 && rect.height > 0) return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  const width = frame.codedWidth ?? 0;
  const height = frame.codedHeight ?? 0;
  return width > 0 && height > 0 ? { x: 0, y: 0, width, height } : null;
}

/**
 * Wraps a window-capture track so it never goes quiet. See the file comment.
 *
 * The first frame is waited for before this resolves, so the caller publishes a track whose
 * dimensions are already known (livekit-client sizes the encoding from them).
 */
export async function steadyFrameTrack(
  source: MediaStreamTrack,
  options: {
    intervalMs?: number;
    firstFrameTimeoutMs?: number;
    /**
     * The area of each frame to send, in its coded pixels, or null for the whole frame. Asked for
     * every frame written, repeats included. Must be cheap: it runs up to 15 + 5 times a second.
     */
    visibleRect?: (frame: FrameRectLike) => FrameRectLike | null;
  } = {},
): Promise<SteadyFrameTrack> {
  const intervalMs = options.intervalMs ?? MEET_WINDOW_REPEAT_INTERVAL_MS;
  const g = globalThis as unknown as InsertableStreamsGlobals;
  const Processor = g.MediaStreamTrackProcessor;
  const Generator = g.MediaStreamTrackGenerator;
  const Frame = g.VideoFrame;
  if (!Processor || !Generator || !Frame) {
    return { track: source, wrapped: false, stop: () => source.stop() };
  }

  const reader = new Processor({ track: source }).readable.getReader();
  const generator = new Generator({ kind: "video" });
  const writer = generator.writable.getWriter();

  let stopped = false;
  let last: VideoFrameLike | null = null;
  let lastAtMs: number | null = null;
  let markFirstFrame: () => void = () => {};
  const firstFrame = new Promise<void>((resolve) => {
    markFirstFrame = resolve;
  });

  const write = (frame: VideoFrameLike) => {
    // A write after stop, or into a generator the consumer ended, must not throw into a timer.
    writer.write(frame).catch(() => frame.close());
  };

  /**
   * The frame to send for `base`: a view of the crop, or `base` whole. Never throws, and never
   * closes `base` (the caller owns it). `timestamp` is set for a repeat, which needs a fresh one.
   */
  const shape = (base: VideoFrameLike, timestamp?: number): VideoFrameLike => {
    const stamp = timestamp === undefined ? {} : { timestamp };
    let rect: FrameRectLike | null = null;
    if (options.visibleRect) {
      const area = frameVisibleArea(base);
      try {
        rect = area ? options.visibleRect(area) : null;
      } catch {
        rect = null;
      }
    }
    if (rect) {
      try {
        return new Frame(base, { ...stamp, visibleRect: rect, displayWidth: rect.width, displayHeight: rect.height });
      } catch {
        // The browser refused this rectangle (alignment, bounds): send the frame whole.
      }
    }
    return timestamp === undefined ? base.clone() : new Frame(base, stamp);
  };

  void (async () => {
    while (!stopped) {
      let result: ReadableStreamReadResult<VideoFrameLike>;
      try {
        result = await reader.read();
      } catch {
        break;
      }
      if (result.done || stopped) {
        result.value?.close();
        break;
      }
      last?.close();
      // Kept whole: a later crop is relative to the coded frame, not to an earlier crop.
      last = result.value;
      lastAtMs = performance.now();
      write(shape(result.value));
      markFirstFrame();
    }
  })();

  const timer = setInterval(() => {
    if (stopped || !last || !shouldRepeatFrame(lastAtMs, performance.now(), intervalMs)) return;
    lastAtMs = performance.now();
    // A fresh timestamp: the encoder drops a frame that claims the same moment as the last one.
    write(shape(last, Math.round(performance.now() * 1000)));
  }, Math.max(20, Math.floor(intervalMs / 4)));

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    last?.close();
    last = null;
    void reader.cancel().catch(() => {});
    void writer.close().catch(() => {});
    generator.stop();
    source.stop();
  };

  // Never hang the publish on a window that never paints: after the timeout, publish anyway and
  // let livekit-client fall back to its default dimensions.
  await Promise.race([
    firstFrame,
    new Promise<void>((resolve) => setTimeout(resolve, options.firstFrameTimeoutMs ?? 3_000)),
  ]);

  return { track: generator, wrapped: true, stop };
}
