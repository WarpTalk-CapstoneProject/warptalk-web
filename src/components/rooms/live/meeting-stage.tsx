"use client";

import { RefObject, useEffect, useRef } from "react";
import { ConnectionState, Track } from "livekit-client";
import { TrackLoop, useConnectionState, useTracks, ParticipantTile } from "@livekit/components-react";
import { SpinnerGap, Microphone, MicrophoneSlash } from "@phosphor-icons/react/dist/ssr";
import type { TranslationRoomParticipantDto } from "@/types/translationRoom";
import type { MeetingLayoutMode } from "./meeting-control-bar";

export function LiveKitMeetingStage({
  fallbackName,
  isJoining,
  error,
  localStream,
  localMediaError,
  cameraEnabled,
  participants,
  screenStream,
  layoutMode,
  onRetry,
}: {
  fallbackName: string;
  isJoining: boolean;
  error: string | null;
  localStream: MediaStream | null;
  localMediaError: string | null;
  cameraEnabled: boolean;
  participants: TranslationRoomParticipantDto[];
  screenStream: MediaStream | null;
  layoutMode: MeetingLayoutMode;
  onRetry: () => void;
}) {
  const connectionState = useConnectionState();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const hasTracks = connectionState === ConnectionState.Connected && tracks.length > 0;

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (!screenVideoRef.current) return;
    screenVideoRef.current.srcObject = screenStream;
  }, [screenStream]);

  if (hasTracks) {
    return (
      <div className="relative h-full w-full p-2 bg-surface-1">
        <div className={`grid h-full gap-3 ${tracks.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          <TrackLoop tracks={tracks}>
            <ParticipantTile className="overflow-hidden rounded-xl !bg-surface-3 [&_.lk-participant-name]:text-ink [&_.lk-participant-name]:!bg-surface-1/80 [&_.lk-participant-name]:backdrop-blur" />
          </TrackLoop>
        </div>
        <ConnectionBadge state={connectionState} />
      </div>
    );
  }

  const localTile = (
    <MeetingPreviewTile
      name={fallbackName}
      stream={localStream}
      videoRef={localVideoRef}
      cameraEnabled={cameraEnabled}
      muted={false}
      featured
    />
  );
  const participantTiles = participants.filter((participant) => participant.displayName !== fallbackName).slice(0, 24);
  const effectiveLayout: Exclude<MeetingLayoutMode, "auto"> =
    layoutMode === "auto"
      ? screenStream
        ? "sidebar"
        : participantTiles.length === 0
        ? "grid"
        : participantTiles.length > 5
        ? "grid"
        : "spotlight"
      : layoutMode;

  if (screenStream && effectiveLayout === "sidebar") {
    return (
      <div className="grid h-full min-h-0 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_260px] bg-surface-1">
        <div className="relative min-h-0 overflow-hidden rounded-xl border border-border bg-surface-1">
          <video ref={screenVideoRef} className="h-full w-full object-contain" autoPlay muted playsInline />
          <div className="absolute left-4 top-4 rounded-md bg-surface-1/90 px-2 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur">
            You are presenting
          </div>
        </div>
        <div className="grid min-h-0 gap-3 overflow-hidden">
          {localTile}
          {participantTiles.slice(0, 3).map((participant) => (
            <ParticipantGridTile key={participant.id} participant={participant} />
          ))}
        </div>
        <ConnectionBadge state={connectionState} />
      </div>
    );
  }

  if (screenStream) {
    return (
      <div className="relative h-full w-full overflow-hidden p-2 bg-surface-1">
        <div className="h-full overflow-hidden rounded-xl border border-border bg-surface-1">
          <video ref={screenVideoRef} className="h-full w-full object-contain" autoPlay muted playsInline />
        </div>
        <ConnectionBadge state={connectionState} />
      </div>
    );
  }

  if (effectiveLayout === "spotlight") {
    return (
      <div className="grid h-full min-h-0 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_240px] bg-surface-1">
        {localTile}
        <div className="grid min-h-0 gap-3 overflow-hidden">
          {participantTiles.slice(0, 3).map((participant) => (
            <ParticipantGridTile key={participant.id} participant={participant} />
          ))}
        </div>
        <ConnectionBadge state={connectionState} />
        <LocalMediaError error={localMediaError} />
      </div>
    );
  }

  if (effectiveLayout === "grid" || effectiveLayout === "sidebar") {
    return (
      <div className="relative h-full min-h-0 p-2 bg-surface-1">
        <div className={`grid h-full min-h-0 gap-3 ${gridClassName(participantTiles.length + 1)}`}>
          {localTile}
          {participantTiles.map((participant) => (
            <ParticipantGridTile key={participant.id} participant={participant} />
          ))}
        </div>
        <ConnectionBadge state={connectionState} />
        <LocalMediaError error={localMediaError} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center justify-center px-6 py-20 bg-surface-2">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-3 text-2xl font-medium text-ink-muted shadow-sm">
        {initials(fallbackName)}
      </div>
      <p className="mt-4 max-w-xl truncate text-center text-[15px] font-medium text-ink">{fallbackName}</p>
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

function ConnectionBadge({ state }: { state: ConnectionState }) {
  return null;
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

function MeetingPreviewTile({
  name,
  stream,
  videoRef,
  cameraEnabled,
  muted,
  featured,
}: {
  name: string;
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraEnabled: boolean;
  muted: boolean;
  featured?: boolean;
}) {
  const hasVideo = cameraEnabled && Boolean(stream?.getVideoTracks().length);

  return (
    <div className="relative min-h-0 overflow-hidden rounded-xl border border-border bg-surface-3">
      {hasVideo ? (
        <video ref={videoRef} className="h-full w-full object-cover -scale-x-100" autoPlay muted playsInline />
      ) : (
        <div className="grid h-full min-h-[160px] place-items-center">
          <div className={`${featured ? "h-24 w-24 text-3xl" : "h-14 w-14 text-xl"} grid place-items-center rounded-full bg-slate-300 font-medium text-ink shadow-sm`}>
            {initials(name) || "H"}
          </div>
        </div>
      )}
      <TileLabel name={name} muted={muted} />
    </div>
  );
}

function ParticipantGridTile({ participant }: { participant: TranslationRoomParticipantDto }) {
  const muted = participant.isTranslationAudioEnabled === false;
  return (
    <div className="relative min-h-[128px] overflow-hidden rounded-xl border border-border bg-surface-3">
      <div className="grid h-full place-items-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-300 text-xl font-medium text-ink shadow-sm">
          {initials(participant.displayName)}
        </div>
      </div>
      <TileLabel name={participant.displayName} muted={muted} />
    </div>
  );
}

function TileLabel({ name, muted }: { name: string; muted: boolean }) {
  return (
    <>
      <div className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-md bg-surface-1/90 px-2 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur">
        {name}
      </div>
      <div className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-md bg-surface-1/90 text-ink shadow-sm backdrop-blur">
        {muted ? <MicrophoneSlash className="h-3.5 w-3.5" /> : <Microphone className="h-3.5 w-3.5" />}
      </div>
    </>
  );
}

function LocalMediaError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="absolute bottom-5 left-5 right-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 shadow-sm backdrop-blur">
      {error}
    </div>
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
