"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  Hash,
  Link as LinkIcon,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Radio,
  Star,
  StopCircle,
  Text,
  Users,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { getLanguageName } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { useTranscriptByRoom, useTranscriptSegments } from "@/hooks/use-transcripts";
import {
  useEndTranslationRoom,
  useTranslationRoom,
  useTranslationRoomInvitations,
  useTranslationRoomParticipants,
} from "@/hooks/use-translationRooms";
import { useWorkspaceMembers, useWorkspaces } from "@/hooks/use-workspace";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { MeetingPropertiesPills } from "./MeetingPropertiesPills";
import type { UserDto } from "@/types/auth";
import type {
  TranslationRoomDto,
  TranslationRoomInvitationDto,
  TranslationRoomParticipantDto,
  TranslationRoomStatus,
} from "@/types/translationRoom";
import type { TranscriptSegmentDto } from "@/types/transcript";
import type { WorkspaceMemberDto } from "@/types/workspace";

type ThreadKind = "log" | "note" | "transcript" | "system";

type UserIdentity = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  status?: string;
  avatarUrl?: string;
  speakLanguage?: string;
  listenLanguage?: string;
};

type ThreadEvent = {
  id: string;
  kind: ThreadKind;
  title: string;
  at?: string;
  actor: UserIdentity;
  content: string;
  metadata?: string[];
  accent?: "primary" | "muted" | "success";
};

