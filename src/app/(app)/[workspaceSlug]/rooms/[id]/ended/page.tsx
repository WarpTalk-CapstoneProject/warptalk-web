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
  Archive,
  ArrowClockwise,
  ChatCircleText,
  DownloadSimple,
  FileText,
  Sparkle,
  Spinner,
  Star,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { FeedbackDialog } from "@/components/rooms/feedback-dialog";
import {
  ArtifactsPanel,
  MeetingRecordTabButton,
  SummaryPanel,
  useArtifactDownload,
} from "@/components/rooms/meeting-record-panels";
import { useEndedRoomRecord } from "@/hooks/use-room-history";
import { useTranslationRoomFeedbackState } from "@/hooks/use-translationRooms";
import { getErrorMessage } from "@/lib/api/errors";
import { formatMeetingDuration, resolveMeetingDurationSeconds } from "@/lib/meeting/room-history-mapping";
import { translationRoomService } from "@/services/translation-room.service";
import { useAuthStore } from "@/stores/auth-store";
import { MinutesPanel } from "@/components/rooms/minutes-panel";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { RoomHistoryArtifact } from "@/types/roomHistory";

type RecordTab = "summary" | "minutes" | "transcript" | "files";

export default function RoomEndedPage() {
  const { id: roomId, workspaceSlug } = useParams<{ id: string; workspaceSlug: string }>();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const user = useAuthStore((state) => state.user);

  const [tab, setTab] = useState<RecordTab>("summary");

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
      </div>

      <div className="mt-7 border-b border-border">
        <div className="flex items-center gap-1" role="tablist">
          <MeetingRecordTabButton
            active={tab === "summary"}
            onClick={() => setTab("summary")}
            icon={Sparkle}
            label="Summary"
          />
          <MeetingRecordTabButton
            active={tab === "minutes"}
            onClick={() => setTab("minutes")}
            icon={FileText}
            label="Biên bản"
          />
          <MeetingRecordTabButton
            active={tab === "transcript"}
            onClick={() => setTab("transcript")}
            icon={ChatCircleText}
            label="Transcript"
          />
          <MeetingRecordTabButton
            active={tab === "files"}
            onClick={() => setTab("files")}
            icon={Archive}
            label="Files"
            count={artifacts.length}
          />
        </div>
      </div>

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
        ) : tab === "minutes" ? (
          // Deliberately behind the "still writing this up" gate above: the draft is assembled
          // from the summary artifact, so drawing it up before the finalizer has run would
          // produce a minutes document with an empty body and consume its number doing it.
          <MinutesPanel
            roomId={roomId}
            canManage={room?.hostId === user?.id || Boolean(room?.isHost)}
          />
        ) : tab === "summary" ? (
          <SummaryPanel
            room={record}
            busyArtifactId={busyArtifactId}
            onDownload={downloadArtifact}
          />
        ) : tab === "transcript" ? (
          <TranscriptReader artifact={transcriptArtifact} />
        ) : (
          <ArtifactsPanel
            artifacts={artifacts}
            busyArtifactId={busyArtifactId}
            onDownload={downloadArtifact}
          />
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

/**
 * The transcript, laid out as a conversation.
 *
 * Read through the download endpoint rather than from the list payload, for two reasons: the list
 * does not always carry an artifact's content, and the download path is where the server renders
 * the stored markdown down to plain text. So this receives `[Nam (VI)]: xin chào` — a shape worth
 * parsing — instead of `**[Nam (VI)]**: xin chào`, which is a shape worth apologising for.
 *
 * Cached forever once fetched: a finished meeting's transcript cannot change under the reader.
 */
function TranscriptReader({ artifact }: { artifact: RoomHistoryArtifact | undefined }) {
  const { data, status } = useQuery({
    queryKey: ["translationRooms", "artifact", artifact?.id, "content"],
    queryFn: async () => (await translationRoomService.artifactDownload(artifact!.id)).data,
    enabled: Boolean(artifact?.id),
    staleTime: Infinity,
  });

  if (!artifact) {
    return (
      <Placeholder
        icon={<FileText className="h-5 w-5" />}
        title="No transcript"
        description="Nothing was transcribed for this meeting."
      />
    );
  }

  if (status === "pending") {
    return <Placeholder icon={<Spinner className="h-5 w-5 animate-spin" />} title="Loading transcript" />;
  }

  if (status === "error" || !data?.content?.trim()) {
    return (
      <Placeholder
        icon={<WarningCircle className="h-5 w-5" />}
        title="Transcript unavailable"
        description="This meeting's transcript could not be read."
      />
    );
  }

  const lines = parseTranscript(data.content);

  return (
    <div className="space-y-3 pb-4">
      {lines.map((line, index) =>
        line.speaker ? (
          <p key={index} className="text-[13px] leading-6 text-ink">
            <span className="mr-2 font-medium text-ink-muted">{line.speaker}</span>
            {line.text}
          </p>
        ) : (
          // The header block and any status sentence. Quieter than speech, and never given a
          // speaker column it does not have.
          <p key={index} className="text-[12px] leading-6 text-ink-subtle">
            {line.text}
          </p>
        ),
      )}
    </div>
  );
}

/**
 * `[Nam (VI)]: xin chào` → a speaker and what they said.
 *
 * Deliberately conservative: only a line that BEGINS with a bracketed tag and a colon is treated
 * as speech. Everything else — the generated header, the "no speech recorded" sentence — is passed
 * through as prose rather than guessed at.
 */
function parseTranscript(content: string): { speaker?: string; text: string }[] {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^\[([^\]]+)\]:\s*(.*)$/.exec(line);
      return match ? { speaker: match[1], text: match[2] } : { text: line };
    });
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
