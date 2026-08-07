"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import gsap from "gsap";
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
  PencilSimple,
  Scroll,
  SlidersHorizontal,
  SpinnerGap,
  Translate,
  Users,
  WarningCircle,
  Sparkle,
  Check,
  BookOpenText,
  ListChecks,
  User,
  Hash,
  CalendarBlank,
  SidebarSimple,
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
import { formatLanguageRoute as formatRoute } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { translationRoomService } from "@/services/translationRoom.service";
import { openArtifactDownload, saveBlobDownload } from "@/lib/download-artifact";
import { transcriptService } from "@/services/transcript.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
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
  const searchParams = useSearchParams();
  const requestedRoomId = searchParams.get("room");
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TranscriptFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("transcript");
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);
  const history = useRoomHistory(activeWorkspaceId);

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
    items.find((item) => item.room.id === selectedId) ??
    items.find((item) => item.room.id === requestedRoomId) ??
    items[0];

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
            <div className="grid h-full min-h-0 lg:grid-cols-[250px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto border-b border-border lg:border-b-0 lg:border-r bg-surface-1/30">
                <div className="divide-y divide-border/40">
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
        "group relative flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-all hover:bg-surface-2/60 focus-visible:ring-1 focus-visible:ring-ring",
        selected ? "bg-surface-2/80 font-medium" : "hover:bg-surface-2/40",
      )}
    >
      {/* Active Indicator Strip */}
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-0.5 transition-colors",
          selected ? "bg-primary" : "bg-transparent group-hover:bg-border/60",
        )}
      />

      {/* Icon Indicator */}
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md border text-[11px] transition-colors",
          selected
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border/60 bg-surface-1 text-ink-muted group-hover:border-border",
        )}
      >
        <Scroll size={14} />
      </span>

      {/* Item Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <span
            className={cn(
              "truncate text-[12px] leading-tight transition-colors",
              selected ? "font-semibold text-ink" : "text-ink/90 group-hover:text-ink",
            )}
          >
            {item.room.title}
          </span>
          <StatusMark item={item} />
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-ink-subtle">
          <span className="truncate text-[10.5px] font-medium text-ink-subtle">
            {formatDate(item.room.endedAt)}
          </span>
          <span className="shrink-0 rounded border border-border/50 bg-surface-2/80 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-primary/90">
            {formatCompactLanguageRoute(item.room)}
          </span>
        </div>
      </div>
    </button>
  );
}

function MeetingContextSidebarPanel({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content) return;

    if (!hasMounted.current) {
      gsap.set(panel, { width: open ? 280 : 0 });
      gsap.set(content, {
        autoAlpha: open ? 1 : 0,
        x: open ? 0 : 14,
      });
      hasMounted.current = true;
      return;
    }

    gsap.killTweensOf([panel, content]);
    gsap.to(panel, {
      width: open ? 280 : 0,
      duration: 0.38,
      ease: "power3.inOut",
    });
    gsap.to(content, {
      autoAlpha: open ? 1 : 0,
      x: open ? 0 : 14,
      duration: 0.38,
      ease: "power3.inOut",
    });
  }, [open]);

  return (
    <div
      ref={panelRef}
      aria-hidden={!open}
      className={cn(
        "h-full shrink-0 overflow-hidden border-l border-border self-stretch flex flex-col",
        !open && "pointer-events-none",
      )}
    >
      <div ref={contentRef} className="h-full w-[280px] p-5 overflow-y-auto">
        {children}
      </div>
    </div>
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
  const mainArtifact = summaryArtifact || room.artifacts[0];
  const summary = room.summary;

  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showContextSidebar, setShowContextSidebar] = useState(true);

  async function copyTranscriptAsText() {
    if (!segments.length) return;
    const text = segments
      .map((segment) => `[${segment.speakerName}] ${segment.originalText}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTranscript(true);
      toast.success("Transcript copied to clipboard.");
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      toast.error("Could not copy the transcript.");
    }
  }

  async function copySummaryAsText() {
    if (!summary) return;
    const lines = [
      `# ${room.title} — AI Meeting Summary`,
      "",
      "## Executive Overview",
      summary.summary || "(no overview)",
      "",
      "## Key Decisions",
      ...(summary.decisions.length
        ? summary.decisions.map((decision) => `- ${decision}`)
        : ["(none recorded)"]),
      "",
      "## Action Items",
      ...(summary.actionItems.length
        ? summary.actionItems.map(
            (action) =>
              `- [ ] ${action.owner ? `@${action.owner}: ` : ""}${action.task}`,
          )
        : ["(none recorded)"]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedSummary(true);
      toast.success("Summary markdown copied to clipboard.");
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      toast.error("Could not copy the summary.");
    }
  }

  return (
    <article className="flex min-w-0 flex-col h-full">
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-1/40 px-5 py-0.5 shrink-0"
        role="tablist"
        aria-label="Meeting record sections"
      >
        <div className="flex items-center gap-1">
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

        {/* Header Right Actions: Copy Transcript, Copy Summary, Download Document, Sidebar Toggle */}
        <div className="flex items-center gap-2 py-1">
          {tab === "transcript" && (
            <Button
              size="sm"
              variant="outline"
              disabled={!segments.length}
              onClick={copyTranscriptAsText}
              className="h-7 rounded-md border-border/60 px-2.5 text-[11px] font-medium shadow-none transition-colors hover:bg-surface-2"
            >
              {copiedTranscript ? (
                <Check size={13} className="text-emerald-500" />
              ) : (
                <Copy size={13} className="text-ink-muted" />
              )}
              <span>{copiedTranscript ? "Copied!" : "Copy Transcript"}</span>
            </Button>
          )}

          {tab === "summary" && (
            <Button
              size="sm"
              variant="outline"
              disabled={!summary || summary.insufficientData}
              onClick={copySummaryAsText}
              className="h-7 rounded-md border-border/60 px-2.5 text-[11px] font-medium shadow-none transition-colors hover:bg-surface-2"
            >
              {copiedSummary ? (
                <Check size={13} className="text-emerald-500" />
              ) : (
                <Copy size={13} className="text-ink-muted" />
              )}
              <span>{copiedSummary ? "Copied!" : "Copy Summary"}</span>
            </Button>
          )}

          {mainArtifact && (
            <Button
              size="sm"
              variant="default"
              disabled={mainArtifact.status !== "ready" || busyArtifactId === mainArtifact.id}
              onClick={() => onDownload(mainArtifact)}
              className="h-7 rounded-md px-2.5 text-[11px] font-medium shadow-xs"
            >
              {busyArtifactId === mainArtifact.id ? (
                <SpinnerGap size={13} className="animate-spin" />
              ) : (
                <DownloadSimple size={13} />
              )}
              <span>Download Document</span>
            </Button>
          )}

          <div className="mx-0.5 h-4 w-px bg-border/60" />

          <button
            type="button"
            onClick={() => setShowContextSidebar((prev) => !prev)}
            className="flex size-6 items-center justify-center rounded-[6px] border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 hover:text-ink transition-colors"
            title={showContextSidebar ? "Collapse Properties" : "Expand Properties"}
            aria-label={showContextSidebar ? "Collapse Properties" : "Expand Properties"}
          >
            <SidebarSimple size={13} weight="bold" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 w-full overflow-hidden items-stretch">
        <div className="min-w-0 flex-1 p-5 lg:p-7 transition-all duration-300">
          {tab === "transcript" ? (
            <TranscriptPanel
              state={transcriptState}
              roomId={room.id}
              canEdit={room.hostId === useAuthStore.getState().user?.id}
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

        <MeetingContextSidebarPanel open={showContextSidebar}>
          <aside className="h-full">
            <h3 className="text-[11px] font-semibold text-ink">Meeting context</h3>
            {room.description ? (
              <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                {room.description}
              </p>
            ) : null}
            <dl className="mt-4 divide-y divide-border border-y border-border">
              <ContextRow
                icon={Hash}
                label="Room code"
                value={room.translationRoomCode}
              />
              <ContextRow
                icon={User}
                label="Host"
                value={room.hostName}
              />
              <ContextRow
                icon={CalendarBlank}
                label="Started at"
                value={formatDate(room.startedAt)}
              />
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
        </MeetingContextSidebarPanel>
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
  canEdit,
  baseTime,
}: {
  state: UseQueryResult<TranscriptData>;
  roomId: string;
  canEdit: boolean;
  baseTime?: string;
}) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const sessionsQuery = useTranslationRoomSessions(roomId);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  if (state.isLoading) {
    return (
      <div className="flex min-h-[380px] items-center justify-center p-8 text-center">
        <div className="flex items-center gap-2 text-[11px] text-ink-muted">
          <SpinnerGap size={15} className="animate-spin" />
          Loading transcript
        </div>
      </div>
    );
  }

  if (state.isError) {
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center">
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
  const transcript = state.data?.transcript;

  async function saveCorrection(segment: TranscriptSegmentDto) {
    const correctedText = draftText.trim();
    if (!transcript || !correctedText || correctedText === segment.originalText.trim()) {
      setEditingSegmentId(null);
      return;
    }

    setIsSavingCorrection(true);
    try {
      await transcriptService.correctSegment(transcript.id, segment.id, {
        originalText: segment.originalText,
        correctedText,
        correctionType: "stt",
        triggeredRetranslation: false,
      });
      await state.refetch();
      setEditingSegmentId(null);
      toast.success("Transcript correction saved.");
    } catch {
      toast.error("Could not save the transcript correction.");
    } finally {
      setIsSavingCorrection(false);
    }
  }

  async function finalizeTranscript() {
    if (!transcript) return;
    setIsFinalizing(true);
    try {
      await transcriptService.finalize(transcript.id);
      await state.refetch();
      toast.success("Transcript finalized.");
    } catch {
      toast.error("Could not finalize the transcript.");
    } finally {
      setIsFinalizing(false);
    }
  }

  function downloadTranscript() {
    const content = segments
      .map((segment) => `[${formatTimestamp(segment.startTimeMs)}] ${segment.speakerName}: ${segment.originalText}`)
      .join("\n");
    saveBlobDownload(new Blob([content], { type: "text/plain;charset=utf-8" }), `transcript-${roomId}.txt`);
  }

  if (!segments.length) {
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center">
        <div className="max-w-[380px] space-y-3">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-border/60 bg-surface-2 shadow-xs">
            <Scroll size={26} className="text-ink-subtle" />
          </div>
          <h3 className="text-[15px] font-semibold text-ink">
            No transcript recorded
          </h3>
          <p className="text-[12px] leading-5 text-ink-muted">
            This meeting ended without any captured speech, or the transcript
            hasn&apos;t synced yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[600px] min-h-[380px] space-y-2 overflow-y-auto pr-1">
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
                    {editingSegmentId === segment.id ? (
                      <div className="w-full min-w-[280px] space-y-2 rounded-xl border border-primary/40 bg-surface-1 p-2">
                        <textarea
                          value={draftText}
                          onChange={(event) => setDraftText(event.target.value)}
                          className="min-h-20 w-full resize-y rounded-md border border-border bg-canvas px-2 py-1.5 text-[12px] text-ink outline-none focus:border-primary"
                          aria-label={`Edit transcript line by ${segment.speakerName}`}
                        />
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setEditingSegmentId(null)}>
                            Cancel
                          </Button>
                          <Button type="button" size="sm" className="h-7 text-[10px] text-white" disabled={isSavingCorrection || !draftText.trim()} onClick={() => void saveCorrection(segment)}>
                            {isSavingCorrection ? <SpinnerGap size={12} className="animate-spin" /> : null}
                            Save correction
                          </Button>
                        </div>
                      </div>
                    ) : (
                    <div
                      className={`group/line relative rounded-2xl px-3 py-2 pr-8 text-[12px] leading-6 ${
                        isSelf
                          ? "rounded-tr-sm bg-primary text-white"
                          : "rounded-tl-sm border border-border bg-surface-1 text-ink-muted"
                      }`}
                    >
                      {segment.originalText}
                      {canEdit && transcript?.status !== "finalized" ? (
                        <button
                          type="button"
                          aria-label="Edit transcript line"
                          className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/line:opacity-100 focus:opacity-100"
                          onClick={() => {
                            setEditingSegmentId(segment.id);
                            setDraftText(segment.originalText);
                          }}
                        >
                          <PencilSimple size={13} />
                        </button>
                      ) : null}
                    </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
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
  const [copied, setCopied] = useState(false);

  async function copyAsText() {
    if (!summary) return;
    const lines = [
      `# ${room.title} — AI Meeting Summary`,
      "",
      "## Executive Overview",
      summary.summary || "(no overview)",
      "",
      "## Key Decisions",
      ...(summary.decisions.length
        ? summary.decisions.map((decision) => `- ${decision}`)
        : ["(none recorded)"]),
      "",
      "## Action Items",
      ...(summary.actionItems.length
        ? summary.actionItems.map(
            (action) =>
              `- [ ] ${action.owner ? `@${action.owner}: ` : ""}${action.task}`,
          )
        : ["(none recorded)"]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast.success("Summary markdown copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the summary.");
    }
  }

  return (
    <>
      {hasStructuredContent && summary ? (
        <div className="max-h-[600px] min-h-[380px] space-y-5 overflow-y-auto pr-1">
          {/* Overview Section */}
          <section className="rounded-lg border border-border/60 bg-surface-1/40 p-4.5 transition-all hover:border-border/80">
            <div className="mb-3 flex items-center gap-2 border-b border-border/40 pb-2.5">
              <BookOpenText size={16} className="text-primary" />
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink">
                Executive Overview
              </h3>
            </div>
            <p className="text-[13px] font-normal leading-6 text-ink/90">
              {summary.summary}
            </p>
          </section>

          {/* Decisions Section */}
          <section className="rounded-lg border border-border/60 bg-surface-1/40 p-4.5 transition-all hover:border-border/80">
            <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" />
                <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink">
                  Key Decisions
                </h3>
              </div>
              <span className="rounded-full border border-border/40 bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
                {summary.decisions.length} recorded
              </span>
            </div>

            {summary.decisions.length ? (
              <ul className="space-y-2.5">
                {summary.decisions.map((decision, index) => (
                  <li
                    key={index}
                    className="group flex items-start gap-2.5 text-[12.5px] leading-5 text-ink/90"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500/80 transition-transform group-hover:scale-125" />
                    <span className="flex-1 font-normal">{decision}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] italic text-ink-muted">
                No major decisions recorded for this meeting.
              </p>
            )}
          </section>

          {/* Action Items Section */}
          <section className="rounded-lg border border-border/60 bg-surface-1/40 p-4.5 transition-all hover:border-border/80">
            <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-2.5">
              <div className="flex items-center gap-2">
                <ListChecks size={16} className="text-amber-500" />
                <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink">
                  Action Items & Follow-ups
                </h3>
              </div>
              <span className="rounded-full border border-border/40 bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
                {summary.actionItems.length} items
              </span>
            </div>

            {summary.actionItems.length ? (
              <div className="space-y-2">
                {summary.actionItems.map((action, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-md border border-border/40 bg-surface-2/40 p-2.5 transition-colors hover:bg-surface-2/70"
                  >
                    <CheckSquare
                      size={16}
                      className="mt-0.5 shrink-0 text-amber-500"
                    />
                    <div className="flex flex-1 flex-wrap items-center justify-between gap-2 text-[12.5px]">
                      <span className="font-normal leading-relaxed text-ink">
                        {action.task}
                      </span>
                      {action.owner ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">
                          <User size={11} />
                          @{action.owner}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] italic text-ink-muted">
                No action items extracted from this meeting.
              </p>
            )}
          </section>
        </div>
      ) : (
        /* Empty / Generating State directly on main surface */
        <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center">
          <div className="max-w-[380px] space-y-3">
            <div className="relative mx-auto flex size-14 items-center justify-center rounded-full border border-border/60 bg-surface-2 shadow-xs">
              {isGenerating ? (
                <>
                  <SpinnerGap size={26} className="animate-spin text-primary" />
                  <Sparkle size={14} className="absolute right-2 top-2 animate-pulse text-amber-500" />
                </>
              ) : (
                <ChatCircleText size={26} className="text-ink-subtle" />
              )}
            </div>
            <h3 className="text-[15px] font-semibold text-ink">
              {isGenerating ? "Analyzing meeting & generating summary…" : "No Summary Available"}
            </h3>
            <p className="text-[12px] leading-5 text-ink-muted">
              {isGenerating
                ? "WarpTalk AI Assistant is analyzing transcript segments to extract key decisions and action items."
                : summary?.insufficientData
                  ? "There was insufficient transcript content recorded in this meeting to generate an AI summary."
                  : "This meeting finished without a summary artifact."}
            </p>
          </div>
        </div>
      )}
    </>
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
      <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center">
        <div className="max-w-[380px] space-y-3">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-border/60 bg-surface-2 shadow-xs">
            <Archive size={26} className="text-ink-subtle" />
          </div>
          <h3 className="text-[15px] font-semibold text-ink">
            No retained artifacts
          </h3>
          <p className="text-[12px] leading-5 text-ink-muted">
            Nothing has been generated or retained for this meeting yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[600px] min-h-[380px] divide-y divide-border/60 overflow-y-auto pr-1">
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

function getShortLangCode(lang?: string): string {
  if (!lang) return "";
  const l = lang.toLowerCase();
  if (l.includes("vi")) return "VI";
  if (l.includes("en")) return "EN";
  if (l.includes("ja")) return "JA";
  if (l.includes("ko")) return "KO";
  if (l.includes("fr")) return "FR";
  if (l.includes("es")) return "ES";
  if (l.includes("de")) return "DE";
  if (l.includes("zh")) return "ZH";
  return lang.slice(0, 2).toUpperCase();
}

function formatCompactLanguageRoute(room: EndedRoomHistoryItem): string {
  const source = getShortLangCode(room.sourceLanguage);
  const targets = (room.targetLanguages || [])
    .map(getShortLangCode)
    .filter((code) => code && code !== source);

  if (!source && !targets.length) return "VI";
  if (!targets.length) return source || "VI";
  return `${source} → ${targets.join(", ")}`;
}

function formatLanguageRoute(room: EndedRoomHistoryItem) {
  return formatRoute(room.sourceLanguage, room.targetLanguages);
}
