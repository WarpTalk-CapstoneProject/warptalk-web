"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  FileText,
  Languages,
  Radio,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslationRoom, useTranslationRoomParticipants } from "@/hooks/use-translationRooms";
import { getLanguageName } from "@/lib/languages";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import type { TranslationRoomDto, TranslationRoomStatus } from "@/types/translationRoom";

const previewDocuments = ["Investor briefing.pdf", "Product glossary.csv", "Q&A agenda.docx"];

const statusLabels: Record<TranslationRoomStatus, string> = {
  scheduled: "Scheduled",
  waiting: "Waiting for host",
  in_progress: "Meeting in progress",
  paused: "Meeting paused",
  ended: "Meeting ended",
  cancelled: "Cancelled",
  expired: "Expired",
  failed: "Failed",
};

export default function RoomInformationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomId = params.id;
  const isPreviewRoom = roomId.startsWith("preview-");
  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const liveRoomState = useTranslationRoomStore((state) => state.translationRoomState);

  const room = roomQuery.data ?? (isPreviewRoom ? getPreviewRoom(roomId) : null);
  const apiParticipants = participantsQuery.data ?? [];
  const activeApiParticipants = apiParticipants.filter((participant) =>
    ["joined", "connected"].includes(participant.status.toLowerCase())
  );
  const activeLiveParticipants = liveParticipants.filter((participant) =>
    ["joined", "connected"].includes(participant.status?.toLowerCase() ?? "")
  );
  const liveStateMatchesRoom = !liveRoomState || liveRoomState.translationRoomId === roomId;
  const activeParticipantCount =
    liveStateMatchesRoom && activeLiveParticipants.length > 0
      ? activeLiveParticipants.length
      : activeApiParticipants.length > 0
        ? activeApiParticipants.length
        : room?.status === "in_progress"
          ? room.participantCount ?? 0
          : 0;

  if (!room) {
    return (
      <div className="grid h-full place-items-center rounded-[28px] border bg-white/90">
        <p className="text-sm text-neutral-500">Room information is unavailable.</p>
      </div>
    );
  }

  const languageNames = [room.sourceLanguage, ...room.targetLanguages]
    .filter((language): language is string => Boolean(language))
    .map(getLanguageName);
  const isEnded = room.status === "ended";
  const attachedDocuments = isPreviewRoom ? previewDocuments : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold text-neutral-950">{room.title}</p>
          <p className="mt-0.5 text-xs text-neutral-500">{room.translationRoomCode}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push("/rooms");
              }
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white text-neutral-950 shadow-sm transition hover:bg-neutral-50"
            aria-label="Go back"
            title="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Link
            href={`/rooms/${roomId}/setup`}
            className="inline-flex h-10 items-center justify-center rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Join Meeting
          </Link>
        </div>
      </div>

      <section className="grid shrink-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Users />}
          label="Invited and joined"
          value={`${activeParticipantCount}/${room.maxParticipants}`}
          detail={room.status === "in_progress" ? "Live participant count" : "Meeting has not started"}
        />
        <Metric
          icon={<Languages />}
          label="Languages"
          value={languageNames.join(", ")}
          detail={`${getLanguageName(room.sourceLanguage ?? "")} transcript source`}
        />
        <Metric
          icon={<CalendarClock />}
          label={isEnded ? "Meeting period" : "Start time"}
          value={isEnded ? formatTimeRange(room) : formatDateTime(room.scheduledAt ?? room.startedAt)}
          detail={isEnded ? formatDuration(room) : "Local meeting schedule"}
        />
        <Metric
          icon={room.status === "in_progress" ? <Radio /> : <CheckCircle2 />}
          label="Room status"
          value={statusLabels[room.status]}
          detail={room.status === "in_progress" ? "Updating in realtime" : "Current lifecycle state"}
        />
      </section>

      <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Card className="min-h-0 overflow-hidden rounded-[26px] bg-white/90">
          <CardContent className="grid h-full min-h-0 content-start gap-5 p-5">
            <div>
              <p className="text-sm font-semibold text-neutral-950">Meeting information</p>
              <p className="mt-1 text-xs text-neutral-500">Current room details and timing.</p>
            </div>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <InformationItem label="Meeting name" value={room.title} />
              <InformationItem label="Room code" value={room.translationRoomCode} />
              <InformationItem label="Invited capacity" value={`${room.maxParticipants} people`} />
              <InformationItem label="Currently joined" value={`${activeParticipantCount} people`} />
              <InformationItem label="Languages used" value={languageNames.join(" / ")} />
              <InformationItem label="Status" value={statusLabels[room.status]} />
              <InformationItem label="Scheduled start" value={formatDateTime(room.scheduledAt)} />
              <InformationItem
                label={isEnded ? "Meeting ended" : "Actual start"}
                value={formatDateTime(isEnded ? room.endedAt : room.startedAt)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden rounded-[26px] bg-white/90">
          <CardContent className="flex h-full min-h-0 flex-col p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-950">Attached documents</p>
                <p className="mt-1 text-xs text-neutral-500">Context available to the meeting.</p>
              </div>
              <Badge variant="outline">{attachedDocuments.length} files</Badge>
            </div>
            <div className="mt-4 space-y-2 overflow-y-auto">
              {attachedDocuments.length ? (
                attachedDocuments.map((document) => (
                  <div key={document} className="flex items-center gap-3 rounded-2xl border bg-white px-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-950 text-white">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{document}</span>
                  </div>
                ))
              ) : (
                <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed text-center text-sm text-neutral-400">
                  No documents attached
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-[24px] bg-white/90">
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        </div>
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="mt-1 truncate text-lg font-semibold text-neutral-950" title={value}>{value}</p>
        <p className="mt-1 text-[11px] text-neutral-400">{detail}</p>
      </CardContent>
    </Card>
  );
}

function InformationItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-neutral-200 pb-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-neutral-950">{value}</p>
    </div>
  );
}

function getPreviewRoom(id: string): TranslationRoomDto {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 38 * 60 * 1000);
  return {
    id,
    workspaceId: "preview",
    hostId: "host",
    title: id.includes("partner") ? "Partner Sync Room" : "Investor Q&A Translation",
    description: "Live multilingual investor meeting.",
    translationRoomCode: id.includes("partner") ? "SYNC-882" : "WARP-241",
    status: "in_progress",
    translationRoomType: "scheduled",
    maxParticipants: 50,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN", "ja-JP"],
    scheduledAt: startedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    createdAt: new Date(startedAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    participantCount: 4,
    isHost: true,
  };
}

function formatDateTime(value?: string) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTimeRange(room: TranslationRoomDto) {
  if (!room.startedAt || !room.endedAt) return "Time unavailable";
  const formatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${formatter.format(new Date(room.startedAt))} - ${formatter.format(new Date(room.endedAt))}`;
}

function formatDuration(room: TranslationRoomDto) {
  const seconds =
    room.durationSeconds ??
    (room.startedAt && room.endedAt
      ? Math.max(0, Math.round((new Date(room.endedAt).getTime() - new Date(room.startedAt).getTime()) / 1000))
      : 0);
  if (!seconds) return "Duration unavailable";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${hours}h ` : ""}${minutes}m duration`;
}
