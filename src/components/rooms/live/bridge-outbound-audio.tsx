"use client";

import { useEffect } from "react";
import type { TrackReference } from "@livekit/components-react";
import {
  playRemoteTrackToDevice,
  playTrackToDevice,
  type DevicePlayback,
} from "@/lib/audio/bridge-audio-legs";

/**
 * The outbound leg of an external-bridge meeting: the user's own dub, played into the virtual
 * microphone Google Meet is listening to instead of into the user's headphones.
 *
 * WHY THIS IS NOT AN <AudioTrack>
 *   <AudioTrack> attaches to the default output. In every other meeting that is right, and this
 *   particular track is dropped before it ever gets there — FilteredRoomAudio's "never your own
 *   dub" rule exists because hearing a synthetic copy of your own sentence a second later is
 *   useless. In a bridge meeting that same track is the entire point: it is what you just said,
 *   in the language the far side speaks, in your cloned voice. It must not reach your headphones
 *   and it must reach the virtual device, which is a different sink, not a different volume.
 *
 * AND NOT AN <audio> ELEMENT WITH THE CABLE AS ITS SINK EITHER
 *   That is what this was, and it took every other remote track in the page to the cable with it:
 *   Chromium plays all remote WebRTC audio through one shared output, and `setSinkId` on any
 *   element playing such a track moves all of it. The far side's dub — the one track the host
 *   listens to — went into Meet's microphone and the host heard nothing (production, 2026-10-03).
 *   The dub is a remote track, so it goes through `playRemoteTrackToDevice`, which never gives it
 *   a sink. The raw microphone (bridge-outbound-mic.tsx) is a local track and keeps the element.
 *
 * FAILURE IS REPORTED, NOT SWALLOWED
 *   Choosing an output is Chromium-only and the device can disappear between enumeration and
 *   playback. A silent failure here is the worst outcome available: the meeting looks fine, the
 *   transcript scrolls, and nobody on the far side hears anything at all — with nothing on screen
 *   to say why. `onError` exists so the caller can put that sentence somewhere a person will read
 *   it.
 */
export function BridgeOutboundAudio({
  trackRef,
  outputDeviceId,
  onError,
}: {
  /** This user's own interpreter track — the dub meant for the far side. */
  trackRef: TrackReference;
  /** The virtual device Meet uses as its microphone. */
  outputDeviceId: string;
  onError?: (message: string) => void;
}) {
  useTrackOnDevice(
    trackRef.publication?.track?.mediaStreamTrack ?? null,
    outputDeviceId,
    onError,
    "The translated audio could not be sent to your meeting's microphone.",
    "remote",
  );
  // Nothing to render: the audio lives outside the page's own elements, owned by the hook,
  // precisely so it does not come out of the page's default sink.
  return null;
}

/** The host's own microphone on an element of its own: a local track may be given a sink. */
async function playLocalTrackToDevice(
  track: MediaStreamTrack,
  outputDeviceId: string,
): Promise<DevicePlayback> {
  const audio = await playTrackToDevice(track, outputDeviceId);
  return {
    stop: () => {
      audio.pause();
      audio.srcObject = null;
    },
  };
}

/**
 * Plays `mediaTrack` into `outputDeviceId` for as long as the caller is mounted and both stay the
 * same. Shared by both things the bridge device can carry — the host's dub (above) and the host's
 * own microphone (bridge-outbound-mic.tsx) — so the in-flight-open and teardown rules below
 * cannot drift apart between them.
 *
 * `source` says where the track came from, because that decides HOW it may be played: a "remote"
 * track (the dub) must never be given a sink of its own — see playRemoteTrackToDevice.
 */
export function useTrackOnDevice(
  mediaTrack: MediaStreamTrack | null,
  outputDeviceId: string,
  onError: ((message: string) => void) | undefined,
  fallbackMessage: string,
  source: "local" | "remote" = "local",
) {
  useEffect(() => {
    if (!mediaTrack) return;

    let cancelled = false;
    let opened: DevicePlayback | null = null;

    void (async () => {
      try {
        const playback =
          source === "remote"
            ? await playRemoteTrackToDevice(mediaTrack, outputDeviceId)
            : await playLocalTrackToDevice(mediaTrack, outputDeviceId);
        // The device can change (or the component unmount) while the device is being opened.
        // Without this the late resolution would leave a second leg playing into a device the
        // user has already moved away from, and nothing would hold a reference to stop it.
        if (cancelled) {
          playback.stop();
          return;
        }
        opened = playback;
      } catch (error) {
        if (cancelled) return;
        onError?.(error instanceof Error ? error.message : fallbackMessage);
      }
    })();

    return () => {
      cancelled = true;
      opened?.stop();
    };
    // `onError` is deliberately not a dependency: callers pass an inline closure, and depending
    // on it would tear down and re-open the device on every parent render — a gap in the outbound
    // audio each time, for no change in routing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaTrack, outputDeviceId, source]);
}
