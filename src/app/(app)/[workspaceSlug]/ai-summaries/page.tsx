"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  CheckCircle,
  CheckSquare,
  ChatCircleText,
  Clock,
  Copy,
  DownloadSimple,
  Funnel,
  Scroll,
  SlidersHorizontal,
  SpinnerGap,
  Translate,
  Users,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { useRoomHistory } from "@/hooks/use-room-history";
import { useTranslationRoomSessions } from "@/hooks/use-translationRooms";
import {
  groupSavedTranscriptSegments,
  groupSegmentsByTranslationSession,
} from "@/lib/transcript-display";
import { loadSavedTranscript } from "@/lib/transcript-history";
import { cn } from "@/lib/utils";
import { translationRoomService } from "@/services/translationRoom.service";
import { openArtifactDownload } from "@/lib/download-artifact";
import { transcriptService } from "@/services/transcript.service";
import { useAuthStore } from "@/stores/auth-store";
import type {
  EndedRoomHistoryItem,
  RoomHistoryArtifact,
  RoomArtifactStatus,
} from "@/types/roomHistory";
import type { TranscriptDto, TranscriptSegmentDto } from "@/types/transcript";

type TranscriptFilter = "all" | "ready" | "processing" | "attention";
type DetailTab = "transcript" | "summary" | "artifacts";

type QueueItem = {
  room: EndedRoomHistoryItem;
  transcriptArtifact?: RoomHistoryArtifact;
  status: RoomArtifactStatus;
};

type TranscriptData = {
  transcript: TranscriptDto;
  segments: TranscriptSegmentDto[];
} | null;

const transcriptFilters: Array<{ value: TranscriptFilter; label: string }> = [
  { value: "all", label: "All meetings" },
  { value: "ready", label: "Export ready" },
  { value: "processing", label: "Processing" },
  { value: "attention", label: "Needs attention" },
];

