"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  FileAudio,
  FileText,
  Languages,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRoomHistory } from "@/hooks/use-room-history";
import { getLanguageName } from "@/lib/languages";
import { cn } from "@/lib/utils";
import type {
  EndedRoomHistoryItem,
  RoomArtifactStatus,
  RoomArtifactType,
  RoomConsentStatus,
  RoomHistoryArtifact,
  RoomHistoryLoadState,
} from "@/types/roomHistory";

const EMPTY_ROOMS: EndedRoomHistoryItem[] = [];

const artifactFilters: Array<{ label: string; value?: RoomArtifactStatus }> = [
  { label: "All artifacts" },
  { label: "Ready", value: "ready" },
  { label: "Expired", value: "expired" },
  { label: "Missing", value: "missing" },
];

const stateOptions: Array<{ label: string; value: RoomHistoryLoadState }> = [
  { label: "Ready", value: "ready" },
  { label: "Loading", value: "loading" },
  { label: "Empty", value: "empty" },
  { label: "Permission denied", value: "permission_denied" },
  { label: "Error", value: "error" },
];

const artifactTypeIcon: Record<RoomArtifactType, ReactNode> = {
  transcript_export: <FileText className="h-4 w-4" />,
  summary_export: <Sparkles className="h-4 w-4" />,
  recording: <FileAudio className="h-4 w-4" />,
  debug_log: <Archive className="h-4 w-4" />,
  audio_sample: <FileAudio className="h-4 w-4" />,
};

const statusStyles: Record<RoomArtifactStatus, string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  processing: "border-[#003476]/15 bg-[#e4eef9] text-[#003476]",
  expired: "border-amber-200 bg-amber-50 text-amber-700",
  missing: "border-slate-200 bg-slate-100 text-slate-600",
  failed: "border-red-200 bg-red-50 text-red-700",
  deleted: "border-slate-200 bg-slate-100 text-slate-500",
};

