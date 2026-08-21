"use client";

import { useEffect, useRef } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { LocalAudioTrack, LocalVideoTrack } from "livekit-client";
import { KrispNoiseFilter, isKrispNoiseFilterSupported, type KrispNoiseFilterProcessor } from "@livekit/krisp-noise-filter";
import { BackgroundProcessor, type BackgroundProcessorWrapper } from "@livekit/track-processors";
import { NOISE_SUPPRESSION_PREFERENCE_VERSION } from "@/lib/meeting/track-effects-preferences";

const DEVICE_PREVIEW_KEY = "warptalk.devices.preview";
const BLUR_RADIUS = 10;

export interface TrackEffectsPreferences {
  noiseSuppressionEnabled: boolean;
  backgroundBlurEnabled: boolean;
  onNoiseSuppressionError?: (error: unknown) => void;
  /** Reported when the blur processor could not be attached. Omit to fail silently (do not). */
  onBackgroundBlurError?: (error: unknown) => void;
}

/**
 * Merges a noise-suppression/background-blur choice into the same sessionStorage entry
 * that already carries cameraEnabled/microphoneEnabled (see join/page.tsx,
 * setup-room-modal.tsx, room/[id]/page.tsx) so it survives a refresh and carries from
 * pre-join into the live call, same as the existing device toggles.
 */
export function writeTrackEffectsPreferences(prefs: Partial<TrackEffectsPreferences>) {
  if (typeof window === "undefined") return;
  const existing = JSON.parse(window.sessionStorage.getItem(DEVICE_PREVIEW_KEY) || "{}");
  const versionedPrefs =
    "noiseSuppressionEnabled" in prefs
      ? {
          ...prefs,
          noiseSuppressionPreferenceVersion:
            NOISE_SUPPRESSION_PREFERENCE_VERSION,
        }
      : prefs;
  window.sessionStorage.setItem(
    DEVICE_PREVIEW_KEY,
    JSON.stringify({ ...existing, ...versionedPrefs }),
  );
}

/**
 * Applies/removes the Krisp noise-filter and background-blur LiveKit track processors on
 * the local participant's published mic/camera tracks. Must be mounted under <LiveKitRoom>
 * (or anything under RoomContext) — it reads the local track publications via
 * useLocalParticipant().
 *
 * Processors are applied post-publish via track.setProcessor() rather than as a capture
 * option: the initial camera/mic publish is owned declaratively by <LiveKitRoom
 * video/audio> in page.tsx, so this hook only needs to react afterwards, whenever a
 * toggle changes or the underlying track is re-published (e.g. camera/mic turned back on).
 */
