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
        await localAudioTrack.setProcessor(krispRef.current);
        await setBrowserSuppression(false);
      } catch (error) {
        // Put the microphone back the way a working fallback needs it BEFORE telling anyone.
        // The report is only honest if it is true by the time it is made.
        try {
          if (localAudioTrack.getProcessor()) await localAudioTrack.stopProcessor();
          await setBrowserSuppression(true);
        } catch {
          // Nothing further to try; the original failure is the one worth surfacing.
        }
        if (!cancelled) onNoiseSuppressionError?.(error);
      }
    }
    void applyNoiseProcessor();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseSuppressionEnabled, microphoneTrackSid, onNoiseSuppressionError]);

  useEffect(() => {
    const track = cameraTrack?.track;
    if (!(track instanceof LocalVideoTrack)) return;

    if (backgroundBlurEnabled) {
      if (!blurRef.current) blurRef.current = BackgroundProcessor({ mode: "background-blur", blurRadius: BLUR_RADIUS });
      void track.setProcessor(blurRef.current);
    } else if (track.getProcessor()) {
      void track.stopProcessor();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundBlurEnabled, cameraTrackSid]);
}

/**
 * Renderless — mount as a child of <LiveKitRoom> (alongside FilteredRoomAudio) so
 * useTrackProcessors has room context to read the local participant's tracks from.
 */
export function TrackProcessorsController(props: TrackEffectsPreferences) {
  useTrackProcessors(props);
  return null;
}
