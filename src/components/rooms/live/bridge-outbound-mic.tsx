"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  RoomEvent,
  Track,
  TrackEvent,
  type LocalTrack,
  type LocalTrackPublication,
  type Room,
} from "livekit-client";
import { useMaybeRoomContext } from "@livekit/components-react";

import { useTrackOnDevice } from "./bridge-outbound-audio";

/**
 * The outbound leg of an external-bridge meeting when there is no dub to send: the host's own
 * microphone, played into the virtual microphone Google Meet is listening to.
 *
 * WHY THIS EXISTS
 *   Meet's microphone is the virtual cable, so whatever WarpTalk does not write into it, the far
 *   side does not hear. It used to carry only the host's dub — so before Start, between sentences,
 *   and for an entire meeting in which the host spoke the far side's language, Meet heard nothing,
 *   and from Meet's side a silent virtual microphone is indistinguishable from a broken one. The
 *   rule for WHEN this plays lives in lib/meeting/room-audio-routing.ts (`outboundRawMic`); it is
 *   what a native listener in the far side's language would hear of the host.
 *
 * THE SAME TRACK, NEVER A CLONE
 *   This plays the very MediaStreamTrack LiveKit publishes. A clone has its own `enabled` flag, so
 *   it would keep sending the host's voice into Meet while they are muted in WarpTalk — LiveKit's
 *   mute is `enabled = false` on its track — and while HalfDuplexMic is holding the mic down
 *   because a dub is playing into the host's own speakers. On the same track both come for free:
 *   a disabled track plays silence, into Meet as into the room.
 *
 *   It also keeps the capture the browser has already processed. Chromium's echo cancellation ran
 *   on this track against what the page plays out, and HalfDuplexMic gates the rest, so the far
 *   side's own voice coming out of the host's speakers is not handed straight back to them.
 *
 * WHICH TRACK "THE SAME TRACK" IS
 *   `LocalTrack.mediaStreamTrack` returns the processor's output when a processor is attached
 *   (livekit-client 2.x: `processor?.processedTrack ?? _mediaStreamTrack`) — so with the noise
 *   filter on, Meet gets the filtered voice, the same audio the SFU is sent. That instance changes
 *   when a processor is attached or removed, when the device is switched or the track restarted,
 *   and when the microphone is republished; every one of those is subscribed to below, and the
 *   device element is re-opened on the new instance rather than left playing an ended track.
 *   Mute itself only flips `enabled` on the source track (a processed track fed by a disabled
 *   source is silent too), but with stopOnMute an unmute RESTARTS the track, so Muted/Unmuted are
 *   watched as well.
 */
export function BridgeOutboundMic({
  outputDeviceId,
  onError,
}: {
  /** The virtual device Meet uses as its microphone. */
  outputDeviceId: string;
  onError?: (message: string) => void;
}) {
  const room = useMaybeRoomContext();
  const mediaTrack = useLocalMicMediaStreamTrack(room);
  useTrackOnDevice(
    mediaTrack,
    outputDeviceId,
    onError,
    "Your voice could not be sent to your meeting's microphone.",
  );
  return null;
}

const readMicTrack = (room: Room | undefined): MediaStreamTrack | null =>
  room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;

const MIC_TRACK_EVENTS = [
  TrackEvent.Restarted,
  TrackEvent.TrackProcessorUpdate,
  TrackEvent.Muted,
  TrackEvent.Unmuted,
  TrackEvent.Ended,
] as const;

/**
 * The MediaStreamTrack instance the local microphone publication currently plays, kept current
 * across every event that can swap it. An external store rather than state set from an effect:
 * the snapshot is the instance itself, so a consumer keyed on it re-runs exactly when the instance
 * changes and not on unrelated renders.
 */
function useLocalMicMediaStreamTrack(room: Room | undefined): MediaStreamTrack | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!room) return () => {};

      // The LocalTrack whose own events are being listened to. Re-pointed whenever the
      // publication changes, so a republished microphone is followed rather than lost.
      let watched: LocalTrack | null = null;
      const watch = () => {
        const next = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track ?? null;
        if (next === watched) return;
        if (watched) for (const event of MIC_TRACK_EVENTS) watched.off(event, onChange);
        watched = next;
        if (watched) for (const event of MIC_TRACK_EVENTS) watched.on(event, onChange);
      };
      const onPublicationChange = (publication: LocalTrackPublication) => {
        if (publication.source !== Track.Source.Microphone) return;
        watch();
        onChange();
      };
      const onDeviceChange = () => {
        watch();
        onChange();
      };

      room.on(RoomEvent.LocalTrackPublished, onPublicationChange);
      room.on(RoomEvent.LocalTrackUnpublished, onPublicationChange);
      room.on(RoomEvent.ActiveDeviceChanged, onDeviceChange);
      watch();

      return () => {
        room.off(RoomEvent.LocalTrackPublished, onPublicationChange);
        room.off(RoomEvent.LocalTrackUnpublished, onPublicationChange);
        room.off(RoomEvent.ActiveDeviceChanged, onDeviceChange);
        if (watched) for (const event of MIC_TRACK_EVENTS) watched.off(event, onChange);
        watched = null;
      };
    },
    [room],
  );

  return useSyncExternalStore(
    subscribe,
    () => readMicTrack(room),
    () => null,
  );
}