function formatDateTime(value?: string) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "No file";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function languageSummary(room: EndedRoomHistoryItem) {
  return `${getLanguageName(room.sourceLanguage)} -> ${room.targetLanguages.map(getLanguageName).join(", ")}`;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export default function HistoryPage() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [artifactStatus, setArtifactStatus] = useState<RoomArtifactStatus | undefined>();
  const [stateMode, setStateMode] = useState<RoomHistoryLoadState>("ready");
  const forcedLoading = stateMode === "loading";
  const queryState = forcedLoading ? "ready" : stateMode;
  const { data, error, isLoading, refetch } = useRoomHistory({
    state: queryState,
    artifactStatus,
  });

  const rooms = data?.rooms ?? EMPTY_ROOMS;
  const selectedRoom = useMemo(() => {
    if (rooms.length === 0) return undefined;
    return rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];
  }, [rooms, selectedRoomId]);

  const totalArtifacts = rooms.reduce((total, room) => total + room.artifacts.length, 0);
  const readyArtifacts = rooms.reduce(
    (total, room) => total + room.artifacts.filter((artifact) => artifact.status === "ready").length,
    0,
  );
  const unavailableArtifacts = rooms.reduce(
    (total, room) =>
      total + room.artifacts.filter((artifact) => artifact.status === "expired" || artifact.status === "missing").length,
    0,
  );

  const showLoading = isLoading || forcedLoading;
  const showPermission = Boolean(error && error.name === "PermissionDenied");
  const showError = Boolean(error && !showPermission);
  const showEmpty = !showLoading && !showPermission && !showError && rooms.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-[#003476]/15 bg-[#e4eef9]/70 px-2.5 py-1 text-xs font-semibold text-[#003476]">
            <FileText className="h-3.5 w-3.5" />
            WT-97 Room history artifacts
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-black">History & Transcripts</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Review ended rooms, finalized transcripts, AI summaries, retention windows, and downloadable artifacts after
            a meeting closes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm">
            <Search className="h-4 w-4" />
            <span>Search history</span>
          </div>
          <Button
            variant="outline"
            className="h-10 border-slate-200 bg-white text-slate-700"
            onClick={() => void refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard icon={<Clock3 className="h-5 w-5" />} label="Ended rooms" value={String(rooms.length)} />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Artifacts" value={String(totalArtifacts)} />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Ready" value={String(readyArtifacts)} tone="primary" />
        <MetricCard
          icon={<TriangleAlert className="h-5 w-5" />}
          label="Expired or missing"
          value={String(unavailableArtifacts)}
          tone="warning"
        />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {artifactFilters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => setArtifactStatus(filter.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                artifactStatus === filter.value
                  ? "border-[#003476] bg-[#003476] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-[#003476]/30 hover:text-[#003476]",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">State preview</span>
          {stateOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setStateMode(option.value);
                setSelectedRoomId(null);
              }}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-semibold",
                stateMode === option.value ? "bg-[#e4eef9] text-[#003476]" : "text-slate-500 hover:bg-slate-100",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {showLoading && <LoadingState />}
      {showPermission && <SystemState icon={<Lock className="h-6 w-6" />} title="Permission denied" description="You do not have access to this room history or its retained artifacts." />}
      {showError && <SystemState icon={<AlertCircle className="h-6 w-6" />} title="Could not load artifacts" description="The history adapter returned an error. Try refreshing or check the gateway route when the real API is connected." />}
      {showEmpty && <SystemState icon={<Archive className="h-6 w-6" />} title="No ended rooms yet" description="Ended rooms with transcripts, summaries, or recordings will appear here after the meeting lifecycle closes." />}

      {!showLoading && !showPermission && !showError && selectedRoom && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-3">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={cn(
                  "w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors",
                  selectedRoom.id === room.id ? "border-[#003476] ring-2 ring-[#e4eef9]" : "border-slate-200 hover:border-[#003476]/30",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-black">{room.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(room.endedAt)}</p>
                  </div>
                  <Badge className="border border-slate-200 bg-slate-50 text-slate-700" variant="outline">
                    {statusLabel(room.status)}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <IconLine icon={<Users className="h-3.5 w-3.5" />}>{room.participantCount} participants</IconLine>
                  <IconLine icon={<Timer className="h-3.5 w-3.5" />}>{formatDuration(room.durationSeconds)}</IconLine>
                  <IconLine icon={<Languages className="h-3.5 w-3.5" />} className="col-span-2">
                    {languageSummary(room)}
                  </IconLine>
                </div>
              </button>
            ))}
          </aside>

          <main className="space-y-6">
            <RoomOverview room={selectedRoom} />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
              <section className="space-y-4">
                <SectionHeader title="Artifacts" detail={`${selectedRoom.artifacts.length} linked files and records`} />
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {selectedRoom.artifacts.map((artifact) => (
                    <ArtifactCard key={artifact.id} artifact={artifact} />
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <SectionHeader title="AI summary" detail={selectedRoom.summary?.modelUsed ?? "No model"} />
                <SummaryPanel room={selectedRoom} />
              </section>
            </div>

            <MappingPanel />
          </main>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "warning";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg border",
            tone === "primary" && "border-[#003476]/15 bg-[#e4eef9] text-[#003476]",
            tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
            tone === "neutral" && "border-slate-100 bg-slate-50 text-slate-600",
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-black">{value}</p>
        </div>
      </div>
    </div>
  );
}

function RoomOverview({ room }: { room: EndedRoomHistoryItem }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-[#fdfcf6] p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className="border-[#003476]/20 bg-white text-[#003476]" variant="outline">
              {room.translationRoomCode}
            </Badge>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
              {statusLabel(room.status)}
            </Badge>
          </div>
          <h2 className="text-2xl font-bold text-black">{room.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{room.description}</p>
        </div>

        <div className="grid min-w-[280px] grid-cols-2 gap-3 rounded-xl border border-[#003476]/10 bg-white p-3">
          <Detail label="Ended" value={formatDateTime(room.endedAt)} icon={<CalendarClock className="h-4 w-4" />} />
          <Detail label="Duration" value={formatDuration(room.durationSeconds)} icon={<Timer className="h-4 w-4" />} />
          <Detail label="Participants" value={String(room.participantCount)} icon={<Users className="h-4 w-4" />} />
          <Detail label="Host" value={room.hostName} icon={<ShieldCheck className="h-4 w-4" />} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <InfoStrip icon={<Languages className="h-4 w-4" />} label="Language summary" value={languageSummary(room)} />
        <InfoStrip
          icon={<Clock3 className="h-4 w-4" />}
          label="Retention"
          value={`${room.retention.policyName}, expires ${formatDateTime(room.retention.expiresAt)}`}
        />
        <InfoStrip
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Consent"
          value={`Recording ${room.consent.recording}, transcript ${room.consent.transcript}`}
        />
      </div>
    </section>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-slate-500">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-bold text-black">{value}</p>
    </div>
  );
}

function InfoStrip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#003476]/10 bg-white p-3">
      <div className="mb-1 flex items-center gap-2 text-[#003476]">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm leading-relaxed text-slate-700">{value}</p>
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: RoomHistoryArtifact }) {
  const isUnavailable = artifact.status === "expired" || artifact.status === "missing" || artifact.status === "deleted";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#003476]/10 bg-[#e4eef9] text-[#003476]">
            {artifactTypeIcon[artifact.type]}
          </div>
          <div>
            <h3 className="text-sm font-bold text-black">{artifact.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{artifact.description}</p>
          </div>
        </div>
        <Badge className={cn("capitalize", statusStyles[artifact.status])} variant="outline">
          {statusLabel(artifact.status)}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <ArtifactMeta label="Format" value={artifact.format ?? "Record"} />
        <ArtifactMeta label="Size" value={formatBytes(artifact.fileSizeBytes)} />
        <ArtifactMeta label="Language" value={artifact.language ?? "All"} />
        <ArtifactMeta label="Retention" value={artifact.retentionDays ? `${artifact.retentionDays} days` : "Policy"} />
      </div>

      {isUnavailable ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {artifact.status === "expired"
            ? `Expired ${formatDateTime(artifact.expiresAt)} by retention policy.`
            : "Artifact reference exists, but no downloadable file is available."}
        </div>
      ) : (
        <Button className="mt-4 h-9 w-full bg-[#003476] text-white hover:bg-[#003476]/90">
          <Download className="mr-2 h-4 w-4" />
          Open artifact
        </Button>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
        <span className="rounded bg-slate-100 px-2 py-1">{artifact.backendSource}</span>
        <span className="rounded bg-slate-100 px-2 py-1">{consentText(artifact.consentStatus)}</span>
      </div>
    </article>
  );
}

function ArtifactMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-700">{value}</p>
    </div>
  );
}