type MarkdownBlock =
  | { type: "h1" | "h2" | "h3" | "quote" | "code" | "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "hr" };

const statusLabels: Record<TranslationRoomStatus, string> = {
  scheduled: "Scheduled",
  waiting: "Waiting",
  in_progress: "In Progress",
  paused: "Paused",
  ended: "Ended",
  cancelled: "Cancelled",
  expired: "Expired",
  failed: "Failed",
  timeout: "Timed Out",
};

export default function RoomInformationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomId = params.id;
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const invitationsQuery = useTranslationRoomInvitations(roomId);
  const endRoomMutation = useEndTranslationRoom();
  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const liveRoomState = useTranslationRoomStore((state) => state.translationRoomState);
  const user = useAuthStore((state) => state.user);
  const role = useWorkspaceRole();

  const transcriptQuery = useTranscriptByRoom(roomId);
  const segmentsQuery = useTranscriptSegments(transcriptQuery.data?.id);
  const transcriptSegments = segmentsQuery.data?.items || [];

  const room = roomQuery.data;
  const apiParticipants = participantsQuery.data ?? [];
  const apiInvitations = invitationsQuery.data ?? [];
  const { data: workspaces } = useWorkspaces();
  const validWorkspaceId =
    room?.workspaceId && room.workspaceId !== "00000000-0000-0000-0000-000000000000"
      ? room.workspaceId
      : workspaces?.items?.[0]?.id;
  const { data: members } = useWorkspaceMembers(validWorkspaceId || "");
  const membersArray = members?.items ?? [];

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

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(`${label} copied`);
    setTimeout(() => setCopiedText(null), 2000);
  }

  if (!room) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-muted-foreground">Room information is unavailable.</p>
      </div>
    );
  }

  const languageNames = [room.sourceLanguage, ...room.targetLanguages]
    .filter((language): language is string => Boolean(language))
    .map(getLanguageName);
  const isEnded = room.status === "ended";
  const isHost = room.hostId === user?.id || Boolean(room.isHost);
  const participants = buildUserList(room, apiParticipants, apiInvitations, membersArray, user);
  const hostUser = getHostUser(room, participants, user);
  const threadEvents = buildThreadEvents(room, hostUser, participants, transcriptSegments, transcriptQuery.data?.createdAt, languageNames);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink">
      {copiedText ? (
        <div className="fixed left-1/2 top-6 z-[100] -translate-x-1/2 rounded-md bg-black px-4 py-2 text-[13px] font-medium text-white shadow-lg">
          {copiedText}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid min-h-full w-full max-w-[1500px] grid-cols-1 gap-8 px-6 py-8 xl:grid-cols-[minmax(0,1fr)_300px] xl:px-10">
          <main className="min-w-0">
            <div className="mb-8 flex flex-col gap-5 border-b border-border/60 pb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="rounded-md px-1.5 py-1 hover:bg-surface-2"
                    >
                      Meetings
                    </button>
                    <span>/</span>
                    <span className="truncate text-ink">{room.title}</span>
                  </div>
                  <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-foreground">{room.title}</h1>
                  {room.description ? <p className="mt-2 max-w-3xl text-[14px] leading-6 text-muted-foreground">{room.description}</p> : null}
                  <MeetingPropertiesPills room={room} apiParticipants={apiParticipants} activeParticipantCount={activeParticipantCount} user={user} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusChip status={room.status} />
                  {room.hostId === user?.id && (room.status === "scheduled" || room.status === "waiting") ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[12px]"
                      onClick={() => {
                        useUIStore.getState().setEditRoomId(room.id);
                        useUIStore.getState().setCreateRoomModalOpen(true);
                      }}
                    >
                      Edit room
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2 border-y border-border/60 py-2 text-[13px]">
                <MetadataRow icon={<Users className="size-4" />} label="People">
                  <div className="flex flex-wrap gap-1.5">
                    {participants.length > 0 ? participants.slice(0, 8).map((participant) => <UserChip key={participant.id} user={participant} />) : "No participants added"}
                  </div>
                </MetadataRow>
                <MetadataRow icon={<Clock className="size-4" />} label="When">
                  <span>{formatDateTime(room.scheduledAt ?? room.createdAt)}</span>
                  {room.endedAt ? <span className="text-muted-foreground">- {formatDateTime(room.endedAt)}</span> : null}
                </MetadataRow>
                <MetadataRow icon={<MapPin className="size-4" />} label="Where">
                  <InlineChip icon={<Video className="size-3.5" />}>Virtual Audio Bridge</InlineChip>
                </MetadataRow>
              </div>
            </div>

            <RoomThread events={threadEvents} isLive={room.status === "in_progress"} isEnded={isEnded} />
          </main>

          <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)] xl:overflow-y-auto">
            <PropertyPanel title="Tracking">
              <PropertyLine label="Organizer">
                <UserChip user={hostUser} compact />
              </PropertyLine>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                  <ChevronDown className="size-3" />
                  Attendees: {participants.filter((participant) => participant.id !== hostUser.id).length}
                </div>
                <div className="space-y-1.5">
                  {participants.filter((participant) => participant.id !== hostUser.id).length > 0 ? (
                    participants
                      .filter((participant) => participant.id !== hostUser.id)
                      .map((participant) => <UserRow key={participant.id} user={participant} />)
                  ) : (
                    <p className="text-[12px] text-muted-foreground">No attendees yet.</p>
                  )}
                </div>
              </div>
            </PropertyPanel>

            <PropertyPanel title="Actions">
              <ActionButton icon={<Copy className="size-3.5" />} onClick={() => handleCopy(room.translationRoomCode, "Room code")}>
                Copy room code
              </ActionButton>
              {isHost ? (
                <ActionButton icon={<LinkIcon className="size-3.5" />} onClick={() => handleCopy(`${window.location.origin}/join?code=${room.translationRoomCode}`, "Invite link")}>
                  Copy invite link
                </ActionButton>
              ) : null}
              <ActionButton icon={<Star className="size-3.5" />}>Add to favorites</ActionButton>
              {isHost && !isEnded && room.status !== "cancelled" ? (
                <ActionButton
                  destructive
                  icon={<StopCircle className="size-3.5" />}
                  disabled={endRoomMutation.isPending}
                  onClick={async () => {
                    try {
                      await endRoomMutation.mutateAsync(room.id);
                    } catch {
                      // Mutation toast handles the error.
                    }
                  }}
                >
                  End meeting
                </ActionButton>
              ) : null}
            </PropertyPanel>

            <PropertyPanel title="Meeting access">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 p-3">
                <div className="flex size-9 items-center justify-center rounded-md border border-border bg-canvas text-ink">
                  <Video className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">WarpTalk Session</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{room.translationRoomCode}</p>
                </div>
              </div>
              <Button
                className="h-9 justify-between rounded-md text-[13px]"
                onClick={() => {
                  useUIStore.getState().setSetupRoomId(roomId);
                  useUIStore.getState().setSetupRoomModalOpen(true);
                }}
              >
                Join meeting
                <ArrowRight className="size-4" />
              </Button>
            </PropertyPanel>
          </aside>
        </div>
      </div>
    </div>
  );
}

