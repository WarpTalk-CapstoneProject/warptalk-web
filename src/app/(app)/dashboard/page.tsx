"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Languages,
  LayoutGrid,
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { MeetingActions } from "./components/meeting-actions";
import { useRoomHistory } from "@/hooks/use-room-history";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { cn } from "@/lib/utils";
import type { TranslationRoomDto } from "@/types/translationRoom";

const demoRooms: TranslationRoomDto[] = [
  {
    id: "preview-investor-qa",
    workspaceId: "preview",
    hostId: "host",
    title: "Investor Q&A Translation",
    description: "English to Vietnamese live room for product due diligence.",
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
];

const demoHistory = [
  {
    id: "ended-board-review",
    title: "Board Review Translation",
    endedAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
    durationSeconds: 46 * 60,
    participantCount: 14,
    artifacts: 4,
    languages: "English -> Vietnamese, Japanese",
  },
  {
    id: "ended-product-demo",
    title: "Product Demo Follow-up",
    endedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    durationSeconds: 32 * 60,
    participantCount: 8,
    artifacts: 3,
    languages: "Vietnamese -> English",
  },
  {
    id: "ended-legal-review",
    title: "Legal Review Session",
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    durationSeconds: 58 * 60,
    participantCount: 11,
    artifacts: 5,
    languages: "English -> Korean, Vietnamese",
  },
];

const workloadData = [
  { day: "Mon", live: 5, completed: 8 },
  { day: "Tue", live: 7, completed: 11 },
  { day: "Wed", live: 9, completed: 13 },
  { day: "Thu", live: 6, completed: 10 },
  { day: "Fri", live: 11, completed: 15 },
  { day: "Sat", live: 4, completed: 7 },
  { day: "Sun", live: 3, completed: 6 },
];

const languageMix = [
  { label: "Vietnamese", value: 42, color: "bg-primary" },
  { label: "English", value: 28, color: "bg-sky-500" },
  { label: "Japanese", value: 18, color: "bg-emerald-500" },
  { label: "Korean", value: 12, color: "bg-amber-500" },
];

function formatDateTime(value?: string) {
  if (!value) return "No schedule";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getRoomTime(room: TranslationRoomDto) {
  return room.scheduledAt ?? room.startedAt ?? room.createdAt;
}

function getLanguageLabel(code?: string) {
  const labels: Record<string, string> = {
    "en-US": "English",
    "vi-VN": "Vietnamese",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
  };

  return labels[code ?? ""] ?? code ?? "Unknown";
}

function formatLanguages(room: Pick<TranslationRoomDto, "sourceLanguage" | "targetLanguages">) {
  const source = getLanguageLabel(room.sourceLanguage);
  const targets = room.targetLanguages.map(getLanguageLabel).join(", ");

  return `${source} -> ${targets || "No target"}`;
}

export default function DashboardPage() {
  const roomList = useTranslationRooms({ pageSize: 100 });
  const history = useRoomHistory();

  const rooms = useMemo(() => {
    const apiRooms = roomList.data?.rooms ?? [];
    return apiRooms.length > 0 ? apiRooms : demoRooms;
  }, [roomList.data?.rooms]);

  const historyRows = useMemo(() => {
    const apiHistory =
      history.data?.rooms.map((room) => ({
        id: room.id,
        title: room.title,
        endedAt: room.endedAt,
        durationSeconds: room.durationSeconds,
        participantCount: room.participantCount,
        artifacts: room.artifacts.length,
        languages: `${getLanguageLabel(room.sourceLanguage)} -> ${room.targetLanguages.map(getLanguageLabel).join(", ")}`,
      })) ?? [];

    return apiHistory.length > 0 ? apiHistory : demoHistory;
  }, [history.data?.rooms]);

  const activeRooms = rooms.filter((room) => room.status === "in_progress" || room.status === "paused");
  const upcomingRooms = rooms.filter((room) => room.status === "scheduled" || room.status === "waiting");
  const completedRooms = historyRows.length;
  const totalParticipants =
    rooms.reduce((total, room) => total + (room.participantCount ?? 0), 0) +
    historyRows.reduce((total, room) => total + room.participantCount, 0);
  const translatedMinutes = Math.round(historyRows.reduce((total, room) => total + room.durationSeconds, 0) / 60);
  const readyArtifacts = historyRows.reduce((total, room) => total + room.artifacts, 0);
  const maxWorkload = Math.max(...workloadData.map((item) => item.live + item.completed));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Shadcn dashboard preview
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">WarpTalk Dashboard</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Monitor live translation rooms, upcoming sessions, retained artifacts, and AI follow-up activity.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/rooms/create" className={cn(buttonVariants(), "h-9")}>
            <Video className="mr-2 h-4 w-4" />
            Create room
          </Link>
          <Link href="/history" className={cn(buttonVariants({ variant: "outline" }), "h-9 bg-background")}>
            <FileText className="mr-2 h-4 w-4" />
            View history
          </Link>
        </div>
      </section>

      <section className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:bg-gradient-to-t grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<LayoutGrid className="h-4 w-4" />}
          title="Total rooms"
          value={String(rooms.length + completedRooms)}
          change="+18.2%"
          trend="up"
          footer={`${upcomingRooms.length} upcoming sessions`}
          subfooter="Preview data is shown until backend APIs are connected"
        />
        <MetricCard
          icon={<Radio className="h-4 w-4" />}
          title="Live sessions"
          value={String(activeRooms.length)}
          change="+7.4%"
          trend="up"
          footer="Live operations are active"
          subfooter="Includes in-progress and paused translation rooms"
        />
        <MetricCard
          icon={<Users className="h-4 w-4" />}
          title="Participants"
          value={String(totalParticipants)}
          change="+12.8%"
          trend="up"
          footer="Healthy audience coverage"
          subfooter="Current room counts plus ended-session history"
        />
        <MetricCard
          icon={<Clock3 className="h-4 w-4" />}
          title="Translated time"
          value={`${translatedMinutes}m`}
          change="-3.1%"
          trend="down"
          footer={`${readyArtifacts} retained artifacts`}
          subfooter="Transcript exports, summaries, and recordings"
        />
      </section>

      <MeetingActions />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b">
            <div>
              <CardTitle>Room workload</CardTitle>
              <CardDescription>Live and completed room volume this week</CardDescription>
            </div>
            <CardAction>
              <Badge variant="outline">
                <Activity className="h-3.5 w-3.5" />
                Demo data
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex h-[300px] items-end gap-3 rounded-lg border bg-muted/30 p-4">
              {workloadData.map((item) => {
                const liveHeight = Math.max(12, Math.round((item.live / maxWorkload) * 100));
                const completedHeight = Math.max(12, Math.round((item.completed / maxWorkload) * 100));

                return (
                  <div key={item.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-[210px] w-full max-w-16 items-end justify-center gap-1 rounded-md bg-background p-2 ring-1 ring-border">
                      <div className="w-3 rounded-md bg-primary" style={{ height: `${liveHeight}%` }} />
                      <div className="w-3 rounded-md bg-muted-foreground/30" style={{ height: `${completedHeight}%` }} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{item.day}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                Live rooms
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
                Completed rooms
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="border-b">
            <CardTitle>Language mix</CardTitle>
            <CardDescription>Top translated languages by session share</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {languageMix.map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">{item.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
          <CardFooter className="justify-between text-sm">
            <span className="text-muted-foreground">Based on preview sessions</span>
            <Link href="/rooms" className="inline-flex items-center font-medium text-primary">
              Rooms
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardFooter>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="border-b">
            <CardTitle>Recent sessions</CardTitle>
            <CardDescription>Latest live and scheduled translation rooms</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {rooms.slice(0, 4).map((room) => (
              <SessionRow
                key={room.id}
                href={`/room/${room.id}`}
                title={room.title}
                subtitle={formatLanguages(room)}
                meta={room.translationRoomCode}
                time={formatDateTime(getRoomTime(room))}
                badge={room.status.replace(/_/g, " ")}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="border-b">
            <CardTitle>Artifacts & history</CardTitle>
            <CardDescription>Completed rooms with retained outputs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {historyRows.map((room) => (
              <SessionRow
                key={room.id}
                href="/history"
                title={room.title}
                subtitle={room.languages}
                meta={`${room.artifacts} artifacts`}
                time={formatDateTime(room.endedAt)}
                badge={formatDuration(room.durationSeconds)}
              />
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FocusCard icon={<CalendarClock />} title="Upcoming" value={String(upcomingRooms.length)} description="Scheduled or waiting rooms" />
        <FocusCard icon={<CheckCircle2 />} title="Completed" value={String(completedRooms)} description="Ended sessions ready for review" />
        <FocusCard icon={<Languages />} title="Languages" value="4" description="Languages represented in preview data" />
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  change,
  trend,
  footer,
  subfooter,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  footer: string;
  subfooter: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : TrendingDown;

  return (
    <Card className="@container/card shadow-sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
          {title}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        <CardAction>
          <Badge variant="outline">
            <TrendIcon className="h-3.5 w-3.5" />
            {change}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          {footer} <TrendIcon className="size-4" />
        </div>
        <div className="text-muted-foreground">{subfooter}</div>
      </CardFooter>
    </Card>
  );
}

function SessionRow({
  href,
  title,
  subtitle,
  meta,
  time,
  badge,
}: {
  href: string;
  title: string;
  subtitle: string;
  meta: string;
  time: string;
  badge: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-lg border bg-background p-3 transition hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          <Badge variant="secondary">{badge}</Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-xs font-medium text-foreground">{meta}</p>
        <p className="mt-1 text-xs text-muted-foreground">{time}</p>
      </div>
    </Link>
  );
}

function FocusCard({
  icon,
  title,
  value,
  description,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
          {title}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
