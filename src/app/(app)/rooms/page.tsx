"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { CalendarDays, FileText, Languages, Mail, Plus, UploadCloud, Video, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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

const calendarDays = Array.from({ length: 14 }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() + index);
  return date;
});

const roomTabs = [
  { value: "calendar", label: "Calendar" },
  { value: "setup", label: "Setup" },
  { value: "rooms", label: "Rooms" },
];

const setupStartPreview = "2026-06-04T10:00";

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

export default function RoomsPage() {
  const [tab, setTab] = useState("calendar");
  const roomList = useTranslationRooms({ pageSize: 100 });

  const rooms = useMemo(() => {
    const apiRooms = roomList.data?.rooms ?? [];
    return apiRooms.length > 0 ? apiRooms : demoRooms;
  }, [roomList.data?.rooms]);

  const scheduledRooms = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting");
  const activeRooms = rooms.filter((room) => room.status === "in_progress" || room.status === "paused");
  const endedRooms = rooms.filter((room) => room.status === "ended" || room.status === "cancelled");
  const needsSetup = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting");

  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_292px]">
      <Card className="min-h-0 overflow-hidden rounded-[28px] bg-white/88 shadow-sm">
        <CardContent className="h-full p-3">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <RoomTabPill value={tab} onValueChange={setTab} />
              <Link href="/rooms/create" className={cn(buttonVariants(), "h-9 rounded-full bg-neutral-950 px-4 text-white hover:bg-neutral-800")}>
                <Plus className="mr-2 h-4 w-4" />
                Create room
              </Link>
            </div>

            <TabsContent value="calendar" className="m-0">
              <RoomCalendar rooms={rooms} />
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

      <aside className="grid min-h-0 gap-3 content-start">
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

function RoomCalendar({ rooms }: { rooms: TranslationRoomDto[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {calendarDays.map((date) => {
        const dayRooms = rooms.filter((room) => roomDateKey(room) === date.toDateString());
        return (
          <div key={date.toISOString()} className="min-h-[126px] rounded-2xl border bg-white/82 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-950">{shortDate(date)}</p>
              <Badge variant="outline" className="text-[10px]">{dayRooms.length}</Badge>
            </div>
            <div className="space-y-2">
              {dayRooms.slice(0, 2).map((room) => (
                <Link key={room.id} href={`/rooms/${room.id}`} className="block rounded-xl bg-neutral-950 p-2 text-white">
                  <p className="truncate text-xs font-medium">{room.title}</p>
                  <p className="mt-1 text-[10px] text-white/60">{formatTime(room.scheduledAt ?? room.startedAt ?? room.createdAt)}</p>
                </Link>
              ))}
              {dayRooms.length === 0 ? <p className="pt-6 text-center text-xs text-neutral-400">No meeting</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoomSetupBoard({ rooms }: { rooms: TranslationRoomDto[] }) {
  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_310px]">
      <div className="grid gap-3">
        {rooms.map((room) => (
          <div key={room.id} className="rounded-[22px] border bg-white/82 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-950">{room.title}</p>
                <p className="text-sm text-neutral-500">{room.translationRoomCode} - {formatLanguages(room)}</p>
              </div>
              <Badge className={cn("capitalize", statusStyles[room.status])} variant="outline">{room.status.replace(/_/g, " ")}</Badge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SetupMetric icon={<UploadCloud />} label="Context files" value={room.id === "preview-partner-sync" ? "2 uploaded" : "Add files"} />
              <SetupMetric icon={<Languages />} label="Transcript" value={languageName(room.sourceLanguage)} />
              <SetupMetric icon={<Mail />} label="Invites" value={room.id === "preview-partner-sync" ? "7 emails" : "Draft"} />
              <SetupMetric icon={<WalletCards />} label="Credit limit" value={room.maxParticipants >= 20 ? "180 min" : "90 min"} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_170px]">
              <div className="rounded-2xl border bg-white/76 p-3">
                <p className="text-xs font-medium text-neutral-500">Meeting context</p>
                <p className="mt-1 line-clamp-2 text-sm text-neutral-700">{room.description}</p>
              </div>
              <div className="grid gap-2">
                <Link href={`/rooms/${room.id}`} className={cn(buttonVariants({ variant: "outline" }), "h-8 rounded-full bg-white")}>Room detail</Link>
                <Link href={`/rooms/${room.id}/setup`} className={cn(buttonVariants({ variant: "outline" }), "h-8 rounded-full bg-white text-xs")}>
                  Device preflight
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card className="rounded-[22px] bg-white/82">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Room setup template</CardTitle>
          <CardDescription>Preview controls for the setup data that belongs to a scheduled room.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-2">
          <div className="grid gap-2">
            <Label htmlFor="setup-context">Context files / notes</Label>
            <Textarea id="setup-context" className="min-h-20 bg-white" defaultValue="Upload agenda, glossary, speaker names, product terms, and meeting notes before the room starts." />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="setup-invites">Invite emails</Label>
            <Input id="setup-invites" className="bg-white" defaultValue="investor@client.com, interpreter@warptalk.ai" />
          </div>
          <div className="grid gap-2">
            <Label>Main transcript language</Label>
            <Select defaultValue="en-US">
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">English</SelectItem>
                <SelectItem value="vi-VN">Vietnamese</SelectItem>
                <SelectItem value="ja-JP">Japanese</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="setup-start">Start time</Label>
            <Input id="setup-start" type="datetime-local" className="bg-white" defaultValue={setupStartPreview} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="setup-credit">Credit limit</Label>
            <Input id="setup-credit" className="bg-white" defaultValue="180 translation minutes" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SetupMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white/76 p-3">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="truncate text-sm font-medium text-neutral-950">{value}</p>
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
