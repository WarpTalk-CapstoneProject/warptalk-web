"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Clock,
  DownloadSimple,
  FileText,
  LockSimple,
  SpinnerGap,
  Translate,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { parseSummarySections } from "@/lib/meeting/meeting-summary";
// Imported rather than restated. This file had its own one-line copies of artifactLabel and
// artifactStatusLabel, identical to the ones in lib/meeting — which is how the archive and the
// room page came to disagree about what a row says.
import {
  artifactDownloadFormat,
  artifactLabel,
  artifactStatusLabel,
} from "@/lib/meeting/meeting-artifacts";
import { useRoomHistory } from "@/hooks/use-room-history";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { cn } from "@/lib/utils";
import { formatLanguageRoute as formatRoute } from "@/lib/language/languages";
import { translationRoomService } from "@/services/translation-room.service";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { EndedRoomHistoryItem, RoomHistoryArtifact } from "@/types/roomHistory";
import { getErrorMessage } from "@/lib/api/errors";
import { ARTIFACT_WITHHELD_FALLBACK, isArtifactWithheld } from "@/lib/meeting/artifact-denial";

type HistoryFilter = "all" | "ended" | "cancelled" | "with_outputs";

const historyFilters: Array<{ value: HistoryFilter; label: string }> = [
  { value: "all", label: "All meetings" },
  { value: "ended", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "with_outputs", label: "With outputs" },
];

