"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Calendar, Clock, Globe, Plus, Search, Users } from "lucide-react";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { getLanguageName } from "@/lib/languages";
import type { TranslationRoomDto, TranslationRoomStatus } from "@/types/translationRoom";

const statusOptions: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "SCHEDULED,WAITING", label: "Upcoming" },
  { value: "IN_PROGRESS,PAUSED", label: "Active" },
  { value: "ENDED,CANCELLED", label: "Completed" },
];

const statusLabels: Record<TranslationRoomStatus, string> = {
  scheduled: "Scheduled",
  waiting: "Waiting",
  in_progress: "Active",
  paused: "Paused",
  ended: "Ended",
  cancelled: "Cancelled",
  expired: "Expired",
  failed: "Failed",
};

const statusStyles: Record<TranslationRoomStatus, string> = {
  scheduled: "border-[#003476]/15 bg-[#e4eef9] text-[#003476]",
  waiting: "border-amber-200 bg-amber-50 text-amber-700",
  in_progress: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paused: "border-slate-200 bg-slate-50 text-slate-700",
  ended: "border-slate-200 bg-white text-slate-600",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  expired: "border-slate-200 bg-slate-50 text-slate-500",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
};

function formatDate(value?: string) {
  if (!value) return "No schedule";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLanguages(room: TranslationRoomDto) {
  const targets = room.targetLanguages.map(getLanguageName).join(", ");
  return `${getLanguageName(room.sourceLanguage ?? "en")} -> ${targets || "No target"}`;
}

function getRoomTime(room: TranslationRoomDto) {
  return room.scheduledAt ?? room.startedAt ?? room.createdAt;
}

export default function RoomsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const roomList = useTranslationRooms({
    status: status || undefined,
    search: search.trim() || undefined,
    pageSize: 100,
  });

  const rooms = useMemo(() => roomList.data?.rooms ?? [], [roomList.data?.rooms]);
  const activeCount = useMemo(
    () => rooms.filter((room) => room.status === "in_progress" || room.status === "paused").length,
    [rooms]
  );
  const upcomingCount = useMemo(
    () => rooms.filter((room) => room.status === "scheduled" || room.status === "waiting").length,
    [rooms]
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6 pb-16">
      <div className="flex flex-col gap-4 rounded-2xl border border-[#e4eef9] bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#003476]">Translation rooms</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Room operations</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Manage rooms backed by the TranslationRoom API. Empty states reflect live data from the current workspace.
          </p>
        </div>
        <Link
          href="/rooms/create"
          className="inline-flex h-10 items-center justify-center rounded-md bg-[#003476] px-4 text-sm font-semibold text-white hover:bg-[#003476]/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create room
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard icon={<Calendar className="h-4 w-4" />} label="Total rooms" value={roomList.data?.total ?? rooms.length} />
        <MetricCard icon={<Clock className="h-4 w-4" />} label="Upcoming" value={upcomingCount} />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Active" value={activeCount} />
      </div>

      <div className="rounded-2xl border border-[#e4eef9] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#e4eef9] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, description, or code"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#003476] focus:ring-1 focus:ring-[#003476]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setStatus(option.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  status === option.value
                    ? "border-[#003476] bg-[#003476] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[#003476]/40"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {roomList.isLoading && <StateRow title="Loading rooms..." description="Fetching rooms from the TranslationRoom service." />}

        {roomList.isError && (
          <StateRow
            icon={<AlertCircle className="h-5 w-5" />}
            title="Could not load rooms"
            description="Check your session and the TranslationRoom service connection."
          />
        )}

        {!roomList.isLoading && !roomList.isError && rooms.length === 0 && (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <Calendar className="h-10 w-10 text-[#003476]" />
            <h2 className="mt-4 text-xl font-bold text-slate-950">No rooms found</h2>
            <p className="mt-2 max-w-md text-sm text-slate-600">
              Create a translation room or adjust your filters to see existing scheduled, active, or completed rooms.
            </p>
            <Link
              href="/rooms/create"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-[#003476] px-4 text-sm font-semibold text-white hover:bg-[#003476]/90"
            >
              Create room
            </Link>
          </div>
        )}

        {rooms.length > 0 && (
          <div className="divide-y divide-[#e4eef9]">
            {rooms.map((room) => (
              <Link
                key={room.id}
                href={`/room/${room.id}`}
                className="grid gap-4 p-4 transition hover:bg-[#fdfcf6]/60 lg:grid-cols-[minmax(0,1.5fr)_180px_220px_140px]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-950">{room.title}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${statusStyles[room.status]}`}>
                      {statusLabels[room.status]}
                    </span>
                  </div>
                  {room.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{room.description}</p>}
                  <p className="mt-2 font-mono text-xs font-semibold uppercase tracking-wide text-[#003476]">
                    {room.translationRoomCode}
                  </p>
                </div>
                <InfoLine icon={<Clock className="h-4 w-4" />} label={formatDate(getRoomTime(room))} />
                <InfoLine icon={<Globe className="h-4 w-4" />} label={formatLanguages(room)} />
                <InfoLine
                  icon={<Users className="h-4 w-4" />}
                  label={`${room.participantCount ?? 0}/${room.maxParticipants} participants`}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#e4eef9] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e4eef9] text-[#003476]">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function InfoLine({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
      <span className="text-[#003476]">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function StateRow({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center text-slate-600">
      {icon}
      <p className="mt-3 text-base font-bold text-slate-950">{title}</p>
      <p className="mt-1 text-sm">{description}</p>
    </div>
  );
}
