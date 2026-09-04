"use client";

import { useEffect, useState } from "react";
import type { TrackReference } from "@livekit/components-react";
import { playTrackToDevice } from "@/lib/audio/bridge-audio-legs";

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
 * FAILURE IS REPORTED, NOT SWALLOWED
 *   setSinkId is Chromium-only and the device can disappear between enumeration and playback. A
 *   silent failure here is the worst outcome available: the meeting looks fine, the transcript
 *   scrolls, and nobody on the far side hears anything at all — with nothing on screen to say
 *   why. `onError` exists so the caller can put that sentence somewhere a person will read it.
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
  const [element, setElement] = useState<HTMLAudioElement | null>(null);

  const mediaTrack = trackRef.publication?.track?.mediaStreamTrack ?? null;

  useEffect(() => {
    if (!mediaTrack) return;

    let cancelled = false;
    let opened: HTMLAudioElement | null = null;

    void (async () => {
      try {
        const audio = await playTrackToDevice(mediaTrack, outputDeviceId);
        // The device can change (or the component unmount) while setSinkId is in flight. Without
        // this the late resolution would leave a second element playing into a device the user
        // has already moved away from, and nothing would hold a reference to stop it.
        if (cancelled) {
          audio.pause();
          audio.srcObject = null;
          return;
        }
        opened = audio;
        setElement(audio);
      } catch (error) {
        if (cancelled) return;
        onError?.(
          error instanceof Error
            ? error.message
            : "The translated audio could not be sent to your meeting's microphone.",
        );
      }
    })();

    return () => {
      cancelled = true;
      opened?.pause();
      if (opened) opened.srcObject = null;
      setElement(null);
    };
    // `onError` is deliberately not a dependency: callers pass an inline closure, and depending
    // on it would tear down and re-open the device on every parent render — a gap in the outbound
    // audio each time, for no change in routing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaTrack, outputDeviceId]);

  // Nothing to render: the audio lives on a detached element owned by the effect, precisely so it
  // does not inherit the page's default sink.
  void element;
  return null;
}
