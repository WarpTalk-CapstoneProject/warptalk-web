"use client";

/**
 * What a meeting leaves behind, once it has ended.
 *
 * WHAT THIS PAGE USED TO BE
 *   A status board for a background job. It rendered the artifact ROWS — "transcript export
 *   (MARKDOWN) · Ready", "summary export (JSON) · processing" — with a caret to expand each one,
 *   and that was the whole page. The reader had just left a meeting and wanted to know what was
 *   said and what was decided; they were shown a queue.
 *
 *   It also duplicated a component that already exists and is better. The room's own page has a
 *   Meeting record with Summary / Transcript / Files, and this page reimplemented a worse third of
 *   it against a different data source. Two implementations of one screen is how they drift.
 *
 * WHAT IT IS NOW
 *   A reading page. One centred column, the meeting's own name at the top rather than a route
 *   label, its facts on one quiet line, and the summary open by default — because "what did this
 *   meeting decide" is the question somebody has when they land here. The panels are the SAME
 *   components the room page uses (SummaryPanel, ArtifactsPanel), so a fix to either lands on both.
 *
 *   The transcript tab reads the transcript export's own text through the download endpoint, which
 *   now serves plain text rather than markdown — so the speaker lines can be laid out as speaker
 *   lines instead of printed with their asterisks showing.
 *
 * THE PROCESSING STATE IS STILL HERE
 *   It just is not the page any more. The summary lands roughly 40s after the meeting ends, so the
 *   first minute genuinely has nothing to read — that minute gets a sentence, and the page polls
 *   itself out of it.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowClockwise,
  DownloadSimple,
  Spinner,
  Star,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { FeedbackDialog } from "@/components/rooms/feedback-dialog";
import {
  useArtifactDownload,
} from "@/components/rooms/meeting-record-panels";
import { useEndedRoomRecord } from "@/hooks/use-room-history";
import { useTranslationRoomFeedbackState } from "@/hooks/use-translationRooms";
import { getErrorMessage } from "@/lib/api/errors";
import { formatMeetingDuration, resolveMeetingDurationSeconds } from "@/lib/meeting/room-history-mapping";
import { translationRoomService } from "@/services/translation-room.service";
import { toast } from "sonner";

import {
  MeetingRecordSection,
  MeetingTranscriptArtifact,
  useMeetingTranscript,
} from "@/components/rooms/meeting-record-section";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { RoomHistoryArtifact } from "@/types/roomHistory";

export default function RoomEndedPage() {
  const { id: roomId, workspaceSlug } = useParams<{ id: string; workspaceSlug: string }>();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  // WT-449: ask for the rating rather than waiting to be asked for it.
  //
  // The dialog was reachable only through the "Rate this meeting" button on this page, which
  // meant it was reachable only by someone who had already decided to look for it — and until
  // the fix in persistent-meeting-session, only the host reached this page at all. Feedback
  // that has to be hunted for is feedback nobody leaves.
  //
  // DERIVED, not synchronized: opening it from an effect that watches the query would be a
  // setState cascade (and the repo's lint says so). The dialog is simply open whenever this
  // meeting is unrated and the reader has not waved it away, which is a fact about the current
  // render, not an event to react to.
  //
  // `dismissed` is deliberately not persisted. Someone who closes the prompt and comes back may
  // have changed their mind, and the button below is still there either way; what must not
  // happen is re-prompting a meeting they already rated, and `hasSubmitted` settles that.
  const feedbackState = useTranslationRoomFeedbackState(roomId);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const [feedbackRequested, setFeedbackRequested] = useState(false);
  // `=== false` rather than `!hasSubmitted`: while the query is still in flight the value is
  // undefined, and treating "not known yet" as "unrated" would flash the dialog open and then
  // shut on every load of a meeting that was already rated.
  const feedbackOpen =
    feedbackRequested ||
    (feedbackState.data?.hasSubmitted === false && !feedbackDismissed);

  function setFeedbackOpen(open: boolean) {
    setFeedbackRequested(open);
    if (!open) setFeedbackDismissed(true);
  }

  const roomQuery = useQuery({
    queryKey: ["translationRooms", roomId],
    queryFn: async () => (await translationRoomService.get(roomId)).data,
    enabled: Boolean(roomId),
  });

  // The same query the room page and the archive read — one cache entry, one request. It polls
  // itself while anything is still generating (see useRoomHistory), which is what carries this
  // page out of its own processing state without a reload.
  const recordQuery = useEndedRoomRecord(workspaceId ?? null, roomId);
  const record = recordQuery.data ?? null;

  const { busyArtifactId, downloadArtifact } = useArtifactDownload(() => {
    void recordQuery.refetch();
  });

  const room = roomQuery.data;
  const artifacts = useMemo<RoomHistoryArtifact[]>(() => record?.artifacts ?? [], [record]);
  const transcriptArtifact = artifacts.find((artifact) => artifact.type === "transcript_export");

  // Derived exactly as the room page derives it, including room.isHost — a host transfer leaves
  // hostId behind, and this page is where a host is sent the moment they end a meeting, so getting
  // it wrong here hides the publish control from the one person entitled to use it.
  const user = useAuthStore((state) => state.user);
  const isHost = room ? room.hostId === user?.id || Boolean(room.isHost) : false;

  // The saved segments, not the export file's text — which is what makes a summary citation
  // clickable here. See useMeetingTranscript for why this is one implementation and not two.
  const {
    transcript: savedTranscript,
    segments: transcriptSegments,
    highlightedSegmentId,
    jumpToTranscriptMoment,
    refetchSegments,
  } = useMeetingTranscript(roomId);

  async function copyText(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    toast.success(`${label} copied.`);
  }

  const durationSeconds = record
    ? resolveMeetingDurationSeconds({
        durationSeconds: record.durationSeconds,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
      })
    : 0;

  const title = record?.title || room?.title || "Meeting";
  const isLoading = roomQuery.isLoading || recordQuery.isLoading;
  const error = roomQuery.error ?? recordQuery.error;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* The meeting's own name, at the size of a document title. This page used to open with
          the workspace toolbar and a status badge — chrome for a list, on a page that holds one
          thing. */}
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-subtle">
        Meeting ended
      </p>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
        {title}
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
        {record?.endedAt ? <span>{formatEndedAt(record.endedAt)}</span> : null}
        {durationSeconds > 0 ? (
          <>
            <Dot />
            <span>{formatMeetingDuration(durationSeconds)}</span>
          </>
        ) : null}
        {record?.participantCount ? (
          <>
            <Dot />
            <span>
              {record.participantCount} {record.participantCount === 1 ? "participant" : "participants"}
            </span>
          </>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {transcriptArtifact ? (
          <button
            type="button"
            onClick={() => downloadArtifact(transcriptArtifact)}
            disabled={busyArtifactId === transcriptArtifact.id}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            <DownloadSimple size={13} weight="bold" />
            Download transcript
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <Star size={13} />
          Rate this meeting
        </button>
        <Link
          href={`/${workspaceSlug}/history`}
          className="inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          View history
        </Link>
        {/* The record below is the same component the room page renders, but the room page also
            carries the invitees, the notes and the recurrence — so the way back is worth keeping
            rather than leaving this page as a cul-de-sac. */}
        <Link
          href={`/${workspaceSlug}/rooms/${roomId}`}
          className="inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          Open room
        </Link>
      </div>

      {/* The room's own Meeting record, not a third of it.
          This page used to render its own three tabs, and its transcript tab read the export
          file's plain text — so a summary point had nothing to scroll to, and the publish and
          regenerate controls were not here at all. A host who has just ended a meeting is the
          person most likely to want both, and was the one person who could not reach them.
          Same component as rooms/[id], so a fix to either lands on both — which is what this
          page's own docstring always claimed. */}
      <div className="mt-5">
        {isLoading ? (
          <Placeholder icon={<Spinner className="h-5 w-5 animate-spin" />} title="Loading this meeting" />
        ) : error ? (
          <Placeholder
            icon={<WarningCircle className="h-5 w-5" />}
            title="This meeting's record is unavailable"
            description={getErrorMessage(error, "Could not load the meeting record.")}
            action={
              <button
                type="button"
                onClick={() => {
                  void roomQuery.refetch();
                  void recordQuery.refetch();
                }}
                className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Retry
              </button>
            }
          />
        ) : !record ? (
          // Not an error and not empty — the finalizer is still running. Said as a sentence
          // about the meeting rather than as a list of pending jobs.
          <Placeholder
            icon={<ArrowClockwise className="h-5 w-5 animate-spin" />}
            title="Still writing this up"
            description="The transcript and the AI summary are produced after a meeting ends — usually within a minute. This page updates on its own."
          />
        ) : (
          <>
            {/* Said plainly, because the alternative is a host regenerating a summary of nothing
                and concluding the feature is broken. A meeting where translation was never
                started has no transcript, and no transcript is no summary. */}
            {transcriptSegments.length === 0 ? (
              <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] leading-snug text-amber-700 dark:text-amber-400">
                Nothing was transcribed in this meeting, so there is nothing to summarise.
                A transcript is only produced once translation has been started.
              </p>
            ) : null}
            <MeetingRecordSection
              roomId={roomId}
              isHost={isHost}
              artifactAccess={room?.settings?.artifactAccess}
              endedRecord={record}
              onRecordChanged={() => void recordQuery.refetch()}
              onJumpToMoment={jumpToTranscriptMoment}
              transcript={
                <MeetingTranscriptArtifact
                  segments={transcriptSegments}
                  baseTime={savedTranscript?.createdAt || record.startedAt || undefined}
                  roomId={roomId}
                  currentUserId={user?.id}
                  isEnded
                  onCopy={copyText}
                  transcriptId={savedTranscript?.id}
                  transcriptStatus={savedTranscript?.status}
                  canEdit={isHost}
                  onSegmentsChanged={refetchSegments}
                  highlightedSegmentId={highlightedSegmentId}
                />
              }
              transcriptCount={transcriptSegments.length}
            />
          </>
        )}
      </div>

      <FeedbackDialog
        roomId={roomId}
        meetingTitle={title}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
      />
    </div>
  );
}



function Placeholder({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
      <span className="text-ink-subtle">{icon}</span>
      <h2 className="mt-3 text-[14px] font-medium text-ink">{title}</h2>
      {description ? (
        <p className="mt-1.5 max-w-[380px] text-[12px] leading-5 text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function Dot() {
  return <span className="text-ink-subtle">·</span>;
}

function formatEndedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
