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

import {
  INITIAL_STICKY_SPEAKER,
  SPEAKER_HOLD_MS,
  nextStickySpeaker,
} from "@/lib/sticky-speaker";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HandRaiseBadge } from "./hand-raise-badge";
import type { MeetingLayoutMode } from "./meeting-control-bar";
import { NetworkQualityIcon } from "./network-quality-icon";

const TILE_CLASSNAME =
  "!h-full !w-full !border-0 overflow-hidden rounded-xl !bg-surface-3 [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover [&_.lk-participant-placeholder]:!flex [&_.lk-participant-placeholder]:!h-full [&_.lk-participant-placeholder]:!w-full [&_.lk-participant-placeholder]:!items-center [&_.lk-participant-placeholder]:!justify-center [&_.lk-participant-placeholder_svg]:!h-1/3 [&_.lk-participant-placeholder_svg]:!max-h-40 [&_.lk-participant-placeholder_svg]:!w-auto [&_.lk-participant-name]:!hidden";

/**
 * A grid or featured tile fills the cell it is given.
 *
 * WT-321(1): thumbnails must NOT inherit this. A filmstrip thumbnail declared `h-32 w-64`, but
 * this floor (`min-h-[180px]`) still applied to it and won, inside a strip capped at
 * `max-h-[clamp(84px,12vw,132px)]` with `overflow-y-hidden` — a 180px box in a 132px window,
 * bottom-aligned, so every thumbnail was clipped along its top edge. The thumbnail's own rule
 * was self-contradictory too: a fixed 16rem x 8rem box is 2:1, not the 16:9 it also asked for,
 * and the `max-w-[min(18rem,34vw)]` beside it squeezed the width further on a narrow viewport
 * while the height stayed put. Thumbnails now take their size from THUMBNAIL_SIZING alone.
 */
const GRID_TILE_SIZING = "relative h-full min-h-[180px] w-full";

/** One height for a filmstrip thumbnail; `aspect-video` derives the width from it. */
const THUMBNAIL_SIZING =
  "relative aspect-video h-[clamp(84px,12vw,132px)] w-auto shrink-0";

const STAGE_CLASSNAME = "h-full min-h-0 w-full bg-surface-1 p-3";
const SINGLE_PARTICIPANT_STAGE_CLASSNAME = "h-full min-h-0 w-full bg-surface-1";
const FULLSCREEN_FEATURED_STAGE_CLASSNAME =
  "relative h-full min-h-0 w-full overflow-hidden bg-surface-1";

