"use client";

import { useEffect, useRef } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { LocalAudioTrack, LocalVideoTrack } from "livekit-client";
import { KrispNoiseFilter, isKrispNoiseFilterSupported, type KrispNoiseFilterProcessor } from "@livekit/krisp-noise-filter";
import { BackgroundProcessor, type BackgroundProcessorWrapper } from "@livekit/track-processors";

const DEVICE_PREVIEW_KEY = "warptalk.devices.preview";
const BLUR_RADIUS = 10;
const ENABLE_KRISP_NOISE_FILTER =
  process.env.NEXT_PUBLIC_ENABLE_KRISP_NOISE_FILTER === "true";

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
  window.sessionStorage.setItem(DEVICE_PREVIEW_KEY, JSON.stringify({ ...existing, ...prefs }));
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
    async function applyNoiseProcessor() {
      try {
        if (
          ENABLE_KRISP_NOISE_FILTER &&
          noiseSuppressionEnabled &&
          isKrispNoiseFilterSupported()
        ) {
          if (!krispRef.current) krispRef.current = KrispNoiseFilter();
          await localAudioTrack.setProcessor(krispRef.current);
        } else if (localAudioTrack.getProcessor()) {
          await localAudioTrack.stopProcessor();
        }
      } catch (error) {
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