export default function TranscriptsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TranscriptFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("transcript");
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);
  const history = useRoomHistory();

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (history.data?.rooms ?? [])
      .map((room): QueueItem => {
        const transcriptArtifact = room.artifacts.find(
          (artifact) => artifact.type === "transcript_export",
        );
        return {
          room,
          transcriptArtifact,
          status: transcriptArtifact?.status ?? "missing",
        };
      })
      .filter((item) => {
        const needsAttention =
          ["failed", "expired"].includes(item.status) ||
          item.room.artifacts.some((artifact) => artifact.consentRequired);
        const matchesFilter =
          filter === "all" ||
          item.status === filter ||
          (filter === "attention" && needsAttention);
        const matchesQuery =
          !normalized ||
          [
            item.room.title,
            item.room.translationRoomCode,
            item.room.hostName,
          ].some((value) => value.toLowerCase().includes(normalized));
        return matchesFilter && matchesQuery;
      });
  }, [filter, history.data?.rooms, query]);

  const selected =
    items.find((item) => item.room.id === selectedId) ?? items[0];

  const transcriptQuery = useQuery({
    queryKey: ["room-transcript", selected?.room.id],
    queryFn: async (): Promise<TranscriptData> => {
      if (!selected) return null;
      return loadSavedTranscript(selected.room.id, transcriptService);
    },
    enabled: Boolean(selected?.room.id),
  });

  function selectRoom(id: string) {
    setSelectedId(id);
    setDetailTab("transcript");
  }

  async function downloadArtifact(artifact: RoomHistoryArtifact) {
    if (artifact.status !== "ready") {
      toast.error("This file is not ready to download.");
      return;
    }

    setBusyArtifactId(artifact.id);
    try {
      if (artifact.consentRequired)
        await translationRoomService.approveArtifactConsent(artifact.id);
      const { data } = await translationRoomService.artifactDownload(
        artifact.id,
      );
      openArtifactDownload(data);
      if (artifact.consentRequired) await history.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not download this file.",
      );
    } finally {
      setBusyArtifactId(null);
    }
  }

  return (
    <main className="flex h-full flex-col bg-surface-1 text-ink">
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="flex shrink-0 items-center justify-between gap-4 px-4 py-3"
          role="tablist"
          aria-label="Transcript filters"
        >
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            {transcriptFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={cn(
                  "flex items-center justify-center rounded-full border px-4 py-1.5 text-[13px] capitalize transition-all select-none",
                  filter === item.value
                    ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                    : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2 pl-4">
            <ExpandingSearchDock
              value={query}
              onValueChange={setQuery}
              placeholder="Search transcripts..."
              ariaLabel="Search transcripts"
              collapsedWidth={28}
              expandedWidth={220}
              className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
              iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
              clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
              inputClassName="h-[26px] text-[12px]"
            />
            <button
              className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              title="Active transcript filter"
            >
              <Funnel weight="bold" size={13} />
              {filter !== "all" && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
              )}
            </button>
            <button
              className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              title={`${items.length} results`}
            >
              <SlidersHorizontal weight="bold" size={13} />
            </button>
          </div>
        </div>

        <section
          className="min-h-0 flex-1 overflow-hidden border-t border-border bg-surface-1"
          aria-label="Transcript review queue"
        >
          {history.isLoading ? (
            <LoadingState />
          ) : history.isError ? (
            <ErrorState onRetry={() => history.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState hasQuery={Boolean(query)} />
          ) : (
            <div className="grid h-full min-h-0 lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto border-b border-border lg:border-b-0 lg:border-r">
                <div className="flex h-10 items-center justify-between border-b border-border bg-surface-2/45 px-4">
                  <span className="text-[10px] font-medium text-ink-subtle">
                    TRANSCRIPT QUEUE
                  </span>
                  <span className="text-[10px] tabular-nums text-ink-subtle">
                    {items.length}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {items.map((item) => (
                    <QueueRow
                      key={item.room.id}
                      item={item}
                      selected={selected?.room.id === item.room.id}
                      onSelect={() => selectRoom(item.room.id)}
                    />
                  ))}
                </div>
              </div>
              {selected ? (
                <TranscriptWorkspace
                  item={selected}
                  tab={detailTab}
                  onTabChange={setDetailTab}
                  transcriptState={transcriptQuery}
                  busyArtifactId={busyArtifactId}
                  onDownload={downloadArtifact}
                />
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function QueueRow({
  item,
  selected,
  onSelect,
}: {
  item: QueueItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex w-full gap-3 px-4 py-4 text-left outline-none transition-colors hover:bg-surface-2/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30",
        selected && "bg-surface-2",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          selected ? "bg-ink" : "bg-transparent",
        )}
      />
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-md border",
          selected
            ? "border-ink bg-ink text-surface-1"
            : "border-border bg-canvas text-ink-muted",
        )}
      >
        <Scroll size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="truncate text-[12px] font-medium text-ink">
            {item.room.title}
          </span>
          <StatusMark item={item} />
        </span>
        <span className="mt-1 block truncate text-[10px] text-ink-subtle">
          {item.room.translationRoomCode} · {formatDate(item.room.endedAt)}
        </span>
        <span className="mt-2 flex items-center justify-between text-[10px] text-ink-muted">
          <span className="truncate">{formatLanguageRoute(item.room)}</span>
          <ArrowRight
            size={12}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
      </span>
    </button>
  );
}

function TranscriptWorkspace({
  item,
  tab,
  onTabChange,
  transcriptState,
  busyArtifactId,
  onDownload,
}: {
  item: QueueItem;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  transcriptState: UseQueryResult<TranscriptData>;
  busyArtifactId: string | null;
  onDownload: (artifact: RoomHistoryArtifact) => void;
}) {
  const { room } = item;
  const segments = transcriptState.data?.segments ?? [];
  const summaryArtifact = room.artifacts.find(
    (artifact) => artifact.type === "summary_export",
  );

  async function copyTranscriptAsText() {
    if (!segments.length) return;
    const text = segments
      .map((segment) => `[${segment.speakerName}] ${segment.originalText}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Transcript copied to clipboard.");
    } catch {
      toast.error("Could not copy the transcript.");
    }
  }

  return (
    <article className="min-w-0">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusMark item={item} showLabel />
            <span className="text-[10px] text-ink-subtle">
              {room.translationRoomCode}
            </span>
          </div>
          <h2 className="mt-3 text-[20px] font-semibold leading-7">
            {room.title}
          </h2>
          <p className="mt-1 text-[11px] text-ink-muted">
            Hosted by {room.hostName} · ended {formatDate(room.endedAt)}
          </p>
        </div>
        {tab === "transcript" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!segments.length}
            onClick={copyTranscriptAsText}
            className="h-8 shrink-0 rounded-md text-[11px] shadow-none"
          >
            <Copy size={14} /> Copy transcript
          </Button>
        ) : null}
      </div>

      <div
        className="flex items-center gap-1 border-b border-border px-5"
        role="tablist"
        aria-label="Meeting record sections"
      >
        <DetailTabButton
          active={tab === "transcript"}
          onClick={() => onTabChange("transcript")}
          icon={Scroll}
          label="Transcript"
          count={segments.length || undefined}
        />
        <DetailTabButton
          active={tab === "summary"}
          onClick={() => onTabChange("summary")}
          icon={ChatCircleText}
          label="Summary"
        />
        <DetailTabButton
          active={tab === "artifacts"}
          onClick={() => onTabChange("artifacts")}
          icon={Archive}
          label="Artifacts"
          count={room.artifacts.length}
        />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-5 lg:p-7">
          {tab === "transcript" ? (
            <TranscriptPanel
              state={transcriptState}
              roomId={room.id}
              baseTime={transcriptState.data?.transcript.createdAt || room.startedAt}
            />
          ) : null}
          {tab === "summary" ? (
            <SummaryPanel
              room={room}
              artifact={summaryArtifact}
              busy={busyArtifactId === summaryArtifact?.id}
              onDownload={onDownload}
            />
          ) : null}
          {tab === "artifacts" ? (
            <ArtifactsPanel
              artifacts={room.artifacts}
              busyArtifactId={busyArtifactId}
              onDownload={onDownload}
            />
          ) : null}
        </div>

        <aside className="border-t border-border p-5 xl:border-l xl:border-t-0">
          <h3 className="text-[11px] font-semibold">Meeting context</h3>
          {room.description ? (
            <p className="mt-2 text-[11px] leading-5 text-ink-muted">
              {room.description}
            </p>
          ) : null}
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <ContextRow
              icon={Users}
              label="Participants"
              value={String(room.participantCount)}
            />
            <ContextRow
              icon={Clock}
              label="Duration"
              value={formatDuration(room.durationSeconds)}
            />
            <ContextRow
              icon={Translate}
              label="Language route"
              value={formatLanguageRoute(room)}
            />
            <ContextRow
              icon={Archive}
              label="Artifacts"
              value={String(room.artifacts.length)}
            />
          </dl>
        </aside>
      </div>
    </article>
  );
}

function DetailTabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-10 items-center gap-1.5 border-b-2 px-3 text-[12px] font-medium transition-colors",
        active
          ? "border-ink text-ink"
          : "border-transparent text-ink-muted hover:text-ink",
      )}
    >
      <Icon size={14} />
      {label}
      {typeof count === "number" ? (
        <span className="text-[10px] text-ink-subtle">({count})</span>
      ) : null}
    </button>
  );
}

function TranscriptPanel({
  state,
  roomId,
  baseTime,
}: {
  state: UseQueryResult<TranscriptData>;
  roomId: string;
  baseTime?: string;
}) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const sessionsQuery = useTranslationRoomSessions(roomId);

  if (state.isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center border border-border bg-canvas">
        <div className="flex items-center gap-2 text-[11px] text-ink-muted">
          <SpinnerGap size={15} className="animate-spin" />
          Loading transcript
        </div>
      </div>
    );
  }

  if (state.isError) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center border border-border bg-canvas p-8 text-center">
        <WarningCircle size={28} className="text-danger" />
        <h3 className="mt-4 text-[15px] font-semibold">
          Couldn&apos;t load transcript
        </h3>
        <p className="mt-2 max-w-[360px] text-[11px] leading-5 text-ink-muted">
          The transcript service returned an error. Your meeting data has not
          been replaced with an empty result.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => state.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const segments = groupSavedTranscriptSegments(state.data?.segments ?? []);
  const blocks = groupSegmentsByTranslationSession(segments, sessionsQuery.data ?? [], baseTime);
  const showSessionLabels = blocks.length > 1;

  if (!segments.length) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center border border-border bg-canvas p-8 text-center">
        <Scroll size={28} className="text-ink-muted" />
        <h3 className="mt-4 text-[15px] font-semibold">
          No transcript recorded
        </h3>
        <p className="mt-2 max-w-[360px] text-[11px] leading-5 text-ink-muted">
          This meeting ended without any captured speech, or the transcript
          hasn&apos;t synced yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[360px] flex-col border border-border bg-canvas">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-[10px] font-medium text-ink-subtle">
          DIALOGUE
        </span>
        <span className="text-[10px] text-ink-subtle">
          {segments.length} lines
        </span>
      </div>
      <div className="max-h-[560px] flex-1 space-y-2 overflow-y-auto p-5">
        {blocks.map((block) => (
          <div key={block.sessionNumber} className="space-y-3">
            {showSessionLabels ? (
              <div className="flex items-center gap-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                <div className="h-px flex-1 bg-border" />
                <span>
                  Translation {block.sessionNumber}
                  {block.session?.startedAt
                    ? ` · ${new Date(block.session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${
                        block.session.endedAt
                          ? new Date(block.session.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "now"
                      }`
                    : ""}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            {block.segments.map((segment) => {
              const isSelf = Boolean(currentUserId) && segment.speakerParticipantId === currentUserId;
              return (
                <div key={segment.id} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                  <div className={`flex max-w-[75%] flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}>
                    <span className={`flex items-baseline gap-2 text-[10px] text-ink-subtle ${isSelf ? "flex-row-reverse" : ""}`}>
                      <span className="font-medium text-ink">
                        {isSelf ? "You" : segment.speakerName}
                      </span>
                      <span>{formatTimestamp(segment.startTimeMs)}</span>
                    </span>
                    <div
                      className={`rounded-2xl px-3 py-2 text-[12px] leading-6 ${
                        isSelf
                          ? "rounded-tr-sm bg-primary text-white"
                          : "rounded-tl-sm border border-border bg-surface-1 text-ink-muted"
                      }`}
                    >
                      {segment.originalText}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryPanel({
  room,
  artifact,
  busy,
  onDownload,
}: {
  room: EndedRoomHistoryItem;
  artifact?: RoomHistoryArtifact;
  busy: boolean;
  onDownload: (artifact: RoomHistoryArtifact) => void;
}) {
  const summary = room.summary;
  const ready = artifact?.status === "ready";
  const hasStructuredContent = Boolean(
    summary &&
    !summary.insufficientData &&
    (summary.summary || summary.decisions.length || summary.actionItems.length),
  );
  const recentlyEnded = useRecentlyEnded(room.endedAt);
  const isGenerating = !artifact && recentlyEnded;

  async function copyAsText() {
    if (!summary) return;
    const lines = [
      `${room.title} — AI meeting summary`,
      "",
      "Overview",
      summary.summary || "(no overview)",
      "",
      "Decisions",
      ...(summary.decisions.length
        ? summary.decisions.map((decision) => `- ${decision}`)
        : ["(none recorded)"]),
      "",
      "Action items",
      ...(summary.actionItems.length
        ? summary.actionItems.map(
            (action) =>
              `- [ ] ${action.owner ? `${action.owner}: ` : ""}${action.task}`,
          )
        : ["(none recorded)"]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Summary copied to clipboard.");
    } catch {
      toast.error("Could not copy the summary.");
    }
  }

  return (
    <div className="flex min-h-[360px] flex-col border border-border bg-canvas">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-[10px] font-medium text-ink-subtle">
          SUMMARY OUTPUT
        </span>
        <span className="flex items-center gap-3">
          <span className="text-[10px] text-ink-subtle">
            {artifact?.format || "No file"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!hasStructuredContent}
            onClick={copyAsText}
            className="h-6 rounded px-2 text-[10px] shadow-none"
          >
            <Copy size={12} /> Copy
          </Button>
        </span>
      </div>

      {hasStructuredContent && summary ? (
        <div className="flex-1 space-y-6 p-6">
          <section>
            <h3 className="text-[11px] font-semibold uppercase text-ink-subtle">
              Overview
            </h3>
            <p className="mt-2 text-[12px] leading-6 text-ink">
              {summary.summary}
            </p>
          </section>
          <section>
            <h3 className="text-[11px] font-semibold uppercase text-ink-subtle">
              Decisions
            </h3>
            {summary.decisions.length ? (
              <ul className="mt-2 space-y-1.5">
                {summary.decisions.map((decision, index) => (
                  <li
                    key={index}
                    className="flex gap-2 text-[12px] leading-5 text-ink"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-subtle" />
                    {decision}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-ink-muted">
                No decisions recorded.
              </p>
            )}
          </section>
          <section>
            <h3 className="text-[11px] font-semibold uppercase text-ink-subtle">
              Action items
            </h3>
            {summary.actionItems.length ? (
              <ul className="mt-2 space-y-2">
                {summary.actionItems.map((action, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-[12px] leading-5 text-ink"
                  >
                    <CheckSquare
                      size={14}
                      className="mt-0.5 shrink-0 text-ink-subtle"
                    />
                    <span>
                      {action.owner ? (
                        <span className="font-medium">{action.owner}: </span>
                      ) : null}
                      {action.task}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-ink-muted">
                No action items recorded.
              </p>
            )}
          </section>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div className="max-w-[360px]">
            {isGenerating ? (
              <SpinnerGap
                size={28}
                className="mx-auto animate-spin text-ink-muted"
              />
            ) : (
              <ChatCircleText size={28} className="mx-auto text-ink-muted" />
            )}
            <h3 className="mt-4 text-[15px] font-semibold">
              {isGenerating ? "Generating summary…" : "No summary output"}
            </h3>
            <p className="mt-2 text-[11px] leading-5 text-ink-muted">
              {isGenerating
                ? "WarpTalk's AI assistant is analyzing the transcript. This usually takes under a minute."
                : summary?.insufficientData
                  ? "There wasn't enough transcript content in this meeting to generate a summary."
                  : "This meeting ended without a summary artifact."}
            </p>
          </div>
        </div>
      )}

      {artifact ? (
        <div className="border-t border-border p-4">
          <Button
            size="sm"
            variant={ready ? "default" : "outline"}
            disabled={!ready || busy}
            onClick={() => onDownload(artifact)}
            className="h-8 rounded-md text-[11px] shadow-none"
          >
            {busy ? (
              <SpinnerGap size={14} className="animate-spin" />
            ) : (
              <DownloadSimple size={14} />
            )}{" "}
            Download summary file
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ArtifactsPanel({
  artifacts,
  busyArtifactId,
  onDownload,
}: {
  artifacts: RoomHistoryArtifact[];
  busyArtifactId: string | null;
  onDownload: (artifact: RoomHistoryArtifact) => void;
}) {
  if (!artifacts.length) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center border border-border bg-canvas p-8 text-center">
        <Archive size={28} className="text-ink-muted" />
        <h3 className="mt-4 text-[15px] font-semibold">
          No retained artifacts
        </h3>
        <p className="mt-2 max-w-[360px] text-[11px] leading-5 text-ink-muted">
          Nothing has been generated or retained for this meeting yet.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[360px] border border-border bg-canvas">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-[10px] font-medium text-ink-subtle">
          RETAINED ARTIFACTS
        </span>
        <span className="text-[10px] text-ink-subtle">{artifacts.length}</span>
      </div>
      <div className="divide-y divide-border">
        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            type="button"
            disabled={busyArtifactId === artifact.id}
            onClick={() => onDownload(artifact)}
            className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/55 disabled:opacity-50"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-1">
              <ArtifactIcon artifact={artifact} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-ink">
                {artifact.title || artifactLabel(artifact.type)}
              </span>
              <span className="mt-0.5 block text-[10px] text-ink-subtle">
                {artifactLabel(artifact.type)} · {artifact.format || "—"} ·{" "}
                {artifactStatusLabel(artifact)}
              </span>
            </span>
            {busyArtifactId === artifact.id ? (
              <SpinnerGap size={14} className="animate-spin text-ink-muted" />
            ) : (
              <DownloadSimple
                size={14}
                className="text-ink-subtle transition-colors group-hover:text-ink"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArtifactIcon({ artifact }: { artifact: RoomHistoryArtifact }) {
  if (artifact.status === "processing")
    return <SpinnerGap size={14} className="animate-spin text-ink-muted" />;
  if (["failed", "missing", "expired"].includes(artifact.status))
    return <WarningCircle size={14} className="text-ink-muted" />;
  return <CheckCircle size={14} className="text-primary" />;
}

function StatusMark({
  item,
  showLabel = false,
}: {
  item: QueueItem;
  showLabel?: boolean;
}) {
  const attention =
    ["failed", "expired"].includes(item.status) ||
    item.room.artifacts.some((artifact) => artifact.consentRequired);
  const label = attention
    ? item.room.artifacts.some((artifact) => artifact.consentRequired)
      ? "Consent required"
      : item.status
    : item.status === "missing"
      ? "Export not generated"
      : item.status;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium capitalize",
        attention ? "text-ink" : "text-ink-muted",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          item.status === "ready" && !attention
            ? "bg-emerald-500"
            : item.status === "processing"
              ? "bg-amber-500"
              : "bg-ink-subtle",
        )}
      />
      {showLabel ? label : null}
    </span>
  );
}

function ContextRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-[10px]">
      <dt className="flex items-center gap-1.5 text-ink-subtle">
        <Icon size={12} />
        {label}
      </dt>
      <dd className="max-w-[150px] text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid min-h-[480px] place-items-center">
      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
        <SpinnerGap size={15} className="animate-spin" />
        Loading transcripts
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-[480px] place-items-center text-center">
      <div>
        <WarningCircle size={22} className="mx-auto text-ink-muted" />
        <p className="mt-3 text-[12px] font-medium">
          Transcripts could not be loaded
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">
          Check the translation-room service and try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 h-8"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="grid min-h-[480px] place-items-center text-center">
      <div>
        <Scroll size={22} className="mx-auto text-ink-muted" />
        <p className="mt-3 text-[12px] font-medium">
          {hasQuery
            ? "No meetings match this search"
            : "No finished meetings yet"}
        </p>
        <p className="mt-1 text-[11px] text-ink-muted">
          {hasQuery
            ? "Try a different meeting title, code, or host."
            : "Transcripts appear here after a meeting ends."}
        </p>
      </div>
    </div>
  );
}

/**
 * Date.now() can't be called directly in a render body (react-hooks/purity — two renders
 * at different real times would disagree on the same props). Deferring it to an effect
 * keeps the "still generating" spinner from flashing/hydration-mismatching.
 */
function useRecentlyEnded(endedAt: string, windowMs = 10 * 60 * 1000): boolean {
  const endTime = new Date(endedAt).getTime() + windowMs;
  const [observedNow, setObservedNow] = useState(() => Date.now());
  useEffect(() => {
    const remaining = endTime - Date.now();
    if (remaining <= 0) return;
    const timeout = window.setTimeout(
      () => setObservedNow(Date.now()),
      remaining + 1,
    );
    return () => window.clearTimeout(timeout);
  }, [endTime]);
  return observedNow < endTime;
}

function artifactLabel(type: RoomHistoryArtifact["type"]) {
  return (
    {
      transcript_export: "Transcript",
      summary_export: "AI summary",
      recording: "Recording",
      debug_log: "Debug log",
      audio_sample: "Audio sample",
    } as const
  )[type];
}

function artifactStatusLabel(artifact: RoomHistoryArtifact) {
  return artifact.consentRequired
    ? "Consent required"
    : artifact.status.charAt(0).toUpperCase() + artifact.status.slice(1);
}

function formatDuration(seconds: number) {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor((ms ?? 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatLanguageRoute(room: EndedRoomHistoryItem) {
  const targets = room.targetLanguages.length
    ? room.targetLanguages.join(", ")
    : "—";
  return `${room.sourceLanguage.toUpperCase()} → ${targets.toUpperCase()}`;
}