function consentText(value?: RoomConsentStatus) {
  if (!value) return "consent inherited";
  return `consent ${value.replace(/_/g, " ")}`;
}

function SummaryPanel({ room }: { room: EndedRoomHistoryItem }) {
  if (!room.summary) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        No AI summary was generated for this room.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-[#003476]">
        <Sparkles className="h-5 w-5" />
        <h3 className="text-sm font-bold text-black">Meeting summary</h3>
      </div>
      <p className="text-sm leading-relaxed text-slate-700">{room.summary.summary}</p>
      <SummaryList title="Key points" items={room.summary.keyPoints} />
      <SummaryList title="Decisions" items={room.summary.decisions} />
      <SummaryList title="Action items" items={room.summary.actionItems} />
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-[#003476]/10 bg-[#fdfcf6] px-3 py-2 text-sm text-slate-700">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function MappingPanel() {
  const rows = [
    ["Room history", "translation_rooms", "title, host_id, status, started_at, ended_at, duration_seconds"],
    ["Participants", "translation_room_participants", "display_name, role, listen_language, speak_language"],
    ["Transcript", "transcripts + transcript_exports", "status, total_segments, total_duration_ms, format, file_url"],
    ["Recording artifacts", "translation_room_recordings", "recording_type, file_url, file_format, status, duration_seconds"],
    ["AI summary", "translation_room_summaries", "summary, key_points, decisions, action_items, model_used"],
    ["Retention/consent", "settings + artifact metadata", "expires_at, retention_days, consent_required, consent_status"],
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeader title="Frontend/backend mapping" detail="WT-97 adapter contract" />
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
        {rows.map(([label, source, fields]) => (
          <div key={label} className="grid grid-cols-1 gap-2 border-b border-slate-100 p-3 last:border-b-0 md:grid-cols-[180px_220px_1fr]">
            <p className="text-sm font-bold text-black">{label}</p>
            <p className="text-xs font-semibold text-[#003476]">{source}</p>
            <p className="text-xs leading-relaxed text-slate-600">{fields}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-black">{title}</h2>
        <p className="text-xs font-medium text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
    </div>
  );
}

function SystemState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="max-w-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[#003476]/10 bg-[#e4eef9] text-[#003476]">
          {icon}
        </div>
        <h2 className="text-xl font-bold text-black">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function IconLine({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      {icon}
      {children}
    </span>
  );
}
