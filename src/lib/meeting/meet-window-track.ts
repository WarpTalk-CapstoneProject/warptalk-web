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
 * Where the browser has no insertable streams it hands back the source unchanged, which is exactly
 * the behaviour before this file existed.
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

/* Insertable streams are Chromium-only and not in the DOM lib this project compiles against. */
interface VideoFrameLike {
  clone(): VideoFrameLike;
  close(): void;
}
interface InsertableStreamsGlobals {
  MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => {
    readable: ReadableStream<VideoFrameLike>;
  };
  MediaStreamTrackGenerator?: new (init: { kind: "video" }) => MediaStreamTrack & {
    writable: WritableStream<VideoFrameLike>;
  };
  VideoFrame?: new (source: VideoFrameLike, init: { timestamp: number }) => VideoFrameLike;
}

/**
 * Wraps a window-capture track so it never goes quiet. See the file comment.
 *
 * The first frame is waited for before this resolves, so the caller publishes a track whose
 * dimensions are already known (livekit-client sizes the encoding from them).
 */
export async function steadyFrameTrack(
  source: MediaStreamTrack,
  options: { intervalMs?: number; firstFrameTimeoutMs?: number } = {},
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
      last = result.value.clone();
      lastAtMs = performance.now();
      write(result.value);
      markFirstFrame();
    }
  })();

  const timer = setInterval(() => {
    if (stopped || !last || !shouldRepeatFrame(lastAtMs, performance.now(), intervalMs)) return;
    lastAtMs = performance.now();
    // A fresh timestamp: the encoder drops a frame that claims the same moment as the last one.
    write(new Frame(last, { timestamp: Math.round(performance.now() * 1000) }));
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
