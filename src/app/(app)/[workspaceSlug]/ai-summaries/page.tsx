"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  CheckCircle,
  Clock,
  DownloadSimple,
  FileText,
  MagnifyingGlass,
  Robot,
  SpinnerGap,
  Translate,
  Users,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoomHistory } from "@/hooks/use-room-history";
import { cn } from "@/lib/utils";
import { translationRoomService } from "@/services/translationRoom.service";
import type { EndedRoomHistoryItem, RoomHistoryArtifact, RoomArtifactStatus } from "@/types/roomHistory";

type SummaryFilter = "all" | "ready" | "processing" | "attention";
type SummaryItem = {
  room: EndedRoomHistoryItem;
  artifact?: RoomHistoryArtifact;
  status: RoomArtifactStatus;
};

const summaryFilters: Array<{ value: SummaryFilter; label: string }> = [
  { value: "all", label: "All summaries" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "attention", label: "Needs attention" },
];

export default function AiSummariesPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SummaryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);
  const history = useRoomHistory();

  const summaries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (history.data?.rooms ?? []).map((room): SummaryItem => {
      const artifact = room.artifacts.find((item) => item.type === "summary_export");
      return { room, artifact, status: artifact?.status ?? "missing" };
    }).filter((item) => {
      const needsAttention = ["failed", "expired", "missing"].includes(item.status) || item.artifact?.consentRequired;
      const matchesFilter = filter === "all" || item.status === filter || (filter === "attention" && needsAttention);
      const matchesQuery = !normalized || [item.room.title, item.room.translationRoomCode, item.room.hostName].some((value) => value.toLowerCase().includes(normalized));
      return matchesFilter && matchesQuery;
    });
  }, [filter, history.data?.rooms, query]);

  const selected = summaries.find((item) => item.room.id === selectedId) ?? summaries[0];

  async function downloadSummary(item: SummaryItem) {
    const artifact = item.artifact;
    if (!artifact || artifact.status !== "ready") {
      toast.error("This summary is not ready to download.");
      return;
    }

    setBusyArtifactId(artifact.id);
    try {
      if (artifact.consentRequired) await translationRoomService.approveArtifactConsent(artifact.id);
      const { data } = await translationRoomService.artifactDownload(artifact.id);
      if (!data.url) throw new Error("The download URL is unavailable.");
      window.open(data.url, "_blank", "noopener,noreferrer");
      if (artifact.consentRequired) await history.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download this summary.");
    } finally {
      setBusyArtifactId(null);
    }
  }

  return (
    <main className="min-h-full bg-canvas text-ink">
      <div className="mx-auto w-full max-w-[1480px] px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-ink-muted"><Robot size={14} /> Meeting intelligence</div>
            <h1 className="text-[30px] font-semibold leading-none">AI summaries</h1>
            <p className="mt-2 text-[13px] text-ink-muted">Track generated summary files across finished translation rooms.</p>
          </div>
          <div className="relative w-full lg:w-[360px]">
            <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meeting, code, or host" className="h-9 rounded-md bg-surface-1 pl-9 text-[12px] shadow-none" />
          </div>
        </header>

        <div className="flex items-center gap-1 border-b border-border py-3" role="tablist" aria-label="Summary filters">
          {summaryFilters.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={cn("h-7 rounded-md px-3 text-[11px] font-medium transition-colors", filter === item.value ? "bg-ink text-surface-1" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>{item.label}</button>
          ))}
          <span className="ml-auto text-[10px] tabular-nums text-ink-subtle">{summaries.length} results</span>
        </div>

        <section className="mt-4 overflow-hidden rounded-lg border border-border bg-surface-1" aria-label="AI summary review queue">
          {history.isLoading ? <LoadingState /> : history.isError ? <ErrorState onRetry={() => history.refetch()} /> : summaries.length === 0 ? <EmptyState hasQuery={Boolean(query)} /> : (
            <div className="grid min-h-[600px] lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className="border-b border-border lg:border-b-0 lg:border-r">
                <div className="flex h-10 items-center justify-between border-b border-border bg-surface-2/45 px-4"><span className="text-[10px] font-medium text-ink-subtle">SUMMARY QUEUE</span><span className="text-[10px] tabular-nums text-ink-subtle">{summaries.length}</span></div>
                <div className="divide-y divide-border">
                  {summaries.map((item) => <SummaryQueueRow key={item.room.id} item={item} selected={selected?.room.id === item.room.id} onSelect={() => setSelectedId(item.room.id)} />)}
                </div>
              </div>
              {selected ? <SummaryWorkspace item={selected} busy={busyArtifactId === selected.artifact?.id} onDownload={() => downloadSummary(selected)} /> : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryQueueRow({ item, selected, onSelect }: { item: SummaryItem; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={cn("group relative flex w-full gap-3 px-4 py-4 text-left outline-none transition-colors hover:bg-surface-2/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30", selected && "bg-surface-2")}>
      <span className={cn("absolute inset-y-0 left-0 w-0.5", selected ? "bg-ink" : "bg-transparent")} />
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border", selected ? "border-ink bg-ink text-surface-1" : "border-border bg-canvas text-ink-muted")}><FileText size={16} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3"><span className="truncate text-[12px] font-medium text-ink">{item.room.title}</span><StatusMark item={item} /></span>
        <span className="mt-1 block truncate text-[10px] text-ink-subtle">{item.room.translationRoomCode} · {formatDate(item.room.endedAt)}</span>
        <span className="mt-2 flex items-center justify-between text-[10px] text-ink-muted"><span className="truncate">{formatLanguageRoute(item.room)}</span><ArrowRight size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" /></span>
      </span>
    </button>
  );
}

function SummaryWorkspace({ item, busy, onDownload }: { item: SummaryItem; busy: boolean; onDownload: () => void }) {
  const { room, artifact } = item;
  const ready = artifact?.status === "ready";
  return (
    <article className="min-w-0">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><StatusMark item={item} showLabel /><span className="text-[10px] text-ink-subtle">{room.translationRoomCode}</span></div>
          <h2 className="mt-3 text-[20px] font-semibold leading-7">{room.title}</h2>
          <p className="mt-1 text-[11px] text-ink-muted">Hosted by {room.hostName} · ended {formatDate(room.endedAt)}</p>
        </div>
        <Button size="sm" variant={ready ? "default" : "outline"} disabled={!ready || busy} onClick={onDownload} className="h-8 shrink-0 rounded-md text-[11px] shadow-none">
          {busy ? <SpinnerGap size={14} className="animate-spin" /> : <DownloadSimple size={14} />} Download summary
        </Button>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-5 lg:p-7">
          <div className="flex min-h-[360px] flex-col border border-border bg-canvas">
            <div className="flex h-10 items-center justify-between border-b border-border px-4"><span className="text-[10px] font-medium text-ink-subtle">SUMMARY OUTPUT</span><span className="text-[10px] text-ink-subtle">{artifact?.format || "No file"}</span></div>
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div className="max-w-[360px]">
                <SummaryStateIcon item={item} />
                <h3 className="mt-4 text-[15px] font-semibold">{summaryStateTitle(item)}</h3>
                <p className="mt-2 text-[11px] leading-5 text-ink-muted">{summaryStateDescription(item)}</p>
                {ready ? <Button variant="outline" size="sm" className="mt-5 h-8 rounded-md text-[11px] shadow-none" onClick={onDownload}><DownloadSimple size={14} />Open generated file</Button> : null}
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-border text-[10px]">
              <MetaCell label="Created" value={artifact?.createdAt ? formatDate(artifact.createdAt) : "—"} />
              <MetaCell label="Format" value={artifact?.format || "—"} />
              <MetaCell label="Expires" value={artifact?.expiresAt ? formatDate(artifact.expiresAt) : "Workspace policy"} last />
            </div>
          </div>
        </div>

        <aside className="border-t border-border p-5 xl:border-l xl:border-t-0">
          <h3 className="text-[11px] font-semibold">Meeting context</h3>
          {room.description ? <p className="mt-2 text-[11px] leading-5 text-ink-muted">{room.description}</p> : null}
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <ContextRow icon={Users} label="Participants" value={String(room.participantCount)} />
            <ContextRow icon={Clock} label="Duration" value={formatDuration(room.durationSeconds)} />
            <ContextRow icon={Translate} label="Language route" value={formatLanguageRoute(room)} />
            <ContextRow icon={Archive} label="Other outputs" value={String(Math.max(0, room.artifacts.length - (artifact ? 1 : 0)))} />
          </dl>
          {artifact?.consentRequired ? <div className="mt-4 flex items-start gap-2 border border-border bg-surface-2 p-3 text-[10px] leading-4 text-ink-muted"><WarningCircle size={14} className="mt-0.5 shrink-0" /><span>Consent is required. Downloading will record your approval before opening the file.</span></div> : null}
        </aside>
      </div>
    </article>
  );
}

function StatusMark({ item, showLabel = false }: { item: SummaryItem; showLabel?: boolean }) {
  const attention = ["failed", "expired", "missing"].includes(item.status) || item.artifact?.consentRequired;
  const label = attention ? (item.artifact?.consentRequired ? "Consent required" : item.status === "missing" ? "Not generated" : item.status) : item.status;
  return <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium capitalize", attention ? "text-ink" : "text-ink-muted")}><span className={cn("size-1.5 rounded-full", item.status === "ready" && !attention ? "bg-emerald-500" : item.status === "processing" ? "bg-amber-500" : "bg-ink-subtle")} />{showLabel ? label : null}</span>;
}

function SummaryStateIcon({ item }: { item: SummaryItem }) {
  const className = "mx-auto text-ink-muted";
  if (item.status === "ready") return <CheckCircle size={28} className={className} />;
  if (item.status === "processing") return <SpinnerGap size={28} className={cn(className, "animate-spin")} />;
  return <WarningCircle size={28} className={className} />;
}

function ContextRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) { return <div className="flex items-start justify-between gap-4 py-3 text-[10px]"><dt className="flex items-center gap-1.5 text-ink-subtle"><Icon size={12} />{label}</dt><dd className="max-w-[150px] text-right font-medium text-ink">{value}</dd></div>; }
function MetaCell({ label, value, last = false }: { label: string; value: string; last?: boolean }) { return <div className={cn("min-w-0 px-4 py-3", !last && "border-r border-border")}><span className="block text-ink-subtle">{label}</span><span className="mt-1 block truncate font-medium text-ink" title={value}>{value}</span></div>; }
function LoadingState() { return <div className="grid min-h-[480px] place-items-center"><div className="flex items-center gap-2 text-[11px] text-ink-muted"><SpinnerGap size={15} className="animate-spin" />Loading AI summaries</div></div>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="grid min-h-[480px] place-items-center text-center"><div><WarningCircle size={22} className="mx-auto text-ink-muted" /><p className="mt-3 text-[12px] font-medium">AI summaries could not be loaded</p><p className="mt-1 text-[11px] text-ink-muted">Check the translation-room service and try again.</p><Button variant="outline" size="sm" className="mt-4 h-8" onClick={onRetry}>Retry</Button></div></div>; }
function EmptyState({ hasQuery }: { hasQuery: boolean }) { return <div className="grid min-h-[480px] place-items-center text-center"><div><Robot size={22} className="mx-auto text-ink-muted" /><p className="mt-3 text-[12px] font-medium">{hasQuery ? "No summaries match this search" : "No finished meetings yet"}</p><p className="mt-1 text-[11px] text-ink-muted">{hasQuery ? "Try a different meeting title, code, or host." : "Summary status appears here after a meeting ends."}</p></div></div>; }

function summaryStateTitle(item: SummaryItem) { if (item.artifact?.consentRequired) return "Consent required"; if (item.status === "ready") return "Summary file is ready"; if (item.status === "processing") return "Summary is processing"; if (item.status === "expired") return "Summary retention expired"; if (item.status === "failed") return "Summary generation failed"; return "No summary output"; }
function summaryStateDescription(item: SummaryItem) { if (item.artifact?.consentRequired) return "Approve consent to access this generated summary file."; if (item.status === "ready") return "The generated output is stored with this meeting and ready to download."; if (item.status === "processing") return "WarpTalk is finalizing the summary artifact. This status updates automatically."; if (item.status === "expired") return "The retained summary file is no longer available under the workspace policy."; if (item.status === "failed") return "The summary artifact could not be generated. Re-run generation from the meeting when available."; return "This meeting ended without a summary artifact."; }
function formatDuration(seconds: number) { if (!seconds) return "—"; const minutes = Math.floor(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function formatLanguageRoute(room: EndedRoomHistoryItem) { const targets = room.targetLanguages.length ? room.targetLanguages.join(", ") : "—"; return `${room.sourceLanguage.toUpperCase()} → ${targets.toUpperCase()}`; }
