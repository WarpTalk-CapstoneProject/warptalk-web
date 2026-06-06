"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Languages,
  ListChecks,
  RotateCcw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ReviewStatus = "Processing" | "Draft" | "Review needed" | "Final";
type WorkspaceTab = "overview" | "transcript" | "summary" | "actions" | "files";

type TranscriptSegment = {
  id: string;
  time: string;
  speaker: string;
  original: string;
  translation: string;
  confidence: number;
  needsReview?: boolean;
};

type MeetingRecord = {
  id: string;
  title: string;
  code: string;
  department: string;
  group: string;
  host: string;
  date: string;
  dateLabel: string;
  time: string;
  duration: string;
  participants: number;
  languages: string[];
  status: ReviewStatus;
  summary: string;
  decisions: string[];
  risks: string[];
  actionItems: string[];
  files: { name: string; category: "Context" | "Transcript" | "Summary"; size: string }[];
  segments: TranscriptSegment[];
  revision: number;
};

const initialMeetings: MeetingRecord[] = [
  {
    id: "board-review",
    title: "Board Review Translation",
    code: "BORD-778",
    department: "Executive",
    group: "Investor Relations",
    host: "Mika Tanaka",
    date: "2026-06-06",
    dateLabel: "Today",
    time: "10:24 AM",
    duration: "46 min",
    participants: 14,
    languages: ["English", "Vietnamese", "Japanese"],
    status: "Review needed",
    summary:
      "The meeting focused on rollout readiness, investor Q&A preparation, and terminology cleanup before the next customer review.",
    decisions: [
      "Publish the Vietnamese glossary before the next session.",
      "Route low-confidence segments to manager review.",
    ],
    risks: ["Japanese product terminology is incomplete.", "Two transcript segments remain below 80% confidence."],
    actionItems: ["Prepare investor FAQ", "Review terminology cleanup", "Export final transcript"],
    files: [
      { name: "investor-agenda.pdf", category: "Context", size: "1.4 MB" },
      { name: "product-glossary.csv", category: "Context", size: "86 KB" },
      { name: "board-review-draft.vtt", category: "Transcript", size: "124 KB" },
    ],
    segments: [
      {
        id: "seg-1",
        time: "00:42",
        speaker: "Host",
        original: "Welcome everyone. Today we will focus on product milestones and rollout readiness.",
        translation: "Chào mọi người. Hôm nay chúng ta sẽ tập trung vào các mốc sản phẩm và mức độ sẵn sàng triển khai.",
        confidence: 96,
      },
      {
        id: "seg-2",
        time: "07:18",
        speaker: "Investor",
        original: "Can we clarify how terminology is handled for regulated documents?",
        translation: "Chúng ta có thể làm rõ cách xử lý thuật ngữ cho tài liệu được quản lý không?",
        confidence: 78,
        needsReview: true,
      },
      {
        id: "seg-3",
        time: "19:04",
        speaker: "Interpreter",
        original: "The glossary will be applied before the final transcript export.",
        translation: "Bảng thuật ngữ sẽ được áp dụng trước khi xuất bản ghi cuối cùng.",
        confidence: 93,
      },
    ],
    revision: 3,
  },
  {
    id: "partner-sync",
    title: "Partner Sync Room",
    code: "SYNC-882",
    department: "Sales",
    group: "APAC Partners",
    host: "Nguyen Linh",
    date: "2026-06-06",
    dateLabel: "Today",
    time: "1:30 PM",
    duration: "38 min",
    participants: 8,
    languages: ["Vietnamese", "English"],
    status: "Draft",
    summary: "APAC partner onboarding, enablement material, and support ownership were reviewed.",
    decisions: ["Share the updated onboarding deck."],
    risks: ["Support coverage owner is not confirmed."],
    actionItems: ["Send onboarding deck", "Confirm support owner"],
    files: [
      { name: "partner-onboarding.pdf", category: "Context", size: "2.1 MB" },
      { name: "partner-sync.txt", category: "Transcript", size: "94 KB" },
    ],
    segments: [
      {
        id: "seg-1",
        time: "02:12",
        speaker: "Host",
        original: "We will share the onboarding package after this call.",
        translation: "Chúng tôi sẽ chia sẻ bộ tài liệu hướng dẫn sau cuộc gọi này.",
        confidence: 91,
      },
    ],
    revision: 1,
  },
  {
    id: "legal-review",
    title: "Legal Contract Review",
    code: "LEGL-307",
    department: "Legal",
    group: "Compliance",
    host: "Sarah Chen",
    date: "2026-06-05",
    dateLabel: "Yesterday",
    time: "3:00 PM",
    duration: "58 min",
    participants: 11,
    languages: ["English", "Japanese"],
    status: "Final",
    summary: "The legal team approved the revised regional contract language with two retention requirements.",
    decisions: ["Approve the revised regional clause.", "Retain recordings for 30 days."],
    risks: ["Local counsel confirmation remains pending."],
    actionItems: ["Request local counsel sign-off"],
    files: [
      { name: "regional-contract.pdf", category: "Context", size: "3.8 MB" },
      { name: "legal-final.docx", category: "Transcript", size: "188 KB" },
      { name: "legal-summary.pdf", category: "Summary", size: "220 KB" },
    ],
    segments: [
      {
        id: "seg-1",
        time: "11:08",
        speaker: "Legal Lead",
        original: "The revised clause is approved subject to local counsel confirmation.",
        translation: "Điều khoản sửa đổi được phê duyệt với điều kiện có xác nhận của luật sư địa phương.",
        confidence: 98,
      },
    ],
    revision: 4,
  },
  {
    id: "support-review",
    title: "Support Escalation Review",
    code: "SUP-419",
    department: "Support",
    group: "Customer Success",
    host: "Alex Morgan",
    date: "2026-06-05",
    dateLabel: "Yesterday",
    time: "11:15 AM",
    duration: "29 min",
    participants: 6,
    languages: ["English", "Vietnamese"],
    status: "Processing",
    summary: "WarpTalk is still generating the meeting summary.",
    decisions: [],
    risks: [],
    actionItems: [],
    files: [{ name: "support-audio.mp4", category: "Context", size: "18.2 MB" }],
    segments: [],
    revision: 0,
  },
];