function RoomThread({ events, isLive, isEnded }: { events: ThreadEvent[]; isLive: boolean; isEnded: boolean }) {
  return (
    <section className="relative">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Thread flow</p>
          <h2 className="mt-1 text-[18px] font-semibold">Meeting timeline</h2>
        </div>
        <InlineChip icon={<MessageSquareText className="size-3.5" />}>{events.length} updates</InlineChip>
      </div>

      <div className="relative pl-7">
        <div className="absolute bottom-8 left-[10px] top-2 w-px bg-border" />
        <div className="space-y-5">
          {events.map((event) => (
            <article key={event.id} className="relative rounded-lg border border-border bg-surface-1 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <ThreadDot kind={event.accent ?? (event.kind === "transcript" ? "muted" : "primary")} />
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <KindChip kind={event.kind} />
                <UserChip user={event.actor} compact />
                <span className="font-medium text-ink">{event.title}</span>
                {event.at ? <span className="text-muted-foreground">{event.at}</span> : null}
                {event.metadata?.map((item) => <InlineChip key={item}>{item}</InlineChip>)}
              </div>
              <MarkdownContent content={event.content} />
            </article>
          ))}

          {!isLive && !isEnded ? (
            <div className="relative rounded-lg border border-dashed border-border bg-surface-1/60 p-4 text-[13px] text-muted-foreground">
              <ThreadDot kind="muted" />
              The meeting has not started yet. Transcript items will join this thread when speech is captured.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function UserChip({ user, compact = false }: { user: UserIdentity; compact?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          compact ? "h-6 px-1.5 pr-2 text-[11px]" : "h-7 px-2 pr-2.5 text-[12px]"
        )}
      >
        <AvatarInitial user={user} className={compact ? "size-4 text-[9px]" : "size-5 text-[10px]"} />
        <span className="truncate font-medium">{user.name}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] rounded-xl border-border/70 p-3 shadow-xl">
        <div className="flex items-start gap-3">
          <AvatarInitial user={user} className="size-10 text-[14px]" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-ink">{user.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{user.email ?? user.id}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.role ? <InlineChip>{user.role}</InlineChip> : null}
              {user.status ? <InlineChip>{user.status}</InlineChip> : null}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <div>
            <p>Speaks</p>
            <p className="mt-0.5 font-medium text-ink">{user.speakLanguage ? getLanguageName(user.speakLanguage) : "Not set"}</p>
          </div>
          <div>
            <p>Listens</p>
            <p className="mt-0.5 font-medium text-ink">{user.listenLanguage ? getLanguageName(user.listenLanguage) : "Not set"}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);
  return (
    <div className="mt-3 space-y-3 text-[13px] leading-6 text-ink-subtle">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "h1":
            return <h1 key={index} className="text-[20px] font-semibold leading-7 text-ink">{renderInlineMarkdown(block.text)}</h1>;
          case "h2":
            return <h2 key={index} className="text-[17px] font-semibold leading-6 text-ink">{renderInlineMarkdown(block.text)}</h2>;
          case "h3":
            return <h3 key={index} className="text-[15px] font-semibold leading-6 text-ink">{renderInlineMarkdown(block.text)}</h3>;
          case "ul":
            return <ul key={index} className="list-disc space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}</ul>;
          case "ol":
            return <ol key={index} className="list-decimal space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}</ol>;
          case "quote":
            return <blockquote key={index} className="border-l-2 border-primary/50 pl-3 text-muted-foreground">{renderInlineMarkdown(block.text)}</blockquote>;
          case "code":
            return <pre key={index} className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[12px] leading-5 text-ink"><code>{block.text}</code></pre>;
          case "table":
            return (
              <div key={index} className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full border-collapse text-left text-[12px]">
                  <thead className="bg-surface-2 text-ink">
                    <tr>{block.headers.map((header) => <th key={header} className="border-b border-border px-3 py-2 font-medium">{renderInlineMarkdown(header)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-border last:border-b-0">
                        {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{renderInlineMarkdown(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={index} className="border-border" />;
          case "p":
          default:
            return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
        }
      })}
    </div>
  );
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.trim().split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", text: codeLines.join("\n") });
      index += 1;
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const type = `h${level}` as "h1" | "h2" | "h3";
      blocks.push({ type, text: line.replace(/^#{1,3}\s/, "") });
      index += 1;
      continue;
    }
    if (/^\|.+\|$/.test(line) && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && /^\|.+\|$/.test(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push({ type: "quote", text: line.replace(/^>\s+/, "") });
      index += 1;
      continue;
    }
    if (line.trim() === "---") {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^#{1,3}\s|^[-*]\s+|^\d+\.\s+|^>\s+|^```|^\|.+\|$/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }

  return blocks;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index} className="font-semibold text-ink">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={index}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-ink">{token.slice(1, -1)}</code>;
    }
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return <a key={index} href={link[2]} className="font-medium text-primary underline underline-offset-3">{link[1]}</a>;
    }
    return <span key={index}>{token}</span>;
  });
}

function splitTableRow(line: string) {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function buildThreadEvents(
  room: TranslationRoomDto,
  hostUser: UserIdentity,
  participants: UserIdentity[],
  segments: TranscriptSegmentDto[],
  transcriptCreatedAt: string | undefined,
  languageNames: string[]
): ThreadEvent[] {
  const events: ThreadEvent[] = [
    {
      id: "scheduled",
      kind: "log",
      title: "Meeting scheduled",
      at: formatDateTime(room.createdAt),
      actor: hostUser,
      accent: "primary",
      content: `**${hostUser.name}** created the room and set the language scope to **${languageNames.join(", ") || "Not set"}**.`,
      metadata: [room.translationRoomCode],
    },
  ];

  if (room.description) {
    events.push({
      id: "brief",
      kind: "note",
      title: "Room brief",
      at: formatTimeAgo(room.createdAt),
      actor: hostUser,
      content: room.description,
      metadata: ["Markdown"],
    });
  } else {
    events.push({
      id: "brief",
      kind: "note",
      title: "Room brief",
      actor: hostUser,
      content:
        "## Agenda\n\n- Align translation setup\n- Confirm attendees and access\n- Capture transcript decisions\n\n| Field | Value |\n| --- | --- |\n| Format | Markdown |\n| Editing | Plain text |",
      metadata: ["Markdown"],
    });
  }

  if (room.startedAt) {
    events.push({
      id: "started",
      kind: "log",
      title: "Meeting started",
      at: formatDateTime(room.startedAt),
      actor: hostUser,
      accent: "success",
      content: "Realtime translation and transcript capture became available for the room.",
    });
  }

  const transcriptEvents = segments.map((segment) => {
    const actor = participants.find((participant) => participant.id === segment.speakerParticipantId || participant.name === segment.speakerName) ?? {
      id: segment.speakerParticipantId ?? segment.speakerName ?? "unknown-speaker",
      name: segment.speakerName || "Unknown speaker",
      role: "Speaker",
    };
    const date = new Date(transcriptCreatedAt || room.startedAt || room.createdAt);
    date.setMilliseconds(date.getMilliseconds() + segment.startTimeMs);
    return {
      id: segment.id,
      kind: "transcript" as const,
      title: "Transcript entry",
      at: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      actor,
      accent: "muted" as const,
      content: segment.originalText,
      metadata: [segment.originalLanguage.toUpperCase(), `${Math.round((segment.confidence ?? 0) * 100) || 0}%`],
    };
  });

  events.push(...transcriptEvents);

  if (room.endedAt) {
    events.push({
      id: "ended",
      kind: "log",
      title: "Meeting ended",
      at: formatDateTime(room.endedAt),
      actor: hostUser,
      content: `Final duration: **${formatDuration(room)}**.`,
    });
  }

  return events;
}

function buildUserList(
  room: TranslationRoomDto,
  participants: TranslationRoomParticipantDto[],
  invitations: TranslationRoomInvitationDto[],
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null
): UserIdentity[] {
  const mapped = participants.map((participant) => toUserIdentity(participant));
  if (!mapped.some((participant) => participant.id === room.hostId)) {
    mapped.unshift({
      id: room.hostId,
      name: room.hostId === currentUser?.id ? currentUser?.fullName || currentUser?.email || "Host" : room.hostId,
      email: room.hostId === currentUser?.id ? currentUser?.email : undefined,
      role: "Organizer",
      status: "Host",
    });
  }

  for (const invitation of invitations) {
    const member = membersArray.find((item) => item.userId === invitation.email || item.id === invitation.email || item.email === invitation.email);
    const name = member?.fullName || invitation.email;
    if (!mapped.some((participant) => participant.email === invitation.email || participant.id === invitation.email)) {
      mapped.push({
        id: invitation.id ?? invitation.email,
        name,
        email: invitation.email,
        role: "Invitee",
        status: invitation.status ? invitation.status.toLowerCase() : "pending",
      });
    }
  }

  return mapped;
}

function toUserIdentity(participant: TranslationRoomParticipantDto): UserIdentity {
  return {
    id: participant.userId || participant.id,
    name: participant.displayName || "Unknown user",
    role: normalizeLabel(participant.role),
    status: normalizeLabel(participant.status),
    avatarUrl: participant.avatarUrl,
    speakLanguage: participant.speakLanguage,
    listenLanguage: participant.listenLanguage,
  };
}

function getHostUser(room: TranslationRoomDto, participants: UserIdentity[], currentUser: UserDto | null) {
  return participants.find((participant) => participant.id === room.hostId) ?? {
    id: room.hostId,
    name: room.hostId === currentUser?.id ? currentUser?.fullName || currentUser?.email || "Host" : room.hostId,
    email: room.hostId === currentUser?.id ? currentUser?.email : undefined,
    role: "Organizer",
    status: "Host",
  };
}

function MetadataRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-9 grid-cols-[28px_90px_minmax(0,1fr)] items-center gap-2">
      <div className="flex justify-center text-muted-foreground">{icon}</div>
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">{children}</div>
    </div>
  );
}

function PropertyPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface-1 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1 px-0.5 text-[12px] font-medium text-muted-foreground">
          {title}
          <ChevronDown className="size-3" />
        </span>
        <MoreHorizontal className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function PropertyLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function UserRow({ user }: { user: UserIdentity }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2/70">
      <UserChip user={user} compact />
      {user.status ? <span className="truncate text-[11px] text-muted-foreground">{user.status}</span> : null}
    </div>
  );
}

function ActionButton({ children, icon, destructive, disabled, onClick }: { children: ReactNode; icon: ReactNode; destructive?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px] transition-colors hover:bg-surface-2 disabled:opacity-50",
        destructive ? "text-red-500 hover:bg-red-500/10" : "text-muted-foreground"
      )}
    >
      {icon}
      <span className={cn("text-foreground", destructive && "text-red-500")}>{children}</span>
    </button>
  );
}

