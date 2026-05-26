"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, Clock3, Globe2, LayoutGrid, Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    translationRoomType: "instant",
    maxParticipants: 24,
    sourceLanguage: "en-US",
    targetLanguages: ["vi-VN", "ja-JP"],
    startedAt: new Date().toISOString(),
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
    translationRoomType: "group",
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
    translationRoomType: "group",
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
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  waiting: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-muted text-muted-foreground border-border",
  ended: "bg-secondary text-secondary-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  expired: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};

function languageName(code?: string) {
  const labels: Record<string, string> = {
    "en-US": "English",
    "vi-VN": "Vietnamese",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
  };
  return labels[code ?? ""] ?? code ?? "Unknown";
}

function formatDate(value?: string) {
  if (!value) return "No schedule";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRoomTime(room: TranslationRoomDto) {
  return room.scheduledAt ?? room.startedAt ?? room.endedAt ?? room.createdAt;
}

function formatLanguages(room: TranslationRoomDto) {
  return `${languageName(room.sourceLanguage)} -> ${room.targetLanguages.map(languageName).join(", ")}`;
}

function matchesStatus(room: TranslationRoomDto, tab: string) {
  if (tab === "all") return true;
  if (tab === "upcoming") return room.status === "scheduled" || room.status === "waiting";
  if (tab === "active") return room.status === "in_progress" || room.status === "paused";
  if (tab === "completed") return room.status === "ended" || room.status === "cancelled";
  return true;
}

export default function RoomsPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const roomList = useTranslationRooms({ pageSize: 100 });

  const rooms = useMemo(() => {
    const apiRooms = roomList.data?.rooms ?? [];
    return apiRooms.length > 0 ? apiRooms : demoRooms;
  }, [roomList.data?.rooms]);

  const filteredRooms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rooms.filter((room) => {
      const matchesQuery =
        !needle ||
        [room.title, room.description, room.translationRoomCode, room.status, room.sourceLanguage, ...room.targetLanguages]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return matchesQuery && matchesStatus(room, tab);
    });
  }, [query, rooms, tab]);

  const activeCount = rooms.filter((room) => room.status === "in_progress" || room.status === "paused").length;
  const upcomingCount = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting").length;
  const participantCount = rooms.reduce((total, room) => total + (room.participantCount ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <LayoutGrid className="h-3.5 w-3.5 text-primary" />
            Rooms
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Room operations</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Shadcn-style room list with preview data while backend room APIs are unavailable.
          </p>
        </div>
        <Link href="/rooms/create" className={cn(buttonVariants(), "h-9")}>
          <Plus className="mr-2 h-4 w-4" />
          Create room
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={<CalendarClock />} label="Upcoming" value={String(upcomingCount)} detail="Scheduled or waiting" />
        <StatCard icon={<Users />} label="Participants" value={String(participantCount)} detail="Across visible rooms" />
        <StatCard icon={<Clock3 />} label="Active" value={String(activeCount)} detail="Live or paused now" />
      </section>

      <Card className="shadow-sm">
        <CardHeader className="gap-4 border-b lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Translation rooms</CardTitle>
            <CardDescription>Filter, scan, and open room workspaces.</CardDescription>
          </div>
          <CardAction className="static col-auto row-auto self-auto justify-self-auto">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search rooms..."
                  className="h-8 w-full pl-8 sm:w-[260px]"
                />
              </div>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Room</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Languages</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right pr-4">Participants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="pl-4">
                    <Link href={`/room/${room.id}`} className="group block">
                      <div className="font-medium group-hover:text-primary">{room.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{room.translationRoomCode}</div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("capitalize", statusStyles[room.status])} variant="outline">
                      {room.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe2 className="h-4 w-4" />
                      <span className="max-w-[220px] truncate">{formatLanguages(room)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(getRoomTime(room))}</TableCell>
                  <TableCell className="text-right pr-4">
                    {room.participantCount ?? 0}/{room.maxParticipants}
                  </TableCell>
                </TableRow>
              ))}
              {filteredRooms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No rooms match your filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
