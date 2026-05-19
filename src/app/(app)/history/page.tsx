"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Archive, Download, FileText, Languages, Pencil, RefreshCw, Search, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRoomHistory } from "@/hooks/use-room-history";
import {
  useCorrectTranscriptSegment,
  useCreateTranscriptExport,
  useDownloadTranscriptExport,
  useTranscriptByRoom,
  useTranscriptSegments,
  useTranscriptTranslations,
} from "@/hooks/use-transcripts";
import { getLanguageName } from "@/lib/languages";
import { cn } from "@/lib/utils";
import type { EndedRoomHistoryItem, RoomArtifactStatus, RoomHistoryArtifact } from "@/types/roomHistory";
import type { TranscriptSegmentDto, TranscriptTranslationDto } from "@/types/transcript";

const EMPTY_ROOMS: EndedRoomHistoryItem[] = [];

const artifactFilters: Array<{ label: string; value?: RoomArtifactStatus }> = [
  { label: "All" },
  { label: "Ready", value: "ready" },
  { label: "Expired", value: "expired" },
  { label: "Missing", value: "missing" },
];

const artifactStatusStyles: Record<RoomArtifactStatus, string> = {
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

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function languageSummary(room: EndedRoomHistoryItem) {
  return `${getLanguageName(room.sourceLanguage)} -> ${room.targetLanguages.map(getLanguageName).join(", ")}`;
}

function normalizeStatus(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function HistoryPage() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [artifactStatus, setArtifactStatus] = useState<RoomArtifactStatus | undefined>();
  const [search, setSearch] = useState("");
  const { data, error, isLoading, refetch } = useRoomHistory({ artifactStatus });

  const rooms = data?.rooms ?? EMPTY_ROOMS;
  const filteredRooms = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rooms;
    return rooms.filter((room) =>
      [room.title, room.translationRoomCode, room.hostName, room.sourceLanguage, ...room.targetLanguages]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [rooms, search]);

  const selectedRoom = useMemo(() => {
    if (filteredRooms.length === 0) return undefined;
    return filteredRooms.find((room) => room.id === selectedRoomId) ?? filteredRooms[0];
  }, [filteredRooms, selectedRoomId]);

  const transcriptQuery = useTranscriptByRoom(selectedRoom?.id);
  const transcriptId = transcriptQuery.data?.id;
  const segmentsQuery = useTranscriptSegments(transcriptId);
  const translationsQuery = useTranscriptTranslations(transcriptId);
  const createExport = useCreateTranscriptExport();
  const downloadExport = useDownloadTranscriptExport();
  const correctSegment = useCorrectTranscriptSegment();

  const showPermission = Boolean(error && error.name === "PermissionDenied");
  const showError = Boolean(error && !showPermission);
  const showEmpty = !isLoading && !showPermission && !showError && rooms.length === 0;

  async function handleExport(format: "txt" | "csv") {
    if (!transcriptId) return;
    const exportRecord = await createExport.mutateAsync({
      transcriptId,
      request: {
        format,
        includedLanguages: selectedRoom?.targetLanguages ?? [],
      },
    });
    const blob = await downloadExport.mutateAsync({ transcriptId, exportId: exportRecord.id });
    downloadBlob(blob, `warptalk-transcript-${transcriptId}.${format}`);
  }

  async function handleCorrect(segment: TranscriptSegmentDto) {
    if (!transcriptId) return;
    const correctedText = window.prompt("Correct transcript text", segment.originalText);
    if (!correctedText || correctedText.trim() === segment.originalText) return;

    await correctSegment.mutateAsync({
      transcriptId,
      segmentId: segment.id,
      request: {
        originalText: segment.originalText,
        correctedText: correctedText.trim(),
        correctionType: "stt",
        triggeredRetranslation: true,
      },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#003476]">
              <FileText className="h-4 w-4" />
              Transcript management
            </div>
            <h1 className="text-2xl font-bold text-black">History & Transcripts</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage ended rooms, transcript segments, translations, corrections, exports, and retained artifacts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 min-w-[260px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search room, code, host, language"
                className="w-full bg-transparent outline-none placeholder:text-slate-400"
              />
            </div>
            <Button variant="outline" className="h-10 border-slate-200 bg-white text-slate-700" onClick={() => void refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
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
      </section>

      {isLoading && <LoadingState />}
      {showPermission && <SystemState icon={<AlertCircle className="h-6 w-6" />} title="Permission denied" description="You do not have access to retained room history." />}
      {showError && <SystemState icon={<AlertCircle className="h-6 w-6" />} title="Could not load history" description="Check the gateway and TranslationRoom service connection." />}
      {showEmpty && <SystemState icon={<Archive className="h-6 w-6" />} title="No ended rooms yet" description="Ended or cancelled rooms will appear here with their transcript records and retained artifacts." />}

      {!isLoading && !showPermission && !showError && selectedRoom && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_1fr]">
          <aside className="space-y-3">
            {filteredRooms.map((room) => (
              <RoomButton key={room.id} room={room} selected={selectedRoom.id === room.id} onClick={() => setSelectedRoomId(room.id)} />
            ))}
          </aside>

          <main className="space-y-5">
            <RoomSummary room={selectedRoom} transcriptStatus={transcriptQuery.data?.status} />

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-black">Transcript segments</h2>
                    <p className="text-sm text-slate-500">
                      {transcriptQuery.data
                        ? `${transcriptQuery.data.totalSegments} segments, ${Math.round(transcriptQuery.data.totalDurationMs / 1000)}s audio`
                        : "No transcript record for this room yet."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={!transcriptId || createExport.isPending || downloadExport.isPending}
                      onClick={() => void handleExport("txt")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      TXT
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!transcriptId || createExport.isPending || downloadExport.isPending}
                      onClick={() => void handleExport("csv")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      CSV
                    </Button>
                  </div>
                </div>

                <TranscriptPanel
                  isTranscriptLoading={transcriptQuery.isLoading}
                  transcriptError={transcriptQuery.error}
                  segments={segmentsQuery.data?.items ?? []}
                  translations={translationsQuery.data?.items ?? []}
                  isLoading={segmentsQuery.isLoading || translationsQuery.isLoading}
                  onCorrect={handleCorrect}
                  correcting={correctSegment.isPending}
                />
              </section>

              <section className="space-y-5">
                <ArtifactPanel artifacts={selectedRoom.artifacts} />
                <ParticipantPanel room={selectedRoom} />
              </section>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function RoomButton({ room, selected, onClick }: { room: EndedRoomHistoryItem; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors",
        selected ? "border-[#003476] ring-2 ring-[#e4eef9]" : "border-slate-200 hover:border-[#003476]/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="line-clamp-2 text-sm font-bold text-black">{room.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(room.endedAt)}</p>
        </div>
        <Badge className="border border-slate-200 bg-slate-50 text-slate-700" variant="outline">
          {normalizeStatus(room.status)}
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
  );
}

function RoomSummary({ room, transcriptStatus }: { room: EndedRoomHistoryItem; transcriptStatus?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge className="border-[#003476]/20 bg-[#e4eef9] text-[#003476]" variant="outline">
              {room.translationRoomCode}
            </Badge>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
              {transcriptStatus ? `transcript ${normalizeStatus(transcriptStatus)}` : "transcript unavailable"}
            </Badge>
          </div>
          <h2 className="text-2xl font-bold text-black">{room.title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{room.description || languageSummary(room)}</p>
        </div>
        <div className="grid min-w-[280px] grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <Detail label="Ended" value={formatDateTime(room.endedAt)} />
          <Detail label="Duration" value={formatDuration(room.durationSeconds)} />
          <Detail label="Participants" value={String(room.participantCount)} />
          <Detail label="Host" value={room.hostName} />
        </div>
      </div>
    </section>
  );
}

function TranscriptPanel({
  isTranscriptLoading,
  transcriptError,
  segments,
  translations,
  isLoading,
  correcting,
  onCorrect,
}: {
  isTranscriptLoading: boolean;
  transcriptError: unknown;
  segments: TranscriptSegmentDto[];
  translations: TranscriptTranslationDto[];
  isLoading: boolean;
  correcting: boolean;
  onCorrect: (segment: TranscriptSegmentDto) => void | Promise<void>;
}) {
  const translationsBySegment = useMemo(() => {
    return translations.reduce<Record<string, TranscriptTranslationDto[]>>((acc, translation) => {
      acc[translation.segmentId] = [...(acc[translation.segmentId] ?? []), translation];
      return acc;
    }, {});
  }, [translations]);

  if (isTranscriptLoading || isLoading) {
    return <div className="h-[420px] animate-pulse bg-slate-50" />;
  }

  if (transcriptError) {
    return (
      <div className="flex min-h-[360px] items-center justify-center p-8 text-center">
        <div>
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h3 className="text-lg font-bold text-black">No transcript record</h3>
          <p className="mt-1 text-sm text-slate-500">This room has no finalized transcript in TranscriptService yet.</p>
        </div>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex min-h-[360px] items-center justify-center p-8 text-center">
        <div>
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h3 className="text-lg font-bold text-black">No transcript segments</h3>
          <p className="mt-1 text-sm text-slate-500">Segments will appear after STT writes transcript data for this room.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[680px] overflow-y-auto p-4">
      <div className="space-y-3">
        {segments.map((segment) => (
          <article key={segment.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-[#003476]">{formatTime(segment.startTimeMs)}</span>
                  <span>{segment.speakerName}</span>
                  <span>{getLanguageName(segment.originalLanguage)}</span>
                  {segment.confidence !== undefined && <span>{Math.round(segment.confidence * 100)}% confidence</span>}
                </div>
                <p className="text-sm leading-relaxed text-black">{segment.originalText}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={correcting}
                className="shrink-0 text-slate-500 hover:text-[#003476]"
                onClick={() => void onCorrect(segment)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>

            {(translationsBySegment[segment.id] ?? []).length > 0 && (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                {translationsBySegment[segment.id].map((translation) => (
                  <div key={translation.id} className="rounded-lg bg-[#fdfcf6] px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#003476]">
                      <Languages className="h-3.5 w-3.5" />
                      {getLanguageName(translation.targetLanguage)}
                      {translation.latencyMs ? <span className="text-slate-400">{translation.latencyMs}ms</span> : null}
                    </div>
                    <p className="text-sm text-slate-700">{translation.translatedText}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function ArtifactPanel({ artifacts }: { artifacts: RoomHistoryArtifact[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-black">Artifacts</h2>
        <span className="text-xs font-semibold text-slate-500">{artifacts.length} records</span>
      </div>
      {artifacts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">No retained artifacts are linked to this room.</p>
      ) : (
        <div className="space-y-2">
          {artifacts.map((artifact) => (
            <a
              key={artifact.id}
              href={artifact.fileUrl || undefined}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "block rounded-lg border border-slate-200 p-3 transition-colors",
                artifact.fileUrl ? "hover:border-[#003476]/40" : "cursor-default",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-black">{artifact.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{artifact.format ?? artifact.type}</p>
                </div>
                <Badge className={artifactStatusStyles[artifact.status]} variant="outline">
                  {normalizeStatus(artifact.status)}
                </Badge>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function ParticipantPanel({ room }: { room: EndedRoomHistoryItem }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-black">Participants</h2>
        <span className="text-xs font-semibold text-slate-500">{room.participants.length} records</span>
      </div>
      <div className="space-y-2">
        {room.participants.map((participant) => (
          <div key={participant.id} className="rounded-lg border border-slate-200 px-3 py-2">
            <p className="text-sm font-bold text-black">{participant.displayName}</p>
            <p className="mt-1 text-xs text-slate-500">
              {participant.role} · {getLanguageName(participant.speakLanguage)} to {getLanguageName(participant.listenLanguage)}
            </p>
          </div>
        ))}
        {room.participants.length === 0 && <p className="text-sm text-slate-500">No participant records returned.</p>}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-black">{value}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_1fr]">
      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
        ))}
      </div>
      <div className="h-[560px] animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
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