export function useTrackProcessors({
  noiseSuppressionEnabled,
  backgroundBlurEnabled,
  onNoiseSuppressionError,
  onBackgroundBlurError,
}: TrackEffectsPreferences) {
  const { microphoneTrack, cameraTrack } = useLocalParticipant();
  const krispRef = useRef<KrispNoiseFilterProcessor | null>(null);
  const blurRef = useRef<BackgroundProcessorWrapper | null>(null);
  const microphoneTrackSid = microphoneTrack?.trackSid;
  const cameraTrackSid = cameraTrack?.trackSid;

  useEffect(() => {
    const track = microphoneTrack?.track;
    if (!(track instanceof LocalAudioTrack)) return;
    const localAudioTrack = track;

    let cancelled = false;

    /**
     * Run exactly one denoiser. Krisp wants AEC/AGC audio WITHOUT the browser's own suppression
     * or voice isolation — stacking all three distorted the production mic PCM — so the browser's
     * pair is switched off only while Krisp is actually carrying the load.
     */
    async function setBrowserSuppression(enabled: boolean) {
      await localAudioTrack.mediaStreamTrack.applyConstraints({
        echoCancellation: true,
        noiseSuppression: enabled,
        voiceIsolation: enabled,
        autoGainControl: true,
        channelCount: 1,
      } as MediaTrackConstraints & { voiceIsolation: boolean });
    }

    async function applyNoiseProcessor() {
      // ORDER IS LOAD-BEARING, and getting it wrong was the whole bug.
      //
      // This used to disable the browser's suppression FIRST and attach Krisp second, with no
      // rollback when the second step threw. Krisp is WebAssembly, and production's CSP was
      // missing 'wasm-unsafe-eval', so it threw every time — leaving the microphone with the
      // browser's denoiser switched off and Krisp not running. Turning noise suppression ON made
      // the audio strictly WORSE than leaving it off, while the toast said "browser noise
      // suppression remains enabled". It did not.
      //
      // Krisp attaches first now. The browser's pair is only stood down once there is something
      // to stand down for, and is restored if anything fails.
      if (!noiseSuppressionEnabled) {
        try {
          if (localAudioTrack.getProcessor()) await localAudioTrack.stopProcessor();
        } finally {
          // Dropped, not kept. A stopped Krisp processor has released its WASM pipeline, and
          // re-attaching that same instance is not something the library promises — LiveKit's own
          // documented example constructs a fresh KrispNoiseFilter() inside every
          // LocalTrackPublished handler.
          //
          // This ref was created once and never cleared: not on stop, not on a track change, not
          // on failure. So the FIRST enable of a session could work and every later one attached a
          // spent processor, which reports itself as not enabled — and since WT-320 this hook
          // treats "attached but not enabled" as an error, that is a toggle that refuses to stay
          // on for the rest of the meeting.
          //
          // The blur processor below already does this, and its comment says why in almost these
          // words. The lesson was learned on the newer of the two processors and never applied
          // back to the one that had the earlier ticket.
          krispRef.current = null;
          await setBrowserSuppression(true);
        }
        return;
      }

      if (!isKrispNoiseFilterSupported()) {
        // Not an error: some browsers simply cannot run it. The browser's own suppression stays
        // on, which is the best available, and nothing is reported as broken.
        await setBrowserSuppression(true);
        return;
      }

      try {
        if (!krispRef.current) krispRef.current = KrispNoiseFilter();
        const krisp = krispRef.current;
        await localAudioTrack.setProcessor(krisp);

        // ATTACHING IS NOT RUNNING, and this is the half a throw cannot tell you about.
        //
        // setProcessor() awaits init(), which only fetches a public model manifest — it does not
        // check whether this LiveKit project may actually run Krisp. Enabling happens later in
        // onPublish() → setEnabled(), which asks the server and, when the answer is no, LOGS AND
        // RETURNS FALSE. livekit-client calls onPublish un-awaited and un-caught, so nothing
        // rejects, no catch fires, and the toggle sits there lit while the filter is inert.
        //
        // Catching the throw (WASM blocked by CSP) fixed the loud failure and left this silent
        // one exactly as it was: browser suppression surrendered for a processor that is not
        // running. It is also what Firefox and Safari do, where Krisp is simply unsupported.
        //
        // So the browser's denoiser is stood down only against Krisp's own answer.
        await krisp.setEnabled(true);
        if (!krisp.isEnabled()) {
          throw new Error(
            "Krisp attached but did not enable — this LiveKit project or browser cannot run it.",
          );
        }

        await setBrowserSuppression(false);
      } catch (error) {
        // The full cause, verbatim, where a developer will look. This failure fired on
        // production for weeks with the only record of WHY discarded right here — the toast
        // carries a one-line summary, the console carries the truth.
        console.error("Krisp noise suppression failed to attach or enable:", error);
        // Put the microphone back the way a working fallback needs it BEFORE telling anyone.
        // The report is only honest if it is true by the time it is made.
        try {
          if (localAudioTrack.getProcessor()) await localAudioTrack.stopProcessor();
          await setBrowserSuppression(true);
        } catch {
          // Nothing further to try; the original failure is the one worth surfacing.
        }
        // A processor that failed to enable is spent whatever the cause. Keeping it would make
        // the next attempt fail for a reason that has nothing to do with the original one.
        krispRef.current = null;
        if (!cancelled) onNoiseSuppressionError?.(error);
      }
    }
    void applyNoiseProcessor();
    return () => {
      cancelled = true;
      // The effect re-runs when the microphone track changes — muting and unmuting publishes a
      // NEW track. A processor bound to the track that just went away cannot be attached to its
      // replacement, so it goes with it.
      krispRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseSuppressionEnabled, microphoneTrackSid, onNoiseSuppressionError]);

  useEffect(() => {
    const track = cameraTrack?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    const localVideoTrack = track;

    let cancelled = false;

    async function applyBlurProcessor() {
      // BLUR FAILS LOUDLY NOW, and that is the whole change.
      //
      // This was `void track.setProcessor(blurRef.current)` — a floating promise with no catch.
      // setProcessor loads a WebAssembly segmentation model and fetches its weights, so it can
      // reject for a dozen ordinary reasons (CSP, a blocked CDN, an unsupported browser, a
      // camera that changed mid-flight). Every one of them landed as an unhandled rejection: the
      // toggle stayed lit, no error was raised, and the picture simply never blurred. "Background
      // blur không còn lên nữa" is exactly that shape of report — nothing to see anywhere.
      //
      // Krisp beside it got this treatment in WT-320. Blur was left as the one processor that
      // could fail in silence.
      if (!backgroundBlurEnabled) {
        if (localVideoTrack.getProcessor()) await localVideoTrack.stopProcessor();
        // Dropped on purpose. A BackgroundProcessor that has been stopped has released its
        // WASM pipeline, and re-attaching that same instance is not something the library
        // promises — reusing it is a plausible way for the SECOND enable of a session to do
        // nothing at all, which is the other half of this report.
        blurRef.current = null;
        return;
      }

      try {
        if (!blurRef.current) {
          blurRef.current = BackgroundProcessor({
            mode: "background-blur",
            blurRadius: BLUR_RADIUS,
          });
        }
        await localVideoTrack.setProcessor(blurRef.current);
      } catch (error) {
        // Leave the camera publishing unprocessed rather than half-attached, then report.
        try {
          if (localVideoTrack.getProcessor()) await localVideoTrack.stopProcessor();
        } catch {
          // Nothing further to try; the original failure is the one worth surfacing.
        }
        blurRef.current = null;
        if (!cancelled) onBackgroundBlurError?.(error);
      }
    }

    void applyBlurProcessor();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundBlurEnabled, cameraTrackSid, onBackgroundBlurError]);
}

/**
 * Renderless — mount as a child of <LiveKitRoom> (alongside FilteredRoomAudio) so
 * useTrackProcessors has room context to read the local participant's tracks from.
 */
export function TrackProcessorsController(props: TrackEffectsPreferences) {
  useTrackProcessors(props);
  return null;
}
