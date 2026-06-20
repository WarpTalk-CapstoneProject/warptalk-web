"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Download, FileText, Translate, MagnifyingGlass, Timer, Users } from "@phosphor-icons/react/dist/ssr";
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
import { useMeetingHistory, useMeetingRoomDetail } from "@/hooks/use-meeting-history";
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
];

function normalizeStatus(status: string) {
  return status.replace(/_/g, " ");
}

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useMeetingHistory(1, 50, query);

  const historyRows = useMemo(() => {
    const apiRows =
      history.data?.items?.map((room: any) => ({
        id: room.id,
        title: room.title || "Meeting",
        code: room.translationRoomCode || "N/A",
        endedAt: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
          new Date(room.endedAt || room.createdAt)
        ),
        duration: room.durationSeconds ? `${Math.round(room.durationSeconds / 60)}m` : "Unknown",
        participants: room.participantCount,
        languages: room.languageMode || "N/A",
        status: room.status === "FINISHED" ? "ready" : room.status.toLowerCase(),
        artifacts: ["Transcript TXT", "AI summary"],
        summary: room.summary || "No AI summary is attached to this room yet.",
      })) ?? [];

    return apiRows.length > 0 ? apiRows : demoHistory;
  }, [history.data?.items]);

  const selectedRoomId = selectedId || (historyRows.length > 0 ? historyRows[0].id : undefined);
  const selectedRoom = historyRows.find((room: any) => room.id === selectedRoomId) ?? historyRows[0];
  const { data: detailData } = useMeetingRoomDetail(selectedRoomId && selectedRoomId !== "hist-001" ? selectedRoomId : undefined);

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-6 text-ink">
      <section className="flex justify-end">
        <div className="relative w-full lg:w-[280px]">
          <MagnifyingGlass weight="light" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="MagnifyingGlass history..." className="pl-8" />
        </div>
      </section>

      <section className="grid gap-2.5 md:grid-cols-3">
        <StatCard icon={<FileText weight="light" />} label="Transcript exports" value="12" />
        <StatCard icon={<Timer weight="light" />} label="Translated time" value="136m" />
        <StatCard icon={<Users weight="light" />} label="Participants" value="33" />
      </section>

      <div className="grid gap-2.5 xl:grid-cols-[310px_minmax(0,1fr)]">
        <Card className="shadow-sm" size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Ended rooms</CardTitle>
            <CardDescription className="text-xs">{historyRows.length} retained sessions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {historyRows.map((room: any) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedId(room.id)}
                className={cn(
                  "w-full rounded-lg border  p-2.5 text-left transition hover:bg-muted/50",
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
                {detailData?.recentMessages && detailData.recentMessages.length > 0 ? (
                  detailData.recentMessages.map((item: any) => (
                    <div key={item.id} className="rounded-lg border  p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</Badge>
                        <span>{item.senderName || "Unknown"}</span>
                      </div>
                      <p className="text-sm">{item.originalText}</p>
                      {item.translatedText && (
                        <p className="mt-2 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">{item.translatedText}</p>
                      )}
                    </div>
                  ))
                ) : (
                  transcriptPreview.map((item: any) => (
                    <div key={`${item.time}-${item.speaker}`} className="rounded-lg border  p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{item.time}</Badge>
                        <span>{item.speaker}</span>
                      </div>
                      <p className="text-sm">{item.text}</p>
                      <p className="mt-2 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">{item.translation}</p>
                    </div>
                  ))
                )}
              </TabsContent>
              <TabsContent value="artifacts" className="mt-3 grid gap-2.5 md:grid-cols-2">
                {selectedRoom.artifacts.map((artifact: any) => (
                  <div key={artifact} className="flex items-center justify-between rounded-lg border  p-2.5">
                    <div className="flex items-center gap-2">
                      <FileText weight="light" className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{artifact}</span>
                    </div>
                    <Button size="icon-sm" variant="ghost" title="Download">
                      <Download weight="light" className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="participants" className="mt-3 grid gap-2.5 md:grid-cols-3">
                <Detail icon={<Users weight="light" />} label="Participants" value={String(selectedRoom.participants)} />
                <Detail icon={<Translate weight="light" />} label="Translate" value={selectedRoom.languages} />
                <Detail icon={<Timer weight="light" />} label="Duration" value={selectedRoom.duration} />
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
    <div className="rounded-lg border  p-3">
      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
