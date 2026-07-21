"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { Download, FileText, Translate, MagnifyingGlass, Timer, Users } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMeetingHistory, useMeetingRoomDetail } from "@/hooks/use-meeting-history";
import { cn } from "@/lib/utils";

type HistoryRow = {
  id: string;
  title: string;
  code: string;
  endedAt: string;
  duration: string;
  participants: number;
  languages: string;
  status: string;
  artifacts: string[];
  summary: string;
};

type TranscriptPreview = {
  time: string;
  speaker: string;
  text: string;
  translation: string;
};

const demoHistory: HistoryRow[] = [
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

const transcriptPreview: TranscriptPreview[] = [
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
  const [activeTab, setActiveTab] = useState("transcript");
  const history = useMeetingHistory(1, 50, query);

  const historyRows = useMemo(() => {
    const apiRows =
      history.data?.items?.map((room): HistoryRow => ({
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
  const selectedRoom = historyRows.find((room) => room.id === selectedRoomId) ?? historyRows[0];
  const { data: detailData } = useMeetingRoomDetail(selectedRoomId && !selectedRoomId.startsWith("hist-") ? selectedRoomId : undefined);

  const totalMinutes = historyRows.reduce((total, room) => total + (Number.parseInt(room.duration, 10) || 0), 0);
  const totalParticipants = historyRows.reduce((total, room) => total + room.participants, 0);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas px-4 py-4 text-ink sm:px-5">
      <div className="mb-4 flex shrink-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-ink-muted">
            <Timer size={14} weight="fill" className="text-primary" />
            Meeting archive
          </div>
          <h1 className="text-[24px] font-semibold leading-8">History</h1>
          <p className="mt-1 text-[12px] text-ink-muted">Revisit translated conversations and download retained artifacts.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4 text-[11px]">
            <InlineStat label="Sessions" value={String(historyRows.length)} />
            <InlineStat label="Translated" value={`${totalMinutes}m`} />
            <InlineStat label="Participants" value={String(totalParticipants)} />
          </div>
          <div className="relative min-w-0 sm:w-[280px]">
            <MagnifyingGlass weight="light" className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search history" className="h-8 rounded-md bg-surface-1 pl-8 text-xs shadow-none" />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.03)] xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border xl:border-b-0 xl:border-r">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
            <div>
              <p className="text-[12px] font-semibold">Ended sessions</p>
              <p className="text-[10px] text-ink-muted">{historyRows.length} retained</p>
            </div>
            <FileText size={16} weight="light" className="text-ink-subtle" />
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {historyRows.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedId(room.id)}
                className={cn(
                  "w-full rounded-md px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-ring/30",
                  selectedRoom?.id === room.id && "bg-surface-2"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("size-1.5 shrink-0 rounded-full", room.status === "ready" ? "bg-emerald-500" : "bg-amber-400")} />
                  <p className="min-w-0 flex-1 truncate text-[12px] font-medium">{room.title}</p>
                  <span className="text-[10px] text-ink-subtle">{room.duration}</span>
                </div>
                <p className="mt-1 truncate pl-3.5 text-[10px] text-ink-muted">{room.endedAt}</p>
                <p className="mt-1 truncate pl-3.5 text-[10px] text-ink-subtle">{room.languages}</p>
              </button>
            ))}
            {historyRows.length === 0 ? <HistoryEmptyState title="No meeting history" /> : null}
          </div>
        </aside>

        {selectedRoom ? (
          <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <div className="border-b border-border px-4 pt-3">
              <div className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[14px] font-semibold">{selectedRoom.title}</h2>
                    <Badge variant={selectedRoom.status === "ready" ? "default" : "secondary"} className="rounded-md text-[10px]">{normalizeStatus(selectedRoom.status)}</Badge>
                  </div>
                  <p className="mt-1 max-w-[680px] text-[11px] leading-4 text-ink-muted">{selectedRoom.summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline" className="rounded-md text-[10px]">{selectedRoom.code}</Badge>
                  <Badge variant="secondary" className="rounded-md text-[10px]">{selectedRoom.duration}</Badge>
                </div>
              </div>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0">
                <TabsList className="h-8 rounded-md bg-surface-2 p-0.5">
                  <TabsTrigger value="transcript" className="h-7 rounded-sm px-3 text-[11px]">Transcript</TabsTrigger>
                  <TabsTrigger value="artifacts" className="h-7 rounded-sm px-3 text-[11px]">Artifacts</TabsTrigger>
                  <TabsTrigger value="participants" className="h-7 rounded-sm px-3 text-[11px]">Details</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 overflow-y-auto p-4">
              <TabsContent value="transcript" className="mt-0 space-y-2">
                {detailData?.recentMessages && detailData.recentMessages.length > 0 ? (
                  detailData.recentMessages.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</Badge>
                        <span>{item.senderName || "Unknown"}</span>
                      </div>
                      <p className="text-sm">{item.originalText}</p>
                      {item.translatedText && (
                        <p className="mt-2 rounded-md bg-surface-2 p-2.5 text-xs text-ink-muted">{item.translatedText}</p>
                      )}
                    </div>
                  ))
                ) : (
                  transcriptPreview.map((item) => (
                    <div key={`${item.time}-${item.speaker}`} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{item.time}</Badge>
                        <span>{item.speaker}</span>
                      </div>
                      <p className="text-sm">{item.text}</p>
                      <p className="mt-2 rounded-md bg-surface-2 p-2.5 text-xs text-ink-muted">{item.translation}</p>
                    </div>
                  ))
                )}
              </TabsContent>
              <TabsContent value="artifacts" className="mt-0 grid gap-2 md:grid-cols-2">
                {selectedRoom.artifacts.map((artifact) => (
                  <div key={artifact} className="flex items-center justify-between rounded-lg border border-border p-2.5">
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
              <TabsContent value="participants" className="mt-0 grid gap-2 md:grid-cols-3">
                <Detail icon={<Users weight="light" />} label="Participants" value={String(selectedRoom.participants)} />
                <Detail icon={<Translate weight="light" />} label="Translate" value={selectedRoom.languages} />
                <Detail icon={<Timer weight="light" />} label="Duration" value={selectedRoom.duration} />
              </TabsContent>
            </Tabs>
          </main>
        ) : (
          <HistoryEmptyState title="Select a meeting" />
        )}
      </div>
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-border pl-3 first:border-l-0 first:pl-0">
      <p className="font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-[10px] text-ink-muted">{label}</p>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <span className="mb-2 flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
        {icon}
      </span>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function HistoryEmptyState({ title }: { title: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
      <Image src="/images/workspace/voice-memory-isometric.png" alt="" width={144} height={144} className="size-36 object-contain" aria-hidden="true" />
      <p className="mt-1 text-[12px] font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[260px] text-[11px] leading-4 text-ink-muted">Completed rooms and retained artifacts will appear here.</p>
    </div>
  );
}