export function LiveKitMeetingStage({
  fallbackName,
  isJoining,
  error,
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
  /** A presenter's own local preview. Optional since the share became a real published
   * LiveKit track, which reaches the presenter through useTracks like everyone else — the
   * session no longer captures a second copy with getDisplayMedia. */
  screenStream?: MediaStream | null;
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
    if (!screenVideoRef.current) return;
    screenVideoRef.current.srcObject = screenStream ?? null;
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

  // The RING follows the voice directly — that is a light, and it should track speech.
  // The LAYOUT does not: the large tile used to swap on every "mm", then swap back, so a
  // two-person conversation flickered between two faces for its whole duration. Focus is
  // sticky, and only moves once someone else has held the floor for SPEAKER_HOLD_MS.
  const speakingNow = visibleTracks
    .filter((trackRef) => activeSpeakerIdentities.has(trackRef.participant.identity))
    .map((trackRef) => trackRef.participant.identity);

  const [stickySpeaker, setStickySpeaker] = useState(INITIAL_STICKY_SPEAKER);
  const speakingKey = speakingNow.join("|");

  useEffect(() => {
    const speaking = speakingKey ? speakingKey.split("|") : [];
    setStickySpeaker((current) => nextStickySpeaker(current, speaking, Date.now()));

    // A contender who holds the floor produces no further events while they keep talking,
    // so the handover has to be re-evaluated once the hold has elapsed rather than only on
    // the next change.
    const timer = setTimeout(() => {
      setStickySpeaker((current) => nextStickySpeaker(current, speaking, Date.now()));
    }, SPEAKER_HOLD_MS + 50);
    return () => clearTimeout(timer);
  }, [speakingKey]);

  const activeSpeakerIdentity =
    stickySpeaker.focused &&
    visibleTracks.some((trackRef) => trackRef.participant.identity === stickySpeaker.focused)
      ? stickySpeaker.focused
      : undefined;
  const localIdentity = room?.localParticipant.identity ?? null;
  const firstVisibleIdentity = visibleTracks[0]?.participant.identity;
  const firstRemoteIdentity = visibleTracks.find(
    (trackRef) => trackRef.participant.identity !== localIdentity,
  )?.participant.identity;
  const featuredIdentity =
    spotlightedUserId ||
    (layoutMode === "grid"
      ? null
      : layoutMode === "spotlight"
        ? pinnedUserId || activeSpeakerIdentity || firstVisibleIdentity
        : layoutMode === "sidebar"
          ? pinnedUserId || firstVisibleIdentity
          : layoutMode === "auto" && visibleTracks.length > 1
            ? pinnedUserId ||
              activeSpeakerIdentity ||
              firstRemoteIdentity ||
              firstVisibleIdentity
            : pinnedUserId) ||
    null;
  const isSpotlight = Boolean(spotlightedUserId);

  // WT-245: a camera-off participant's TrackReference is not stable — LiveKit swaps between a
  // muted camera publication and the withPlaceholder entry, so looking them up in the track list
  // intermittently finds nothing. When that happened the render fell straight through to the
  // generic two-up layout, handing the stage to whoever WAS on camera, and the pin appeared to
  // flip back and forth.
  //
  // Resolved from the room's participants rather than from the track list, so a pin depends on
  // the person being here and not on whether a publication happens to exist this tick. Purely
  // derived — nothing is remembered between renders, so someone who leaves releases the stage
  // on their own.
  const featuredParticipant = !featuredIdentity
    ? undefined
    : featuredIdentity === localIdentity
      ? room?.localParticipant
      : room
        ? Array.from(room.remoteParticipants.values()).find(
            (participant) => participant.identity === featuredIdentity,
          )
        : undefined;

  function renderThumbnail(trackRef: TrackReferenceOrPlaceholder) {
    return renderTile(trackRef, {
      className:
        "rounded-2xl border border-white/80 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]",
      tileClassName: "!rounded-2xl",
      variant: "thumbnail",
    });
  }

  function renderTile(
    trackRef: TrackReferenceOrPlaceholder,
    options?: {
      className?: string;
      tileClassName?: string;
      variant?: "featured" | "thumbnail";
    },
  ) {
    const identity = trackRef.participant.identity;
    const isActiveSpeaker = activeSpeakerIdentities.has(identity);
    const isFeatured = featuredIdentity === identity;
    const handRaised = raisedHandUserIds?.has(identity) ?? false;
    const displayName = trackRef.participant.name || identity || fallbackName;
    const showCameraOffState = isCameraUnavailable(trackRef);
    const isThumbnail = options?.variant === "thumbnail";

    return (
      <div
        key={
          trackRef.participant.sid +
          (trackRef.publication?.trackSid ?? "placeholder")
        }
        className={`group ${isThumbnail ? THUMBNAIL_SIZING : GRID_TILE_SIZING} overflow-hidden rounded-xl transition-shadow ${isActiveSpeaker ? "ring-2 ring-inset ring-primary" : ""} ${options?.className ?? ""}`}
        onClick={() => onPinParticipant?.(identity)}
      >
        <ParticipantTile
          trackRef={trackRef}
          className={`${TILE_CLASSNAME} ${options?.tileClassName ?? ""} ${onPinParticipant ? "cursor-pointer" : ""}`}
        />
        {showCameraOffState ? (
          <div
            data-camera-state="off"
            className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm ${
              isThumbnail ? "gap-1.5" : "gap-3"
            }`}
          >
            <Avatar
              size="lg"
              className={`${isThumbnail ? "size-10" : "size-16"} border border-border bg-white shadow-sm`}
            >
              <AvatarFallback
                className={`${isThumbnail ? "text-sm" : "text-lg"} bg-white font-semibold text-ink`}
              >
                {initials(displayName) || "?"}
              </AvatarFallback>
            </Avatar>
            <div
              className={`rounded-full border border-border bg-white px-2.5 py-0.5 font-medium text-ink shadow-sm ${
                isThumbnail ? "text-[10px]" : "text-[12px]"
              }`}
            >
              Camera is off
            </div>
          </div>
        ) : null}
        <div
          className={`pointer-events-none absolute flex items-center gap-1.5 ${
            isThumbnail ? "right-2 top-2" : "right-3 top-3"
          }`}
        >
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
        <div
          className={`pointer-events-none absolute max-w-[calc(100%-1rem)] truncate rounded-full bg-black/55 font-medium text-white shadow-sm backdrop-blur ${
            isThumbnail
              ? "bottom-2 left-2 px-2 py-0.5 text-[11px]"
              : "bottom-5 left-5 px-3 py-1 text-[13px]"
          }`}
        >
          {displayName}
        </div>
      </div>
    );
  }

  if (screenStream) {
    return (
      <div className={FULLSCREEN_FEATURED_STAGE_CLASSNAME}>
        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
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

        {visibleTracks.length > 0 ? (
          <div className="absolute bottom-28 left-5 z-20 flex max-h-[calc(100%-8rem)] flex-col gap-3 overflow-y-auto pr-1">
            {visibleTracks.map((trackRef) => renderThumbnail(trackRef))}
          </div>
        ) : null}
      </div>
    );
  }

  if (hasParticipants) {
    const featuredTrack =
      visibleTracks.find(
        (trackRef) => trackRef.participant.identity === featuredIdentity,
      ) ??
      // No publication for them this tick — render the camera placeholder for the person
      // themselves, which is what a pinned camera-off participant should look like anyway.
      (featuredParticipant
        ? {
            participant: featuredParticipant,
            source: Track.Source.Camera,
          }
        : undefined);
    const otherTracks = featuredTrack
      ? visibleTracks.filter(
          (trackRef) =>
            trackRef !== featuredTrack &&
            // A held reference is not the same object as anything in visibleTracks, so filter
            // by identity too or the featured participant also shows up as a thumbnail.
            trackRef.participant.identity !== featuredTrack.participant.identity,
        )
      : [];

    if (featuredTrack) {
      const thumbnailTracks = orderThumbnailTracks(
        otherTracks,
        localIdentity,
      );

      return (
        <div className={FULLSCREEN_FEATURED_STAGE_CLASSNAME}>
          <div className="absolute inset-0">
            {renderTile(featuredTrack, {
              className: "!rounded-none",
              tileClassName: "!rounded-none",
            })}
          </div>
          {thumbnailTracks.length > 0 ? (
            // WT-321(1): no height cap here. The strip is sized by the thumbnails, which now
            // carry one definite height; capping the strip below the tile height is what
            // clipped them.
            <div className="absolute bottom-28 left-5 right-5 z-20 flex items-end gap-3 overflow-x-auto overflow-y-hidden pb-1">
              {thumbnailTracks.map((trackRef) => renderThumbnail(trackRef))}
            </div>
          ) : null}
        </div>
      );
    }

    if (visibleTracks.length === 1) {
      const onlyTrack = visibleTracks[0];
      if (!onlyTrack) return null;

      return (
        <div
          className={`${SINGLE_PARTICIPANT_STAGE_CLASSNAME} flex items-stretch justify-stretch`}
        >
          {/* Square, like the featured branch above. The frame around the stage already
              rounds at 24 and clips to it; rounding the tile again at 16 inside that only
              left the frame's backing visible in the corners. One radius, owned by the
              frame. */}
          <div className="h-full min-h-0 w-full">
            {renderTile(onlyTrack, {
              className: "!rounded-none",
              tileClassName: "!rounded-none",
            })}
          </div>
        </div>
      );
    }

    if (visibleTracks.length === 2) {
      return (
        <div className={`${STAGE_CLASSNAME} grid grid-cols-1 gap-3 lg:grid-cols-2`}>
          {visibleTracks.map((trackRef) => renderTile(trackRef))}
        </div>
      );
    }

    return (
      <div className={STAGE_CLASSNAME}>
        <div
          className={`grid h-full min-h-0 gap-3 ${gridClassName(visibleTracks.length)}`}
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
        {error || liveKitStateLabel(connectionState)}
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

function orderThumbnailTracks(
  otherTracks: TrackReferenceOrPlaceholder[],
  localIdentity: string | null,
) {
  if (!localIdentity) return otherTracks;

  return [...otherTracks].sort((left, right) => {
    const leftIsLocal = left.participant.identity === localIdentity;
    const rightIsLocal = right.participant.identity === localIdentity;
    return Number(rightIsLocal) - Number(leftIsLocal);
  });
}

function isCameraUnavailable(trackRef: TrackReferenceOrPlaceholder) {
  return (
    trackRef.source === Track.Source.Camera &&
    (!trackRef.publication || trackRef.publication.isMuted)
  );
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
