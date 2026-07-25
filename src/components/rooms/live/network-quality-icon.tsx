"use client";

import { useEffect, useState } from "react";
import { ConnectionQuality, RoomEvent, type Participant } from "livekit-client";
import { useMaybeRoomContext } from "@livekit/components-react";

const TOOLTIP_BY_QUALITY: Record<ConnectionQuality, string> = {
  [ConnectionQuality.Excellent]: "Excellent connection",
  [ConnectionQuality.Good]: "Good connection",
  [ConnectionQuality.Poor]: "Connection is weak — try turning off your camera.",
  [ConnectionQuality.Lost]: "Connection lost",
  [ConnectionQuality.Unknown]: "Connection quality unknown",
};

/**
 * Small 3-bar signal icon reflecting a participant's LiveKit connection quality.
 * Omit `participantIdentity` to track the local participant (for the control bar).
 * Self-contained: listens to RoomEvent.ConnectionQualityChanged itself so it can be
 * dropped into a participant tile overlay or the control bar without extra plumbing.
 */
export function NetworkQualityIcon({
  participantIdentity,
  className,
}: {
  participantIdentity?: string;
  className?: string;
}) {
  const room = useMaybeRoomContext();
  const [quality, setQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);

  useEffect(() => {
    if (!room) return;
    const targetIdentity = participantIdentity ?? room.localParticipant.identity;

    const resolveCurrent = () => {
      const participant: Participant | undefined =
        targetIdentity === room.localParticipant.identity
          ? room.localParticipant
          : room.remoteParticipants.get(targetIdentity);
      if (participant) setQuality(participant.connectionQuality);
    };
    resolveCurrent();

    const handleChange = (nextQuality: ConnectionQuality, participant?: Participant) => {
      const identity = participant?.identity ?? room.localParticipant.identity;
      if (identity === targetIdentity) setQuality(nextQuality);
    };

    room.on(RoomEvent.ConnectionQualityChanged, handleChange);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, handleChange);
    };
  }, [room, participantIdentity]);

  const bars =
    quality === ConnectionQuality.Excellent ? 3 : quality === ConnectionQuality.Good ? 2 : quality === ConnectionQuality.Poor ? 1 : 0;
  const colorClass = bars >= 3 ? "text-green-500" : bars === 2 ? "text-amber-500" : bars === 1 ? "text-red-500" : "text-ink-tertiary";
  const label = TOOLTIP_BY_QUALITY[quality];

  return (
    <span
      className={`inline-flex items-end gap-[1.5px] ${colorClass} ${className ?? ""}`}
      title={label}
      aria-label={label}
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`w-[3px] rounded-sm ${bar <= bars ? "bg-current" : "bg-current/25"}`}
          style={{ height: `${bar * 3 + 2}px` }}
        />
      ))}
    </span>
  );
}
