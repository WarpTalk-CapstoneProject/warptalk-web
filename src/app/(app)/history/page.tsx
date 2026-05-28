"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Archive, Download, FileText, Languages, Search, Timer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoomHistory } from "@/hooks/use-room-history";
import { cn } from "@/lib/utils";

const demoHistory = [
  {
    id: "hist-001",
    title: "Board Review Translation",
    code: "BORD-778",
    endedAt: "Today, 10:24 AM",
    duration: "46m",
    participants: 14,
    languages: "English -> Vietnamese, Japanese",
    status: "ready",
    artifacts: ["Transcript TXT", "AI summary", "Participant CSV", "Recording"],
    summary: "Reviewed investor questions, translation accuracy, and rollout risks.",
  },
  {
    id: "hist-002",
    title: "Product Demo Follow-up",
    code: "DEMO-514",
    endedAt: "Yesterday, 4:12 PM",
    duration: "32m",
    participants: 8,
    languages: "Vietnamese -> English",
    status: "ready",
    artifacts: ["Transcript PDF", "AI summary", "Action items"],
    summary: "Captured follow-up questions about onboarding and support coverage.",
  },
  {
    id: "hist-003",
    title: "Legal Review Session",
    code: "LEGL-307",
    endedAt: "May 22, 2:00 PM",
    duration: "58m",
    participants: 11,
    languages: "English -> Korean, Vietnamese",
    status: "processing",
    artifacts: ["Transcript processing", "Summary queued"],
    summary: "Legal terms and approval requirements were discussed across regions.",
  },
];

const transcriptPreview = [
  {
    time: "00:42",
    speaker: "Host",
    text: "Welcome everyone. Today's review will focus on product milestones and next steps.",
    translation: "Chao moi nguoi. Buoi danh gia hom nay tap trung vao cac moc san pham va buoc tiep theo.",
  },
  {
    time: "07:18",
    speaker: "Guest",
    text: "Can we clarify how terminology is handled for regulated documents?",
    translation: "Chung ta co the lam ro cach xu ly thuat ngu cho tai lieu duoc quan ly khong?",
  },
  {
    time: "19:04",
    speaker: "Interpreter",
    text: "The glossary is applied before final transcript export.",
    translation: "Bang thuat ngu duoc ap dung truoc khi xuat ban ghi cuoi cung.",
  },
];

function normalizeStatus(status: string) {
  return status.replace(/_/g, " ");
}

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(demoHistory[0].id);
  const history = useRoomHistory();

  const historyRows = useMemo(() => {
    const apiRows =
      history.data?.rooms.map((room) => ({
        id: room.id,
        title: room.title,
        code: room.translationRoomCode,
        endedAt: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
          new Date(room.endedAt)
        ),
        duration: `${Math.round(room.durationSeconds / 60)}m`,
        participants: room.participantCount,
        languages: `${room.sourceLanguage} -> ${room.targetLanguages.join(", ")}`,
        status: room.artifacts.some((artifact) => artifact.status === "processing") ? "processing" : "ready",
        artifacts: room.artifacts.map((artifact) => artifact.title),
        summary: room.summary?.summary ?? room.description ?? "No AI summary is attached to this room yet.",
      })) ?? [];

    return apiRows.length > 0 ? apiRows : demoHistory;
  }, [history.data?.rooms]);

  const filteredRows = historyRows.filter((room) =>
    [room.title, room.code, room.languages].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const selectedRoom = filteredRows.find((room) => room.id === selectedId) ?? filteredRows[0] ?? historyRows[0];

  return (
    <div className="flex flex-col gap-2.5">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-1.5 inline-flex h-6 items-center gap-2 rounded-md border bg-background px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Archive className="h-3.5 w-3.5 text-primary" />
            History
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white xl:text-2xl">History & Transcripts</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Review completed translation rooms, transcript previews, AI summaries, and retained artifacts.
          </p>
        </div>
        <div className="relative w-full lg:w-[280px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search history..." className="pl-8" />
        </div>
      </section>

      <section className="grid gap-2.5 md:grid-cols-3">
        <StatCard icon={<FileText />} label="Transcript exports" value="12" />
        <StatCard icon={<Timer />} label="Translated time" value="136m" />
        <StatCard icon={<Users />} label="Participants" value="33" />
      </section>

      <div className="grid gap-2.5 xl:grid-cols-[310px_minmax(0,1fr)]">
        <Card className="shadow-sm" size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Ended rooms</CardTitle>
            <CardDescription className="text-xs">{filteredRows.length} retained sessions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {filteredRows.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedId(room.id)}
                className={cn(
                  "w-full rounded-lg border bg-background p-2.5 text-left transition hover:bg-muted/50",
                  selectedRoom?.id === room.id && "border-primary ring-2 ring-primary/15"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="truncate text-sm font-medium">{room.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{room.endedAt}</p>
                  </div>
                  <Badge variant={room.status === "ready" ? "default" : "secondary"}>{normalizeStatus(room.status)}</Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{room.languages}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm" size="sm">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-sm">{selectedRoom.title}</CardTitle>
                <CardDescription className="text-xs">{selectedRoom.summary}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selectedRoom.code}</Badge>
                <Badge variant="secondary">{selectedRoom.duration}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <Tabs defaultValue="transcript">
              <TabsList>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
                <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
                <TabsTrigger value="participants">Details</TabsTrigger>
              </TabsList>
              <TabsContent value="transcript" className="mt-3 space-y-2">
                {transcriptPreview.map((item) => (
                  <div key={`${item.time}-${item.speaker}`} className="rounded-lg border bg-background p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{item.time}</Badge>
                      <span>{item.speaker}</span>
                    </div>
                    <p className="text-sm">{item.text}</p>
                    <p className="mt-2 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">{item.translation}</p>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="artifacts" className="mt-3 grid gap-2.5 md:grid-cols-2">
                {selectedRoom.artifacts.map((artifact) => (
                  <div key={artifact} className="flex items-center justify-between rounded-lg border bg-background p-2.5">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{artifact}</span>
                    </div>
                    <Button size="icon-sm" variant="ghost" title="Download">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="participants" className="mt-3 grid gap-2.5 md:grid-cols-3">
                <Detail icon={<Users />} label="Participants" value={String(selectedRoom.participants)} />
                <Detail icon={<Languages />} label="Languages" value={selectedRoom.languages} />
                <Detail icon={<Timer />} label="Duration" value={selectedRoom.duration} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="min-h-[82px] shadow-sm" size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2 text-xs">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
