"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import gsap from "gsap";
import { motion } from "motion/react";
import { ArrowLeft, CalendarDays, FileText, Languages, Mail, Paperclip, Plus, Settings2, UploadCloud, Video, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { cn } from "@/lib/utils";
import type { TranslationRoomDto, TranslationRoomStatus } from "@/types/translationRoom";

const demoRooms: TranslationRoomDto[] = [
  {
    id: "preview-investor-qa",
    workspaceId: "preview",
    hostId: "host",
    title: "Investor Q&A Translation",
    description: "Live multilingual room for product due diligence.",
    translationRoomCode: "WARP-241",
    status: "in_progress",
    translationRoomType: "scheduled",
    maxParticipants: 24,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN", "ja-JP"],
    startedAt: new Date().toISOString(),
    scheduledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    participantCount: 18,
    isHost: true,
  },
  {
    id: "preview-partner-sync",
    workspaceId: "preview",
    hostId: "host",
    title: "Partner Sync Room",
    description: "Scheduled interpretation room for APAC stakeholders.",
    translationRoomCode: "SYNC-882",
    status: "scheduled",
    translationRoomType: "scheduled",
    maxParticipants: 12,
    sourceLanguage: "vi-VN",
    targetLanguages: ["en-US"],
    scheduledAt: new Date(Date.now() + 1000 * 60 * 55).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    participantCount: 7,
    isHost: true,
  },
  {
    id: "preview-onboarding",
    workspaceId: "preview",
    hostId: "host",
    title: "Customer Onboarding",
    description: "Waiting room for enterprise onboarding and support.",
    translationRoomCode: "CUST-104",
    status: "waiting",
    translationRoomType: "scheduled",
    maxParticipants: 16,
    sourceLanguage: "en-US",
    targetLanguages: ["ko-KR", "vi-VN"],
    scheduledAt: new Date(Date.now() + 1000 * 60 * 130).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    participantCount: 9,
    isHost: true,
  },
  {
    id: "preview-board-review",
    workspaceId: "preview",
    hostId: "host",
    title: "Board Review Translation",
    description: "Completed session with transcript artifacts ready.",
    translationRoomCode: "BORD-778",
    status: "ended",
    translationRoomType: "scheduled",
    maxParticipants: 20,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN"],
    endedAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    participantCount: 14,
    isHost: true,
  },
];

const statusStyles: Record<TranslationRoomStatus, string> = {
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-700",
  in_progress: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paused: "border-neutral-200 bg-neutral-100 text-neutral-700",
  ended: "border-neutral-200 bg-white text-neutral-600",
  cancelled: "border-red-200 bg-red-50 text-red-700",
  expired: "border-neutral-200 bg-neutral-100 text-neutral-600",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const roomTabs = [
  { value: "calendar", label: "Calendar" },
  { value: "setup", label: "Setup" },
  { value: "rooms", label: "Rooms" },
];

const defaultCalendarStart = new Date().toISOString().slice(0, 10);

type ScheduleSize = 15 | 30;

const setupLanguages = [
  { code: "vi-VN", label: "Vietnamese" },
  { code: "en-US", label: "English" },
  { code: "ja-JP", label: "Japanese" },
];

const defaultSetupDocuments = ["APAC agenda.pdf", "partner glossary.csv", "onboarding brief.pdf"];
const defaultInvitePresets = ["interpreters@warptalk.ai", "workspace-ops@client.com"];

function languageName(code?: string) {
  const labels: Record<string, string> = {
    "en-US": "English",
    "vi-VN": "Vietnamese",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
  };
  return labels[code ?? ""] ?? code ?? "Unknown";
}

function formatTime(value?: string) {
  if (!value) return "No schedule";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function shortDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", day: "2-digit" }).format(value);
}

function roomDateKey(room: TranslationRoomDto) {
  const value = room.scheduledAt ?? room.startedAt ?? room.endedAt ?? room.createdAt;
  return new Date(value).toDateString();
}

function formatLanguages(room: TranslationRoomDto) {
  return `${languageName(room.sourceLanguage)} -> ${room.targetLanguages.map(languageName).join(", ")}`;
}

function buildCalendarDays(startValue: string, size: ScheduleSize) {
  const startDate = startValue ? new Date(`${startValue}T00:00:00`) : new Date();
  return Array.from({ length: size }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

export default function RoomsPage() {
  const [tab, setTab] = useState("calendar");
  const [calendarStart, setCalendarStart] = useState(defaultCalendarStart);
  const [scheduleSize, setScheduleSize] = useState<ScheduleSize>(15);
  const [selectedScheduleDay, setSelectedScheduleDay] = useState<Date | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const roomList = useTranslationRooms({ pageSize: 100 });

  const rooms = useMemo(() => {
    const apiRooms = roomList.data?.rooms ?? [];
    return apiRooms.length > 0 ? apiRooms : demoRooms;
  }, [roomList.data?.rooms]);

  const scheduledRooms = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting");
  const activeRooms = rooms.filter((room) => room.status === "in_progress" || room.status === "paused");
  const endedRooms = rooms.filter((room) => room.status === "ended" || room.status === "cancelled");
  const needsSetup = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting");
  const calendarDays = useMemo(() => buildCalendarDays(calendarStart, scheduleSize), [calendarStart, scheduleSize]);

  useEffect(() => {
    if (!asideRef.current) return;
    gsap.to(asideRef.current, {
      x: tab === "setup" ? 32 : 0,
      autoAlpha: tab === "setup" ? 0 : 1,
      duration: 0.42,
      ease: "power3.out",
      pointerEvents: tab === "setup" ? "none" : "auto",
    });
  }, [tab]);

  return (
    <div className={cn("grid h-full min-h-0 gap-3 transition-[grid-template-columns] duration-500 ease-out", tab === "setup" ? "xl:grid-cols-[minmax(0,1fr)_0px]" : "xl:grid-cols-[minmax(0,1fr)_292px]")}>
      <Card className="min-h-0 overflow-hidden rounded-[28px] bg-white/88 shadow-sm">
        <CardContent className="h-full p-3">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <RoomTabPill value={tab} onValueChange={setTab} />
              <div className="flex items-center gap-2">
                {selectedScheduleDay ? (
                  <button
                    type="button"
                    onClick={() => setSelectedScheduleDay(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-neutral-950 shadow-sm transition hover:bg-neutral-50"
                    aria-label="Back to calendar"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                ) : (
                  <ScheduleControls
                    calendarStart={calendarStart}
                    scheduleSize={scheduleSize}
                    onCalendarStartChange={setCalendarStart}
                    onScheduleSizeChange={setScheduleSize}
                  />
                )}
                <Link href="/rooms/create" className={cn(buttonVariants(), "h-9 rounded-full bg-neutral-950 px-4 text-white hover:bg-neutral-800")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create room
                </Link>
              </div>
            </div>

            <TabsContent value="calendar" className="m-0">
              {selectedScheduleDay ? (
                <DaySchedule rooms={rooms} day={selectedScheduleDay} />
              ) : (
                <RoomCalendar rooms={rooms} days={calendarDays} scheduleSize={scheduleSize} onSelectDay={setSelectedScheduleDay} />
              )}
            </TabsContent>

            <TabsContent value="setup" className="m-0">
              <RoomSetupBoard rooms={needsSetup} />
            </TabsContent>

            <TabsContent value="rooms" className="m-0 rounded-[22px] border bg-white/72">
              <RoomTable rooms={rooms} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <aside ref={asideRef} className={cn("grid min-h-0 gap-3 content-start", tab === "setup" && "overflow-hidden")}>
        <StatCard icon={<CalendarDays />} label="Scheduled" value={String(scheduledRooms.length)} />
        <StatCard icon={<Video />} label="Meeting now" value={String(activeRooms.length)} />
        <StatCard icon={<FileText />} label="Completed" value={String(endedRooms.length)} />
        <Card className="rounded-[24px] bg-white/88">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Simple create flow</CardTitle>
            <CardDescription>Create stays minimal. Room setup handles context, invite, transcript, schedule, and credit policy.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <Link href="/rooms/create" className={cn(buttonVariants({ variant: "outline" }), "w-full rounded-full bg-white")}>
              <Plus className="mr-2 h-4 w-4" />
              Create new room
            </Link>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function RoomTabPill({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  return (
    <div className="relative inline-flex rounded-full border bg-white/80 p-1 shadow-sm">
      {roomTabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "relative z-10 h-8 rounded-full px-4 text-sm font-medium transition-colors duration-300",
              active ? "text-white" : "text-neutral-500 hover:text-neutral-950"
            )}
          >
            {active ? (
              <motion.span
                layoutId="rooms-active-tab-pill"
                className="absolute inset-0 -z-10 rounded-full bg-neutral-950 shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.7 }}
              />
            ) : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function ScheduleControls({
  calendarStart,
  scheduleSize,
  onCalendarStartChange,
  onScheduleSizeChange,
}: {
  calendarStart: string;
  scheduleSize: ScheduleSize;
  onCalendarStartChange: (value: string) => void;
  onScheduleSizeChange: (value: ScheduleSize) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-neutral-950 shadow-sm transition hover:bg-neutral-50">
        <Settings2 className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 rounded-2xl bg-white p-4 shadow-xl">
        <div className="grid gap-4">
          <div>
            <p className="text-sm font-semibold text-neutral-950">Schedule display</p>
            <p className="text-xs text-neutral-500">Choose start date and visible schedule size.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="calendar-start">Start date</Label>
            <Input
              id="calendar-start"
              type="date"
              value={calendarStart}
              onChange={(event) => onCalendarStartChange(event.target.value)}
              className="bg-white"
            />
          </div>

          <div className="grid gap-2">
            <Label>Schedule size</Label>
            <div className="grid grid-cols-2 gap-2 rounded-full border bg-neutral-50 p-1">
              {[15, 30].map((size) => {
                const active = scheduleSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onScheduleSizeChange(size as ScheduleSize)}
                    className={cn(
                      "rounded-full px-3 py-2 text-sm font-medium transition",
                      active ? "bg-neutral-950 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-950"
                    )}
                  >
                    {size} cells
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RoomCalendar({
  rooms,
  days,
  scheduleSize,
  onSelectDay,
}: {
  rooms: TranslationRoomDto[];
  days: Date[];
  scheduleSize: ScheduleSize;
  onSelectDay: (day: Date) => void;
}) {
  const rowLength = scheduleSize === 15 ? 5 : 10;
  return (
    <div className={cn("grid gap-2", scheduleSize === 15 ? "grid-cols-1 sm:grid-cols-3 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-5 xl:grid-cols-10")}>
      {days.map((date, index) => {
        const dayRooms = rooms.filter((room) => roomDateKey(room) === date.toDateString());
        const visibleRooms = dayRooms.slice(0, 2);
        const rowStart = Math.floor(index / rowLength) * rowLength;
        const rowHasTwoMeetings = days
          .slice(rowStart, rowStart + rowLength)
          .some((rowDate) => rooms.filter((room) => roomDateKey(room) === rowDate.toDateString()).length >= 2);
        return (
          <div
            key={date.toISOString()}
            onClick={() => onSelectDay(date)}
            className={cn(
              "cursor-pointer rounded-2xl border bg-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:-translate-y-0.5 hover:shadow-md",
              scheduleSize === 15 ? "p-3" : "p-2",
              rowHasTwoMeetings ? (scheduleSize === 15 ? "min-h-[132px]" : "min-h-[104px]") : scheduleSize === 15 ? "min-h-[102px]" : "min-h-[76px]"
            )}
          >
            <div className="flex items-center justify-between">
              <p className={cn("font-medium text-neutral-950", scheduleSize === 15 ? "text-sm" : "text-[11px]")}>{shortDate(date)}</p>
              <Badge variant="outline" className="text-[10px]">{dayRooms.length}</Badge>
            </div>
            <div className={cn("space-y-1.5", scheduleSize === 15 ? "mt-3" : "mt-2")}>
              {visibleRooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/rooms/${room.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className={cn(
                    "block max-w-[136px] rounded-lg bg-neutral-950 text-white",
                    scheduleSize === 15 ? "px-2.5 py-1.5" : "px-2 py-1"
                  )}
                >
                  <p className={cn("truncate font-medium leading-tight", scheduleSize === 15 ? "text-[11px]" : "text-[10px]")}>{room.title}</p>
                  <p className={cn("mt-0.5 truncate leading-tight text-white/60", scheduleSize === 15 ? "text-[9px]" : "text-[8px]")}>{formatTime(room.scheduledAt ?? room.startedAt ?? room.createdAt)}</p>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function roomDateValue(room: TranslationRoomDto) {
  return room.scheduledAt ?? room.startedAt ?? room.endedAt ?? room.createdAt;
}

function sameCalendarDay(first: Date, second: Date) {
  return first.toDateString() === second.toDateString();
}

function DaySchedule({ rooms, day }: { rooms: TranslationRoomDto[]; day: Date }) {
  const dayRooms = rooms
    .filter((room) => sameCalendarDay(new Date(roomDateValue(room)), day))
    .sort((first, second) => new Date(roomDateValue(first)).getTime() - new Date(roomDateValue(second)).getTime());
  const hours = Array.from({ length: 24 }, (_, index) => index);

  return (
    <div className="overflow-hidden rounded-[24px] border bg-white/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-neutral-950">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "2-digit", year: "numeric" }).format(day)}
          </p>
          <p className="text-xs text-neutral-500">Daily schedule from 00:00 to 23:00</p>
        </div>
        <Badge variant="outline">{dayRooms.length} meetings</Badge>
      </div>

      <div className="max-h-[520px] overflow-y-auto">
        {hours.map((hour) => {
          const hourRooms = dayRooms.filter((room) => new Date(roomDateValue(room)).getHours() === hour);
          return (
            <div key={hour} className="grid min-h-[52px] grid-cols-[68px_minmax(0,1fr)] border-b last:border-b-0">
              <div className="border-r px-3 py-2 text-[11px] font-medium text-neutral-400">
                {String(hour).padStart(2, "0")}:00
              </div>
              <div className="grid gap-2 px-3 py-2">
                {hourRooms.map((room) => (
                  <Link
                    key={room.id}
                    href={`/rooms/${room.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-neutral-950 px-3 py-2 text-white shadow-sm transition hover:bg-neutral-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{room.title}</p>
                      <p className="mt-0.5 truncate text-[10px] text-white/60">{formatTime(roomDateValue(room))} - {formatLanguages(room)}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-white/15 bg-white/10 text-[10px] text-white">
                      {room.status.replace(/_/g, " ")}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoomSetupBoard({ rooms }: { rooms: TranslationRoomDto[] }) {
  const [languagePool, setLanguagePool] = useState<string[]>(["vi-VN", "en-US", "ja-JP"]);
  const [documents, setDocuments] = useState(defaultSetupDocuments);
  const [invitePresets, setInvitePresets] = useState(defaultInvitePresets);
  const [documentName, setDocumentName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const upcomingCount = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting").length;

  function addDocumentName() {
    const value = documentName.trim();
    if (!value || documents.includes(value)) return;
    setDocuments((current) => [...current, value]);
    setDocumentName("");
  }

  function addUploadedDocuments(files: FileList | null) {
    const names = Array.from(files ?? []).map((file) => file.name);
    if (names.length === 0) return;
    setDocuments((current) => Array.from(new Set([...current, ...names])));
  }

  function addInviteEmail() {
    const value = inviteEmail.trim();
    if (!value || invitePresets.includes(value)) return;
    setInvitePresets((current) => [...current, value]);
    setInviteEmail("");
  }

  return (
    <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.8fr)]">
      <div className="grid gap-3">
        <div className="rounded-[22px] border bg-white/84 p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-neutral-950">Workspace room setup</p>
              <p className="text-sm text-neutral-500">Define reusable languages, context files, and invite presets before creating rooms.</p>
            </div>
            <Badge variant="outline">{upcomingCount} upcoming rooms</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SetupOverview icon={<Languages />} label="Language pool" value={`${languagePool.length}/3 enabled`} />
            <SetupOverview icon={<FileText />} label="Document library" value={`${documents.length} files ready`} />
            <SetupOverview icon={<Mail />} label="Invite presets" value={`${invitePresets.length} emails saved`} />
          </div>
        </div>

        <div className="rounded-[22px] border bg-white/84 p-4 shadow-sm">
          <div className="grid gap-2">
            <Label>Languages available when creating rooms</Label>
            <LanguageToggles selected={languagePool} onChange={setLanguagePool} />
            <p className="text-xs text-neutral-500">Create room will only offer the languages enabled here.</p>
          </div>
        </div>

        <div className="rounded-[22px] border bg-white/84 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-neutral-950">Context document library</p>
              <p className="text-sm text-neutral-500">These files can be selected during create room.</p>
            </div>
            <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full bg-neutral-950 px-3 text-xs font-medium text-white">
              <UploadCloud className="h-3.5 w-3.5" />
              Upload
              <input type="file" multiple className="hidden" onChange={(event) => addUploadedDocuments(event.target.files)} />
            </label>
          </div>
          <div className="mb-3 flex gap-2">
            <Input value={documentName} onChange={(event) => setDocumentName(event.target.value)} placeholder="Add file name or context package" className="h-9 bg-white" />
            <button type="button" onClick={addDocumentName} className="h-9 rounded-full bg-neutral-950 px-4 text-sm font-medium text-white">Add</button>
          </div>
          <ChipList items={documents} onRemove={(item) => setDocuments((current) => current.filter((document) => document !== item))} emptyLabel="No context files yet" />
        </div>
      </div>

      <div className="grid content-start gap-3">
        <div className="rounded-[22px] border bg-white/84 p-4 shadow-sm">
          <p className="font-semibold text-neutral-950">Default invite presets</p>
          <p className="mb-3 text-sm text-neutral-500">Optional emails or groups available during room creation.</p>
          <div className="mb-3 flex gap-2">
            <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="group@company.com" className="h-9 bg-white" />
            <button type="button" onClick={addInviteEmail} className="h-9 rounded-full bg-neutral-950 px-4 text-sm font-medium text-white">Add</button>
          </div>
          <ChipList items={invitePresets} onRemove={(item) => setInvitePresets((current) => current.filter((email) => email !== item))} emptyLabel="No invite presets yet" />
        </div>

        <div className="rounded-[22px] border bg-white/84 p-4 shadow-sm">
          <p className="font-semibold text-neutral-950">Create room impact</p>
          <div className="mt-3 grid gap-2 text-sm text-neutral-600">
            <p><span className="font-medium text-neutral-950">{languagePool.length}</span> languages will be available in create room.</p>
            <p><span className="font-medium text-neutral-950">{documents.length}</span> context files can be selected.</p>
            <p><span className="font-medium text-neutral-950">{invitePresets.length}</span> invite presets can be reused.</p>
          </div>
          <Link href="/rooms/create" className={cn(buttonVariants(), "mt-4 h-9 w-full rounded-full bg-neutral-950 text-white hover:bg-neutral-800")}>
            Create room with setup
          </Link>
        </div>
      </div>
    </div>
  );
}

function LanguageToggles({ selected, onChange }: { selected: string[]; onChange: (languages: string[]) => void }) {
  function toggleLanguage(code: string) {
    if (selected.includes(code)) {
      onChange(selected.filter((item) => item !== code));
      return;
    }
    onChange([...selected, code]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {setupLanguages.map((language) => {
        const active = selected.includes(language.code);
        return (
          <button
            key={language.code}
            type="button"
            onClick={() => toggleLanguage(language.code)}
            className={cn(
              "rounded-full border px-3 py-2 text-sm font-medium transition",
              active ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-500 hover:text-neutral-950"
            )}
          >
            {language.label}
          </button>
        );
      })}
    </div>
  );
}

function SetupOverview({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-white/74 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="truncate text-sm font-semibold text-neutral-950">{value}</p>
      </div>
    </div>
  );
}

function ChipList({ items, onRemove, emptyLabel }: { items: string[]; onRemove: (item: string) => void; emptyLabel: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full bg-neutral-100 px-3 py-1.5 text-xs text-neutral-700">
          <Paperclip className="h-3 w-3 shrink-0 text-neutral-400" />
          <span className="truncate">{item}</span>
          <button type="button" onClick={() => onRemove(item)} className="text-neutral-400 hover:text-neutral-950">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {items.length === 0 ? <span className="rounded-full border border-dashed px-3 py-1.5 text-xs text-neutral-400">{emptyLabel}</span> : null}
    </div>
  );
}

function RoomTable({ rooms }: { rooms: TranslationRoomDto[] }) {
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead>Room</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Languages</TableHead>
          <TableHead>Time</TableHead>
          <TableHead className="text-right">Participants</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rooms.map((room) => (
          <TableRow key={room.id}>
            <TableCell>
              <Link href={`/rooms/${room.id}`} className="font-medium hover:underline">{room.title}</Link>
              <p className="text-xs text-neutral-500">{room.translationRoomCode}</p>
            </TableCell>
            <TableCell>
              <Badge className={cn("capitalize", statusStyles[room.status])} variant="outline">{room.status.replace(/_/g, " ")}</Badge>
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-2 text-neutral-500">
                <Languages className="h-3.5 w-3.5" />
                {formatLanguages(room)}
              </span>
            </TableCell>
            <TableCell className="text-neutral-500">{formatTime(room.scheduledAt ?? room.startedAt ?? room.endedAt ?? room.createdAt)}</TableCell>
            <TableCell className="text-right">{room.participantCount ?? 0}/{room.maxParticipants}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="rounded-[24px] bg-white/88">
      <CardContent className="p-4">
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
        <p className="text-sm text-neutral-500">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
