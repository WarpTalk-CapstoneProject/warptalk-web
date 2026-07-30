"use client";

import {
  ParticipantTile,
  useConnectionState,
  useMaybeRoomContext,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import {
  PushPinSimple,
  SpinnerGap,
  Star,
} from "@phosphor-icons/react/dist/ssr";
import {
  ConnectionState,
  RoomEvent,
  Track,
  type Participant,
} from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { HandRaiseBadge } from "./hand-raise-badge";
import type { MeetingLayoutMode } from "./meeting-control-bar";
import { NetworkQualityIcon } from "./network-quality-icon";

const TILE_CLASSNAME =
  "overflow-hidden rounded-xl !bg-surface-3 [&_.lk-participant-name]:text-ink [&_.lk-participant-name]:!bg-surface-1/80 [&_.lk-participant-name]:backdrop-blur";

export function LiveKitMeetingStage({
  fallbackName,
  isJoining,
  error,
  localStream,
  localMediaError,
  screenStream,
  layoutMode,
  pinnedUserId,
  onPinParticipant,
  spotlightedUserId,
  raisedHandUserIds,
  onRetry,
}: {
  fallbackName: string;
  isJoining: boolean;
  error: string | null;
  localStream: MediaStream | null;
  localMediaError: string | null;
  screenStream: MediaStream | null;
  layoutMode: MeetingLayoutMode;
  /** Locally-pinned participant (this viewer only) — clicking a tile toggles it. */
  pinnedUserId?: string | null;
  onPinParticipant?: (userId: string) => void;
  /** Host-forced spotlight, synced to every viewer via TranslationRoomHub.SpotlightChanged. Overrides pinnedUserId when set. */
  spotlightedUserId?: string | null;
  raisedHandUserIds?: Set<string>;
  onRetry: () => void;
}) {
  const connectionState = useConnectionState();
  const room = useMaybeRoomContext();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const [activeSpeakerIdentities, setActiveSpeakerIdentities] = useState<
    Set<string>
  >(new Set());
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const visibleTracks = tracks.filter(
    (trackRef) =>
      !isAutomatedParticipant(
        trackRef.participant.identity,
        trackRef.participant.name,
      ),
  );
  const hasParticipants =
    connectionState === ConnectionState.Connected && visibleTracks.length > 0;

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (!screenVideoRef.current) return;
    screenVideoRef.current.srcObject = screenStream;
  }, [screenStream]);

  // Highlight whoever LiveKit currently reports as speaking. The SDK already applies a
  // short hangover before dropping a participant from this list, so the ring clears
  // roughly a second after they stop talking without extra debouncing here.
  useEffect(() => {
    if (!room) return;
    const handleActiveSpeakers = (speakers: Participant[]) => {
      setActiveSpeakerIdentities(
        new Set(speakers.map((speaker) => speaker.identity)),
      );
    };
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    };
  }, [room]);

  const activeSpeakerIdentity = visibleTracks.find((trackRef) =>
    activeSpeakerIdentities.has(trackRef.participant.identity),
  )?.participant.identity;
  const firstVisibleIdentity = visibleTracks[0]?.participant.identity;
  const featuredIdentity =
    spotlightedUserId ||
    (layoutMode === "grid"
      ? null
      : layoutMode === "spotlight"
        ? pinnedUserId || activeSpeakerIdentity || firstVisibleIdentity
        : layoutMode === "sidebar"
          ? pinnedUserId || firstVisibleIdentity
          : pinnedUserId) ||
    null;
  const isSpotlight = Boolean(spotlightedUserId);

  function renderTile(
    trackRef: TrackReferenceOrPlaceholder,
    options?: { minHeight?: string },
  ) {
    const identity = trackRef.participant.identity;
    const isActiveSpeaker = activeSpeakerIdentities.has(identity);
    const isFeatured = featuredIdentity === identity;
    const handRaised = raisedHandUserIds?.has(identity) ?? false;

    return (
      <div
        key={
          trackRef.participant.sid +
          (trackRef.publication?.trackSid ?? "placeholder")
        }
        className={`relative rounded-xl transition-shadow ${isActiveSpeaker ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-1" : ""}`}
        onClick={() => onPinParticipant?.(identity)}
      >
        <ParticipantTile
          trackRef={trackRef}
          className={`${TILE_CLASSNAME} ${options?.minHeight ?? ""} ${onPinParticipant ? "cursor-pointer" : ""}`}
        />
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5">
          {handRaised ? <HandRaiseBadge /> : null}
          {isFeatured ? (
            <span
              className="grid h-6 w-6 place-items-center rounded-md bg-surface-1/90 text-primary shadow-sm backdrop-blur"
              title={isSpotlight ? "Spotlighted by host" : "Pinned"}
            >
              {isSpotlight ? (
                <Star className="h-3.5 w-3.5" weight="fill" />
              ) : (
                <PushPinSimple className="h-3.5 w-3.5" weight="fill" />
              )}
            </span>
          ) : null}
          <span className="grid h-6 w-6 place-items-center rounded-md bg-surface-1/90 shadow-sm backdrop-blur">
            <NetworkQualityIcon participantIdentity={identity} />
          </span>
        </div>
      </div>
    );
  }

  if (screenStream) {
    return (
      <div className="grid h-full min-h-0 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_260px] bg-surface-1">
        <div className="relative min-h-0 overflow-hidden rounded-xl border border-border bg-surface-1">
          <video
            ref={screenVideoRef}
            className="h-full w-full object-contain"
            autoPlay
            muted
            playsInline
          />
          <div className="absolute left-4 top-4 rounded-md bg-surface-1/90 px-2 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur">
            You are presenting
          </div>
        </div>

        <div className="grid h-full gap-3 overflow-hidden grid-cols-1 overflow-y-auto">
          {visibleTracks.map((trackRef) =>
            renderTile(trackRef, { minHeight: "min-h-[160px]" }),
          )}
        </div>
      </div>
    );
  }

  if (hasParticipants) {
    const featuredTrack = featuredIdentity
      ? visibleTracks.find(
          (trackRef) => trackRef.participant.identity === featuredIdentity,
        )
      : undefined;
    const otherTracks = featuredTrack
      ? visibleTracks.filter((trackRef) => trackRef !== featuredTrack)
      : [];

    if (featuredTrack) {
      if (layoutMode === "sidebar") {
        return (
          <div className="grid h-full min-h-0 gap-2 bg-surface-1 p-2 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-h-0">
              {renderTile(featuredTrack, { minHeight: "h-full" })}
            </div>
            {otherTracks.length > 0 ? (
              <div className="grid h-full grid-cols-1 gap-2 overflow-y-auto">
                {otherTracks.map((trackRef) =>
                  renderTile(trackRef, { minHeight: "min-h-[160px]" }),
                )}
              </div>
            ) : null}
          </div>
        );
      }

      return (
        <div className="relative flex h-full w-full flex-col gap-2 p-2 bg-surface-1">
          <div className="min-h-0 flex-1">
            {renderTile(featuredTrack, { minHeight: "h-full" })}
          </div>
          {otherTracks.length > 0 ? (
            <div className="flex h-24 shrink-0 gap-2 overflow-x-auto">
              {otherTracks.map((trackRef) => (
                <div
                  key={trackRef.participant.sid}
                  className="aspect-video h-full shrink-0"
                >
                  {renderTile(trackRef, { minHeight: "h-full" })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="relative h-full w-full p-2 bg-surface-1">
        <div
          className={`grid h-full gap-3 ${gridClassName(visibleTracks.length)}`}
        >
          {visibleTracks.map((trackRef) => renderTile(trackRef))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center justify-center px-6 py-20 bg-surface-2">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-3 text-2xl font-medium text-ink-muted shadow-sm">
        {initials(fallbackName)}
      </div>
      <p className="mt-4 max-w-xl truncate text-center text-[15px] font-medium text-ink">
        {fallbackName}
      </p>
      <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-subtle">
        {isJoining && <SpinnerGap className="h-3.5 w-3.5 animate-spin" />}
        {localMediaError || error || liveKitStateLabel(connectionState)}
      </p>
      {error && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-canvas shadow-sm"
        >
          Retry connection
        </button>
      )}
    </div>
  );
}

function liveKitStateLabel(state: ConnectionState) {
  if (state === ConnectionState.Connected) return "Connected";
  if (state === ConnectionState.Connecting) return "Connecting";
  if (state === ConnectionState.Reconnecting) return "Reconnecting";
  return "Waiting for LiveKit";
}

function gridClassName(count: number) {
  if (count <= 1) return "grid-cols-1";
  if (count <= 4) return "grid-cols-2";
  if (count <= 9) return "grid-cols-3";
  if (count <= 16) return "grid-cols-4";
  return "grid-cols-5";
}

function isAutomatedParticipant(identity?: string, name?: string) {
  const normalizedIdentity = identity?.toLowerCase() ?? "";
  const normalizedName = name?.toLowerCase() ?? "";

  return (
    normalizedIdentity.startsWith("ai-interpreter-") ||
    normalizedIdentity === "warptalk-ai" ||
    normalizedName.includes("ai interpreter") ||
    normalizedName.includes("warptalk ai")
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