export default function HistoryPage() {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);
  // Which output is open in the panel, and what it is showing. Cleared whenever the selected
  // meeting changes — a preview belonging to a different room is worse than none.
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArtifactPreviewState | null>(null);
  const history = useRoomHistory(activeWorkspaceId);

  function closePreview() {
    setOpenArtifactId(null);
    setPreview(null);
  }

  async function openArtifact(artifact: RoomHistoryArtifact) {
    const title = artifact.title || artifactLabel(artifact.type);

    if (openArtifactId === artifact.id) {
      closePreview();
      return;
    }

    setOpenArtifactId(artifact.id);
    setPreview({ kind: "loading", title });

    try {
      if (artifact.consentRequired) {
        await translationRoomService.approveArtifactConsent(artifact.id);
        await history.refetch();
      }
      const { data } = await translationRoomService.artifactDownload(artifact.id);

      if (data.content != null && data.content !== "") {
        setPreview({ kind: "text", title, body: readableArtifactBody(data.content) });
        return;
      }

      // A recording has no text to show — it is a file, and downloading is the only sensible
      // thing to do with it.
      if (data.url) {
        openArtifactDownload(data);
        closePreview();
        return;
      }

      setPreview({ kind: "error", title, message: "This output has no readable content stored." });
    } catch (error) {
      // A refusal is not a failure. Room artifacts default to HOST_ONLY, so the most common way
      // to land here is a participant opening the summary of a meeting they attended before the
      // host shared it — and "Unauthorized to download this artifact." reported that as if the
      // product were broken. See lib/meeting/artifact-denial.ts.
      if (isArtifactWithheld(error)) {
        setPreview({
          kind: "withheld",
          title,
          message: getErrorMessage(error, ARTIFACT_WITHHELD_FALLBACK),
        });
        return;
      }
      setPreview({ kind: "error", title, message: getErrorMessage(error, "Could not open this output.") });
    }
  }

  const rooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (history.data?.rooms ?? []).filter((room) => {
      const matchesFilter = filter === "all"
        || room.status === filter
        || (filter === "with_outputs" && room.artifacts.length > 0);
      const matchesQuery = !normalized || [
        room.title,
        room.translationRoomCode,
        room.hostName,
        room.sourceLanguage,
        ...room.targetLanguages,
      ].some((value) => value.toLowerCase().includes(normalized));
      return matchesFilter && matchesQuery;
    });
  }, [filter, history.data?.rooms, query]);

  const selected = rooms.find((room) => room.id === selectedId) ?? rooms[0];

  // Null until a meeting is actually selected — the other four call sites already guard this
  // way. Registering "history" with no entityId made the widget offer /summarize (autoSend)
  // for a meeting that does not exist, and rendered the chip as "History History".
  useRegisterAssistantContext(
    selected
      ? {
          pageType: "history",
          entityId: selected.id,
          workspaceId: selected.workspaceId,
          snapshot: {
            title: selected.title,
            status: selected.status,
            participantCount: String(selected.participantCount),
          },
        }
      : null,
  );

  async function downloadArtifact(artifact: RoomHistoryArtifact) {
    if (artifact.status !== "ready") {
      toast.error("This output is not ready to download.");
      return;
    }

    setBusyArtifactId(artifact.id);
    try {
      if (artifact.consentRequired) {
        await translationRoomService.approveArtifactConsent(artifact.id);
      }
      const { data } = await translationRoomService.artifactDownload(artifact.id);
      openArtifactDownload(data);
      if (artifact.consentRequired) await history.refetch();
    } catch (error) {
      // Same distinction the preview draws: a withheld output is a state, not a failure, so it
      // gets the neutral toast and the sentence that names who can change it.
      if (isArtifactWithheld(error)) {
        toast.info(getErrorMessage(error, ARTIFACT_WITHHELD_FALLBACK));
        return;
      }
      toast.error(getErrorMessage(error, "Could not download this output."));
    } finally {
      setBusyArtifactId(null);
    }
  }

  return (
    <main className="min-h-full bg-surface-1 text-ink">
      <div className="mx-auto w-full max-w-[1480px] px-5 py-6 lg:px-8">
        {/* No page title, no eyebrow, no description — the shape Meetings and Members use.
            The route name is already in the top bar and the sidebar, so a 30px "Meeting history"
            under a breadcrumb reading "history" was the same word twice, and the sentence under
            it was documentation living in the furniture. See components/workspace/page-chrome,
            which records this as the house rule; this page had simply never been converted. */}
        {/* The same search affordance Meetings and Members use, not a 360px input box.
            Every list page had invented its own: a full-width bordered field here, a 300px one on
            My Meetings, a collapsed dock on Meetings — three answers to one question, and the
            widest of them spent a third of the row on a control nobody uses until they need it. */}
        <header className="flex items-center justify-end gap-2 border-b border-border pb-4">
          <ExpandingSearchDock
            value={query}
            onValueChange={setQuery}
            placeholder="Search title, code, host, or language"
            expandedWidth={320}
          />
        </header>

        {/* FilterChip, not a bespoke 11px tab that fills with bg-ink. That fill is the loudest
            token in the palette and it was spent on a FILTER — a choice, not an action — so the
            selected chip here shouted while the identical control on Meetings and Documents
            whispered. filter-chip.tsx records this as the one answer for the whole app. */}
        <FilterChipGroup
          label="History filters"
          className="border-b border-border py-3"
          trailing={`${rooms.length} results`}
        >
          {historyFilters.map((item) => (
            <FilterChip
              key={item.value}
              selected={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </FilterChip>
          ))}
        </FilterChipGroup>

        <section className="mt-4 overflow-hidden rounded-lg border border-border bg-surface-1" aria-label="Meeting history results">
          {history.isLoading ? <LoadingState /> : history.isError ? <ErrorState onRetry={() => history.refetch()} /> : rooms.length === 0 ? <EmptyState hasQuery={Boolean(query)} /> : (
            <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className="grid grid-cols-[minmax(260px,1.4fr)_150px_minmax(180px,1fr)_80px_80px_120px] border-b border-border bg-surface-2/45 px-4 py-2 text-[10px] font-medium text-ink-subtle">
                    <span>Meeting</span><span>Ended</span><span>Language route</span><span>Time</span><span>People</span><span>Outputs</span>
                  </div>
                  {rooms.map((room) => <HistoryRow key={room.id} room={room} selected={selected?.id === room.id} onSelect={() => { setSelectedId(room.id); closePreview(); }} />)}
                </div>
              </div>
              {selected ? <MeetingDetail room={selected} busyArtifactId={busyArtifactId} onDownload={downloadArtifact} onOpen={openArtifact} openArtifactId={openArtifactId} preview={preview} onClosePreview={closePreview} /> : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function HistoryRow({ room, selected, onSelect }: { room: EndedRoomHistoryItem; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={cn("grid w-full grid-cols-[minmax(260px,1.4fr)_150px_minmax(180px,1fr)_80px_80px_120px] items-center border-b border-border px-4 py-3 text-left text-[11px] outline-none transition-colors last:border-b-0 hover:bg-surface-2/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30", selected && "bg-surface-2")}> 
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-md border", selected ? "border-ink bg-ink text-surface-1" : "border-border bg-canvas text-ink-muted")}><FileText size={15} /></span>
        <span className="min-w-0"><span className="block truncate font-medium text-ink">{room.title}</span><span className="mt-0.5 block truncate text-[10px] text-ink-subtle">{room.translationRoomCode} · {room.hostName}</span></span>
      </span>
      <span className="text-ink-muted">{formatDate(room.endedAt)}</span>
      <span className="truncate pr-4 text-ink-muted">{formatLanguageRoute(room)}</span>
      <span className="tabular-nums text-ink-muted">{formatDuration(room.durationSeconds)}</span>
      <span className="tabular-nums text-ink-muted">{room.participantCount}</span>
      <span className="flex items-center justify-between"><span className="flex items-center gap-2 text-ink-muted"><span className={cn("size-1.5 rounded-full", room.artifacts.length ? "bg-primary" : "bg-ink-subtle/50")} />{room.artifacts.length}</span><ArrowRight size={13} className="text-ink-subtle" /></span>
    </button>
  );
}

/** What the preview pane is showing, or why it cannot show anything. */
type ArtifactPreviewState =
  | { kind: "loading"; title: string }
  | { kind: "text"; title: string; body: string }
  /** The output exists and is fine — the host has just not shared it with this viewer. */
  | { kind: "withheld"; title: string; message: string }
  | { kind: "error"; title: string; message: string };

function MeetingDetail({ room, busyArtifactId, onDownload, onOpen, openArtifactId, preview, onClosePreview }: { room: EndedRoomHistoryItem; busyArtifactId: string | null; onDownload: (artifact: RoomHistoryArtifact) => void; onOpen: (artifact: RoomHistoryArtifact) => void; openArtifactId: string | null; preview: ArtifactPreviewState | null; onClosePreview: () => void }) {
  return (
    <aside className="border-t border-border bg-surface-1 p-5 lg:border-l lg:border-t-0">
      <div className="flex items-center gap-2 text-[10px] font-medium uppercase text-ink-subtle"><span className={cn("size-1.5 rounded-full", room.status === "ended" ? "bg-emerald-500" : "bg-ink-subtle")} />{room.status}</div>
      <h2 className="mt-3 text-[18px] font-semibold leading-6">{room.title}</h2>
      {room.description ? <p className="mt-2 text-[12px] leading-5 text-ink-muted">{room.description}</p> : null}

      <dl className="mt-5 grid grid-cols-2 border-y border-border py-4">
        <Detail icon={CalendarBlank} label="Ended" value={formatDate(room.endedAt)} />
        <Detail icon={Clock} label="Duration" value={formatDuration(room.durationSeconds)} />
        <Detail icon={Users} label="Participants" value={String(room.participantCount)} />
        <Detail icon={Translate} label="Route" value={formatLanguageRoute(room)} />
      </dl>

      <div className="mt-5 flex items-center justify-between"><h3 className="text-[11px] font-semibold">Retained outputs</h3><span className="text-[10px] text-ink-subtle">{room.artifacts.length}</span></div>
      <div className="mt-2 divide-y divide-border border-y border-border">
        {/* The row OPENS the output; the icon downloads it.
            The whole row used to be one button wired straight to the download, so the only way
            to find out what a summary said was to fetch a file and open it in another app — and
            when that fetch failed there was no way to read it at all. Reading is the common
            intent; downloading is the occasional one. */}
        {room.artifacts.length ? room.artifacts.map((artifact) => (
          <div key={artifact.id} className="group flex w-full items-center gap-3 py-3">
            <button type="button" onClick={() => onOpen(artifact)} aria-expanded={openArtifactId === artifact.id} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-1"><ArtifactIcon artifact={artifact} /></span>
              {/* "Transcript" then "TXT · Ready". The first line was the server's generated title
                  ("transcript export (TXT)"), which repeats on line two what line one already said
                  and is lowercase because it is derived from an enum name. The second line was
                  artifact.format — the STORED format, MARKDOWN or JSON — while the download hands
                  over plain text; see artifactDownloadFormat. */}
              <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{artifactLabel(artifact.type)}</span><span className="mt-0.5 block text-[10px] text-ink-subtle">{artifactDownloadFormat(artifact)} · {artifactStatusLabel(artifact)}</span></span>
            </button>
            <button type="button" disabled={busyArtifactId === artifact.id} onClick={() => onDownload(artifact)} aria-label={`Download ${artifact.title || artifactLabel(artifact.type)}`} className="shrink-0 rounded p-1 disabled:opacity-50">
              {busyArtifactId === artifact.id ? <SpinnerGap size={14} className="animate-spin" /> : <DownloadSimple size={14} className="text-ink-subtle transition-colors group-hover:text-ink" />}
            </button>
          </div>
        )) : <p className="py-6 text-center text-[11px] text-ink-muted">No retained outputs for this meeting.</p>}
      </div>

      {openArtifactId ? <ArtifactPreview state={preview} onClose={onClosePreview} /> : null}

      {/* Only what an artifact actually states. "Retention follows workspace policy" was a
          claim with nothing behind it — no policy is configured and no purge job exists —
          and the date beside it fell back to the meeting's own end time. */}
      {room.retention.kind === "scheduled" ? (
        <div className="mt-5 flex items-start gap-2 text-[10px] leading-4 text-ink-subtle"><Archive size={13} className="mt-0.5 shrink-0" /><span>{`Retention ends ${formatDate(room.retention.expiresAt)}.`}</span></div>
      ) : null}
    </aside>
  );
}

/**
 * An output's own content, read in place.
 *
 * A summary artifact stores structured JSON, not prose, so dumping it verbatim gives the reader
 * `{"summary":"…","decisions":[…]}` — which is what the artifacts page did and what WT-362
 * reported as "renders raw JSON". Parsed into its parts when it parses, shown as plain text when
 * it does not (a transcript export is markdown and must survive untouched).
 */
function ArtifactPreview({ state, onClose }: { state: ArtifactPreviewState | null; onClose: () => void }) {
  if (!state) return null;

  return (
    <section className="mt-3 rounded-md border border-border bg-surface-1">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h4 className="min-w-0 truncate text-[11px] font-semibold">{state.title}</h4>
        <button type="button" onClick={onClose} aria-label="Close output" className="shrink-0 rounded p-0.5 text-ink-subtle hover:text-ink"><X size={13} /></button>
      </div>
      <div className="max-h-[320px] overflow-y-auto px-3 py-2.5">
        {state.kind === "loading" ? (
          <p className="flex items-center gap-2 py-4 text-[11px] text-ink-muted"><SpinnerGap size={13} className="animate-spin" />Loading…</p>
        ) : state.kind === "withheld" ? (
          // Its own branch rather than reusing "error": a lock reads as a state somebody controls,
          // where the error branch's bare sentence reads as something that went wrong. Same panel,
          // different claim about whose problem this is.
          <p className="flex items-start gap-2 py-4 text-[11px] leading-5 text-ink-muted">
            <LockSimple size={13} className="mt-0.5 shrink-0" />
            <span>{state.message}</span>
          </p>
        ) : state.kind === "error" ? (
          <p className="py-4 text-[11px] text-ink-muted">{state.message}</p>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-5 text-ink">{state.body}</pre>
        )}
      </div>
    </section>
  );
}

/**
 * Turns an artifact's stored content into something a person can read.
 *
 * Never throws: an artifact that is not JSON (transcript exports are markdown) is returned as it
 * is, which is exactly right for them.
 */
function readableArtifactBody(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return raw;
  const record = parsed as Record<string, unknown>;
  if (typeof record.summary !== "string") return raw;

  if (record.insufficientData === true) {
    return record.summary || "The assistant could not generate a summary for this meeting.";
  }

  const lines: string[] = [record.summary.trim()];

  for (const section of parseSummarySections(record)) {
    const items = section.items.map((item) => `• ${item.owner ? `${item.owner}: ` : ""}${item.text}`);
    if (items.length) lines.push("", section.title, ...items);
  }

  return lines.join("\n");
}

function Detail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div className="min-w-0 py-2 pr-3"><dt className="flex items-center gap-1.5 text-[10px] text-ink-subtle"><Icon size={12} />{label}</dt><dd className="mt-1 truncate text-[11px] font-medium text-ink" title={value}>{value}</dd></div>;
}

function ArtifactIcon({ artifact }: { artifact: RoomHistoryArtifact }) {
  if (artifact.status === "processing") return <SpinnerGap size={14} className="animate-spin text-ink-muted" />;
  if (["failed", "missing", "expired"].includes(artifact.status)) return <WarningCircle size={14} className="text-ink-muted" />;
  return <CheckCircle size={14} className="text-primary" />;
}

function LoadingState() { return <div className="grid min-h-[420px] place-items-center"><div className="flex items-center gap-2 text-[11px] text-ink-muted"><SpinnerGap size={15} className="animate-spin" />Loading meeting history</div></div>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="grid min-h-[420px] place-items-center text-center"><div><WarningCircle size={22} className="mx-auto text-ink-muted" /><p className="mt-3 text-[12px] font-medium">Meeting history could not be loaded</p><p className="mt-1 text-[11px] text-ink-muted">Check the translation-room service and try again.</p><Button variant="outline" size="sm" className="mt-4 h-8" onClick={onRetry}>Retry</Button></div></div>; }
function EmptyState({ hasQuery }: { hasQuery: boolean }) { return <div className="grid min-h-[420px] place-items-center text-center"><div><Archive size={22} className="mx-auto text-ink-muted" /><p className="mt-3 text-[12px] font-medium">{hasQuery ? "No meetings match this search" : "No finished meetings yet"}</p><p className="mt-1 text-[11px] text-ink-muted">{hasQuery ? "Try a different title, code, host, or language." : "Meetings appear here after they end."}</p></div></div>; }

function formatDuration(seconds: number) { if (!seconds) return "—"; const minutes = Math.floor(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function formatLanguageRoute(room: EndedRoomHistoryItem) { return formatRoute(room.sourceLanguage, room.targetLanguages); }
