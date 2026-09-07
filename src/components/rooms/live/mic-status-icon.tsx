"use client";

import { useEffect, useState } from "react";
import { Microphone, MicrophoneSlash } from "@phosphor-icons/react/dist/ssr";
import { RoomEvent, type Participant } from "livekit-client";
import { useMaybeRoomContext } from "@livekit/components-react";

/**
 * WT-583: whether a participant's microphone is live, drawn on their own tile.
 *
 * Self-contained in the same way as NetworkQualityIcon — it subscribes to the room itself, so a
 * tile can render one without the stage having to thread mute state down through every layout
 * branch. Omit `participantIdentity` to follow the local participant.
 *
 * THE SOURCE IS LIVEKIT, NOT THE ROSTER.
 *
 * The People panel draws a microphone glyph too, off the roster's transcript-only flag — "do not
 * play me translated audio". That is not mute. The two answer different questions and would
 * disagree constantly if this badge asked the roster, so it asks the track: a published
 * microphone publication that is not muted, which is what `isMicrophoneEnabled` means and what
 * the person pressing the mute button actually changed.
 */
export function MicStatusIcon({
  participantIdentity,
  className,
}: {
  participantIdentity?: string;
  className?: string;
}) {
  const room = useMaybeRoomContext();
  // Nobody is audible until a publication says otherwise — a tile that has not resolved yet
  // should not claim a live microphone it has no evidence for.
  const [micLive, setMicLive] = useState(false);

  useEffect(() => {
    if (!room) return;
    const targetIdentity = participantIdentity ?? room.localParticipant.identity;

    // Only written when the person is actually resolvable, matching NetworkQualityIcon. A tick
    // where they are momentarily absent from the map is not evidence their microphone changed,
    // and the events below re-resolve as soon as it does.
    const resolve = () => {
      const participant: Participant | undefined =
        targetIdentity === room.localParticipant.identity
          ? room.localParticipant
          : room.remoteParticipants.get(targetIdentity);
      if (participant) setMicLive(participant.isMicrophoneEnabled);
    };
    resolve();

    /**
     * Every event that can change the answer, not just the mute pair.
     *
     * TrackMuted/TrackUnmuted cover the mute button. They do NOT cover somebody joining with no
     * microphone and publishing one later, or a headset being unplugged mid-meeting — those
     * arrive as (un)publish events, and a badge that ignored them would sit on a stale answer
     * for the rest of the call.
     */
    room
      .on(RoomEvent.TrackMuted, resolve)
      .on(RoomEvent.TrackUnmuted, resolve)
      .on(RoomEvent.TrackPublished, resolve)
      .on(RoomEvent.TrackUnpublished, resolve)
      .on(RoomEvent.LocalTrackPublished, resolve)
      .on(RoomEvent.LocalTrackUnpublished, resolve)
      .on(RoomEvent.ParticipantConnected, resolve);

    return () => {
      room
        .off(RoomEvent.TrackMuted, resolve)
        .off(RoomEvent.TrackUnmuted, resolve)
        .off(RoomEvent.TrackPublished, resolve)
        .off(RoomEvent.TrackUnpublished, resolve)
        .off(RoomEvent.LocalTrackPublished, resolve)
        .off(RoomEvent.LocalTrackUnpublished, resolve)
        .off(RoomEvent.ParticipantConnected, resolve);
    };
  }, [room, participantIdentity]);

  const label = micLive ? "Microphone is on" : "Microphone is muted";

  return (
    <span
      className={`inline-flex ${micLive ? "text-ink-tertiary" : "text-red-500"} ${className ?? ""}`}
      title={label}
      aria-label={label}
    >
      {micLive ? (
        <Microphone className="h-3.5 w-3.5" weight="fill" />
      ) : (
        <MicrophoneSlash className="h-3.5 w-3.5" weight="fill" />
      )}
    </span>
  );
}
