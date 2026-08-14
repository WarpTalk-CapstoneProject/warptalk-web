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
  MagnifyingGlass,
  SpinnerGap,
  Translate,
  Users,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoomHistory } from "@/hooks/use-room-history";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { cn } from "@/lib/utils";
import { formatLanguageRoute as formatRoute } from "@/lib/language/languages";
import { translationRoomService } from "@/services/translation-room.service";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { EndedRoomHistoryItem, RoomHistoryArtifact } from "@/types/roomHistory";
import { getErrorMessage } from "@/lib/api/errors";

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
  const history = useRoomHistory(activeWorkspaceId);

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
      toast.error(getErrorMessage(error, "Could not download this output."));
    } finally {
      setBusyArtifactId(null);
    }
  }

  return (
    <main className="min-h-full bg-surface-1 text-ink">
      <div className="mx-auto w-full max-w-[1480px] px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-ink-muted">
              <Archive size={14} /> Workspace archive
            </div>
            <h1 className="text-[30px] font-semibold leading-none">Meeting history</h1>
            <p className="mt-2 text-[13px] text-ink-muted">Finished translation rooms and the outputs retained with them.</p>
          </div>
          <div className="relative w-full lg:w-[360px]">
            <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, code, host, or language" className="h-9 rounded-md bg-surface-1 pl-9 text-[12px] shadow-none" />
          </div>
        </header>

        <div className="flex items-center gap-1 border-b border-border py-3" role="tablist" aria-label="History filters">
          {historyFilters.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={cn("h-7 rounded-md px-3 text-[11px] font-medium transition-colors", filter === item.value ? "bg-ink text-surface-1" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>{item.label}</button>
          ))}
          <span className="ml-auto text-[10px] tabular-nums text-ink-subtle">{rooms.length} results</span>
        </div>

        <section className="mt-4 overflow-hidden rounded-lg border border-border bg-surface-1" aria-label="Meeting history results">
          {history.isLoading ? <LoadingState /> : history.isError ? <ErrorState onRetry={() => history.refetch()} /> : rooms.length === 0 ? <EmptyState hasQuery={Boolean(query)} /> : (
            <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className="grid grid-cols-[minmax(260px,1.4fr)_150px_minmax(180px,1fr)_80px_80px_120px] border-b border-border bg-surface-2/45 px-4 py-2 text-[10px] font-medium text-ink-subtle">
                    <span>Meeting</span><span>Ended</span><span>Language route</span><span>Time</span><span>People</span><span>Outputs</span>
                  </div>
                  {rooms.map((room) => <HistoryRow key={room.id} room={room} selected={selected?.id === room.id} onSelect={() => setSelectedId(room.id)} />)}
                </div>
              </div>
              {selected ? <MeetingDetail room={selected} busyArtifactId={busyArtifactId} onDownload={downloadArtifact} /> : null}
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

function MeetingDetail({ room, busyArtifactId, onDownload }: { room: EndedRoomHistoryItem; busyArtifactId: string | null; onDownload: (artifact: RoomHistoryArtifact) => void }) {
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
        {room.artifacts.length ? room.artifacts.map((artifact) => (
          <button key={artifact.id} type="button" disabled={busyArtifactId === artifact.id} onClick={() => onDownload(artifact)} className="group flex w-full items-center gap-3 py-3 text-left disabled:opacity-50">
            <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-1"><ArtifactIcon artifact={artifact} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{artifact.title || artifactLabel(artifact.type)}</span><span className="mt-0.5 block text-[10px] text-ink-subtle">{artifact.format || artifactLabel(artifact.type)} · {artifactStatusLabel(artifact)}</span></span>
            {busyArtifactId === artifact.id ? <SpinnerGap size={14} className="animate-spin" /> : <DownloadSimple size={14} className="text-ink-subtle transition-colors group-hover:text-ink" />}
          </button>
        )) : <p className="py-6 text-center text-[11px] text-ink-muted">No retained outputs for this meeting.</p>}
      </div>

      {/* Only what an artifact actually states. "Retention follows workspace policy" was a
          claim with nothing behind it — no policy is configured and no purge job exists —
          and the date beside it fell back to the meeting's own end time. */}
      {room.retention.kind === "scheduled" ? (
        <div className="mt-5 flex items-start gap-2 text-[10px] leading-4 text-ink-subtle"><Archive size={13} className="mt-0.5 shrink-0" /><span>{`Retention ends ${formatDate(room.retention.expiresAt)}.`}</span></div>
      ) : null}
    </aside>
  );
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

function artifactLabel(type: RoomHistoryArtifact["type"]) { return ({ transcript_export: "Transcript", summary_export: "AI summary", recording: "Recording", debug_log: "Debug log", audio_sample: "Audio sample" } as const)[type]; }
function artifactStatusLabel(artifact: RoomHistoryArtifact) { return artifact.consentRequired ? "Consent required" : artifact.status.charAt(0).toUpperCase() + artifact.status.slice(1); }
function formatDuration(seconds: number) { if (!seconds) return "—"; const minutes = Math.floor(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function formatLanguageRoute(room: EndedRoomHistoryItem) { return formatRoute(room.sourceLanguage, room.targetLanguages); }