const tabs: { value: WorkspaceTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "transcript", label: "Transcript" },
  { value: "summary", label: "AI Summary" },
  { value: "actions", label: "Action Items" },
  { value: "files", label: "Files" },
];

export default function AiSummariesPage() {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [selectedId, setSelectedId] = useState(initialMeetings[0].id);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All departments");
  const [status, setStatus] = useState("All statuses");
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);

  const selectedMeeting =
    meetings.find((meeting) => meeting.id === selectedId) ?? meetings[0];

  const filteredMeetings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return meetings.filter((meeting) => {
      const matchesQuery =
        !normalized ||
        [meeting.title, meeting.code, meeting.group, meeting.host].some((value) =>
          value.toLowerCase().includes(normalized)
        );
      return (
        matchesQuery &&
        (department === "All departments" || meeting.department === department) &&
        (status === "All statuses" || meeting.status === status)
      );
    });
  }, [department, meetings, query, status]);

  const groupedMeetings = useMemo(
    () =>
      filteredMeetings.reduce<Record<string, MeetingRecord[]>>((groups, meeting) => {
        groups[meeting.dateLabel] ??= [];
        groups[meeting.dateLabel].push(meeting);
        return groups;
      }, {}),
    [filteredMeetings]
  );

  function updateSelectedMeeting(updater: (meeting: MeetingRecord) => MeetingRecord) {
    setMeetings((current) =>
      current.map((meeting) => (meeting.id === selectedId ? updater(meeting) : meeting))
    );
  }

  function updateSegment(segmentId: string, field: "original" | "translation", value: string) {
    updateSelectedMeeting((meeting) => ({
      ...meeting,
      status: meeting.status === "Final" ? "Review needed" : meeting.status,
      segments: meeting.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, [field]: value } : segment
      ),
    }));
  }

  function saveTranscript() {
    updateSelectedMeeting((meeting) => ({
      ...meeting,
      status: "Draft",
      revision: meeting.revision + 1,
    }));
    setEditingSegmentId(null);
    toast.success("Transcript draft saved.");
  }

  function approveFinal() {
    if (!selectedMeeting.segments.length) {
      toast.error("Transcript is not ready for approval.");
      return;
    }
    updateSelectedMeeting((meeting) => ({
      ...meeting,
      status: "Final",
      revision: meeting.revision + 1,
    }));
    toast.success("Final transcript and summary approved.");
  }

  function downloadArtifact(name: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const aiChatHref = `/ai-chat?meetingId=${selectedMeeting.id}&artifact=transcript-v${selectedMeeting.revision}`;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 overflow-hidden">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search meetings, groups, hosts..."
            className="h-9 pl-8"
          />
        </div>
        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="h-9 rounded-lg border bg-white px-3 text-xs outline-none"
          aria-label="Filter by department"
        >
          {["All departments", "Executive", "Sales", "Legal", "Support"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-lg border bg-white px-3 text-xs outline-none"
          aria-label="Filter by status"
        >
          {["All statuses", "Processing", "Draft", "Review needed", "Final"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <Button size="icon" variant="outline" title="More filters">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid min-h-0 gap-2.5 xl:grid-cols-[260px_minmax(0,1fr)_250px]">
        <Card className="min-h-0 gap-0 overflow-hidden rounded-[22px] py-0">
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
            <div>
              <p className="text-sm font-semibold">Meetings</p>
              <p className="text-[11px] text-muted-foreground">
                {filteredMeetings.length} available
              </p>
            </div>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {Object.entries(groupedMeetings).map(([dateLabel, records]) => (
              <div key={dateLabel} className="mb-3 last:mb-0">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {dateLabel}
                </p>
                <div className="space-y-1">
                  {records.map((meeting) => (
                    <button
                      key={meeting.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(meeting.id);
                        setEditingSegmentId(null);
                      }}
                      className={cn(
                        "w-full rounded-xl px-2.5 py-2.5 text-left transition",
                        selectedId === meeting.id
                          ? "bg-neutral-950 text-white"
                          : "hover:bg-neutral-100"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-semibold">{meeting.title}</p>
                        <StatusDot status={meeting.status} />
                      </div>
                      <p
                        className={cn(
                          "mt-1 truncate text-[11px]",
                          selectedId === meeting.id ? "text-white/60" : "text-muted-foreground"
                        )}
                      >
                        {meeting.department} · {meeting.time}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filteredMeetings.length === 0 ? (
              <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                No meetings match these filters.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[22px] py-0">
          <div className="border-b px-3 pt-3">
            <div className="flex items-start justify-between gap-3 pb-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold">{selectedMeeting.title}</h2>
                  <StatusBadge status={selectedMeeting.status} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {selectedMeeting.department} / {selectedMeeting.group} · {selectedMeeting.code}
                </p>
              </div>
              <Button
                size="sm"
                onClick={approveFinal}
                disabled={selectedMeeting.status === "Processing"}
                className="rounded-full"
              >
                <Check className="h-3.5 w-3.5" />
                Approve final
              </Button>
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    "h-8 shrink-0 border-b-2 px-2.5 text-xs font-medium transition",
                    activeTab === tab.value
                      ? "border-neutral-950 text-neutral-950"
                      : "border-transparent text-muted-foreground hover:text-neutral-950"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-3">
            {activeTab === "overview" ? (
              <Overview meeting={selectedMeeting} onOpenTab={setActiveTab} />
            ) : null}
            {activeTab === "transcript" ? (
              <TranscriptEditor
                meeting={selectedMeeting}
                editingSegmentId={editingSegmentId}
                onEdit={setEditingSegmentId}
                onChange={updateSegment}
                onSave={saveTranscript}
                onExport={() =>
                  downloadArtifact(
                    `${selectedMeeting.code}-transcript-v${selectedMeeting.revision}.txt`,
                    selectedMeeting.segments
                      .map(
                        (segment) =>
                          `[${segment.time}] ${segment.speaker}\n${segment.original}\n${segment.translation}`
                      )
                      .join("\n\n")
                  )
                }
              />
            ) : null}
            {activeTab === "summary" ? (
              <SummaryEditor meeting={selectedMeeting} onUpdate={updateSelectedMeeting} />
            ) : null}
            {activeTab === "actions" ? (
              <ActionItems meeting={selectedMeeting} onUpdate={updateSelectedMeeting} />
            ) : null}
            {activeTab === "files" ? (
              <FilesPanel
                meeting={selectedMeeting}
                onDownload={(fileName) =>
                  downloadArtifact(fileName, `Preview artifact for ${selectedMeeting.title}`)
                }
              />
            ) : null}
          </div>
        </Card>

        <Card className="min-h-0 gap-0 overflow-hidden rounded-[22px] py-0">
          <div className="border-b px-3 py-3">
            <p className="text-sm font-semibold">Meeting inspector</p>
            <p className="text-[11px] text-muted-foreground">Context, version, and output</p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-2">
              <InspectorValue icon={<Users />} label="Participants" value={String(selectedMeeting.participants)} />
              <InspectorValue icon={<Languages />} label="Languages" value={String(selectedMeeting.languages.length)} />
              <InspectorValue icon={<FileText />} label="Files" value={String(selectedMeeting.files.length)} />
              <InspectorValue icon={<RotateCcw />} label="Revision" value={`v${selectedMeeting.revision}`} />
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs font-semibold">Meeting details</p>
              <dl className="mt-2 space-y-2 text-[11px]">
                <DetailRow label="Host" value={selectedMeeting.host} />
                <DetailRow label="Date" value={`${selectedMeeting.dateLabel}, ${selectedMeeting.time}`} />
                <DetailRow label="Duration" value={selectedMeeting.duration} />
                <DetailRow label="Group" value={selectedMeeting.group} />
              </dl>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs font-semibold">AI context</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Uses transcript revision v{selectedMeeting.revision} and{" "}
                {selectedMeeting.files.filter((file) => file.category === "Context").length} context files.
              </p>
              <Link
                href={aiChatHref}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "mt-3 w-full justify-center rounded-full"
                )}
              >
                <Bot className="h-3.5 w-3.5" />
                Open in AI Chat
              </Link>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs font-semibold">Quick exports</p>
              <div className="mt-2 grid gap-1.5">
                {["Final transcript", "Summary report", "Action items"].map((item) => (
                  <Button
                    key={item}
                    variant="outline"
                    size="sm"
                    className="justify-between"
                    onClick={() =>
                      downloadArtifact(
                        `${selectedMeeting.code}-${item.toLowerCase().replaceAll(" ", "-")}.txt`,
                        selectedMeeting.summary
                      )
                    }
                  >
                    {item}
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Overview({
  meeting,
  onOpenTab,
}: {
  meeting: MeetingRecord;
  onOpenTab: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <OverviewSection title="AI summary" icon={<Sparkles />} onOpen={() => onOpenTab("summary")}>
        <p className="text-xs leading-relaxed text-muted-foreground">{meeting.summary}</p>
      </OverviewSection>
      <OverviewSection title="Transcript health" icon={<FileText />} onOpen={() => onOpenTab("transcript")}>
        <p className="text-2xl font-semibold">{meeting.segments.length}</p>
        <p className="text-xs text-muted-foreground">
          {meeting.segments.filter((segment) => segment.needsReview).length} segments need review
        </p>
      </OverviewSection>
      <OverviewSection title="Decisions" icon={<CheckCircle2 />} onOpen={() => onOpenTab("summary")}>
        <List values={meeting.decisions} empty="No decisions generated." />
      </OverviewSection>
      <OverviewSection title="Action items" icon={<ListChecks />} onOpen={() => onOpenTab("actions")}>
        <List values={meeting.actionItems} empty="No action items generated." />
      </OverviewSection>
    </div>
  );
}

function TranscriptEditor({
  meeting,
  editingSegmentId,
  onEdit,
  onChange,
  onSave,
  onExport,
}: {
  meeting: MeetingRecord;
  editingSegmentId: string | null;
  onEdit: (id: string | null) => void;
  onChange: (id: string, field: "original" | "translation", value: string) => void;
  onSave: () => void;
  onExport: () => void;
}) {
  if (!meeting.segments.length) {
    return <EmptyState text="Transcript is still processing." />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Working draft · revision v{meeting.revision}
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button size="sm" onClick={onSave}>
            <Check className="h-3.5 w-3.5" />
            Save draft
          </Button>
        </div>
      </div>
      {meeting.segments.map((segment) => {
        const editing = editingSegmentId === segment.id;
        return (
          <div
            key={segment.id}
            className={cn(
              "rounded-xl border p-3",
              segment.needsReview && "border-amber-300 bg-amber-50/50"
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px]">
                <Badge variant="outline">{segment.time}</Badge>
                <span className="font-semibold">{segment.speaker}</span>
                <span className="text-muted-foreground">{segment.confidence}% confidence</span>
              </div>
              <Button size="xs" variant="ghost" onClick={() => onEdit(editing ? null : segment.id)}>
                {editing ? "Close" : "Edit"}
              </Button>
            </div>
            {editing ? (
              <div className="grid gap-2">
                <Textarea
                  value={segment.original}
                  onChange={(event) => onChange(segment.id, "original", event.target.value)}
                  className="min-h-20 resize-none text-xs"
                />
                <Textarea
                  value={segment.translation}
                  onChange={(event) => onChange(segment.id, "translation", event.target.value)}
                  className="min-h-20 resize-none text-xs"
                />
              </div>
            ) : (
              <>
                <p className="text-xs leading-relaxed">{segment.original}</p>
                <p className="mt-2 rounded-lg bg-neutral-100 px-2.5 py-2 text-xs leading-relaxed text-neutral-600">
                  {segment.translation}
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryEditor({
  meeting,
  onUpdate,
}: {
  meeting: MeetingRecord;
  onUpdate: (updater: (meeting: MeetingRecord) => MeetingRecord) => void;
}) {
  return (
    <div className="space-y-3">
      <EditorField label="Executive summary">
        <Textarea
          value={meeting.summary}
          onChange={(event) =>
            onUpdate((current) => ({ ...current, summary: event.target.value, status: "Draft" }))
          }
          className="min-h-28 resize-none"
        />
      </EditorField>
      <EditableList
        label="Key decisions"
        values={meeting.decisions}
        onChange={(decisions) => onUpdate((current) => ({ ...current, decisions, status: "Draft" }))}
      />
      <EditableList
        label="Risks and open questions"
        values={meeting.risks}
        onChange={(risks) => onUpdate((current) => ({ ...current, risks, status: "Draft" }))}
      />
    </div>
  );
}

function ActionItems({
  meeting,
  onUpdate,
}: {
  meeting: MeetingRecord;
  onUpdate: (updater: (meeting: MeetingRecord) => MeetingRecord) => void;
}) {
  return (
    <EditableList
      label="Extracted action items"
      values={meeting.actionItems}
      onChange={(actionItems) =>
        onUpdate((current) => ({ ...current, actionItems, status: "Draft" }))
      }
    />
  );
}

function FilesPanel({
  meeting,
  onDownload,
}: {
  meeting: MeetingRecord;
  onDownload: (name: string) => void;
}) {
  return (
    <div className="space-y-2">
      {meeting.files.map((file) => (
        <div key={file.name} className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{file.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {file.category} · {file.size}
              </p>
            </div>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={() => onDownload(file.name)} title="Download file">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function EditableList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <EditorField label={label}>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="flex gap-2">
            <Input
              value={value}
              onChange={(event) =>
                onChange(values.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
              }
              className="h-9 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => onChange([...values, ""])}>
          Add item
        </Button>
      </div>
    </EditorField>
  );
}

function EditorField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold">{label}</p>
      {children}
    </div>
  );
}

function OverviewSection({
  title,
  icon,
  onOpen,
  children,
}: {
  title: string;
  icon: ReactNode;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onOpen} className="rounded-xl border p-3 text-left transition hover:bg-neutral-50">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-950 text-white [&_svg]:h-3.5 [&_svg]:w-3.5">
            {icon}
          </span>
          {title}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
      {children}
    </button>
  );
}

function InspectorValue({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-2.5">
      <span className="text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      <p className="mt-2 text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <Badge
      variant={status === "Final" ? "default" : status === "Processing" ? "outline" : "secondary"}
      className={cn(status === "Review needed" && "bg-amber-100 text-amber-800")}
    >
      {status}
    </Badge>
  );
}

function StatusDot({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={cn(
        "mt-1 h-2 w-2 shrink-0 rounded-full",
        status === "Final" && "bg-emerald-500",
        status === "Review needed" && "bg-amber-500",
        status === "Draft" && "bg-blue-500",
        status === "Processing" && "bg-neutral-300"
      )}
      title={status}
    />
  );
}

function List({ values, empty }: { values: string[]; empty: string }) {
  if (!values.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {values.slice(0, 3).map((value) => (
        <li key={value} className="flex gap-2 text-xs text-muted-foreground">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-950" />
          {value}
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
      {text}
    </div>
  );
}