function StatusChip({ status }: { status: TranslationRoomStatus }) {
  return (
    <InlineChip icon={<StatusDot status={status} />}>
      {statusLabels[status]}
    </InlineChip>
  );
}

function StatusDot({ status }: { status: string }) {
  const isLive = status === "in_progress";
  return <span className={cn("size-2 rounded-full", isLive ? "bg-blue-500" : "bg-muted-foreground/50")} />;
}

function InlineChip({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2 text-[11px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function KindChip({ kind }: { kind: ThreadKind }) {
  const config: Record<ThreadKind, { icon: ReactNode; label: string }> = {
    log: { icon: <Radio className="size-3.5" />, label: "Log" },
    note: { icon: <Text className="size-3.5" />, label: "Markdown" },
    transcript: { icon: <MessageSquareText className="size-3.5" />, label: "Transcript" },
    system: { icon: <Hash className="size-3.5" />, label: "System" },
  };
  return <InlineChip icon={config[kind].icon}>{config[kind].label}</InlineChip>;
}

function ThreadDot({ kind }: { kind: "primary" | "muted" | "success" }) {
  const icon = kind === "success" ? <CheckCircle2 className="size-3" /> : kind === "primary" ? <Circle className="size-3 fill-current" /> : <Circle className="size-3" />;
  return (
    <div
      className={cn(
        "absolute -left-[25px] top-4 flex size-5 items-center justify-center rounded-full border bg-canvas",
        kind === "primary" && "border-primary text-primary",
        kind === "success" && "border-emerald-500 text-emerald-500",
        kind === "muted" && "border-border text-muted-foreground"
      )}
    >
      {icon}
    </div>
  );
}

function AvatarInitial({ user, className }: { user: UserIdentity; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold uppercase text-primary", className)}>
      {user.name?.charAt(0) || "U"}
    </span>
  );
}

function normalizeLabel(value?: string) {
  if (!value) return undefined;
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTimeAgo(value?: string) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(room: TranslationRoomDto) {
  const seconds =
    room.durationSeconds ??
    (room.startedAt && room.endedAt
      ? Math.max(0, Math.round((new Date(room.endedAt).getTime() - new Date(room.startedAt).getTime()) / 1000))
      : 0);
  if (!seconds) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${hours}h ` : ""}${minutes}m`;
}
