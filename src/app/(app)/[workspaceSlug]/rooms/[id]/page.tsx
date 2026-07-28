"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bold,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Code,
  Code2,
  Copy,
  Download,
  FileText,
  Hash,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Quote,
  Star,
  StopCircle,
  Strikethrough,
  Underline as UnderlineIcon,
  Users,
  Video,
} from "lucide-react";
import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { getLanguageName } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { useTranscriptByRoom, useTranscriptSegments } from "@/hooks/use-transcripts";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import {
  useEndTranslationRoom,
  useTranslationRoom,
  useTranslationRoomInvitations,
  useTranslationRoomParticipants,
  useUpdateTranslationRoomSettings,
} from "@/hooks/use-translationRooms";
import { useWorkspaceMembers, useWorkspaces } from "@/hooks/use-workspace";
import { buildGoogleCalendarUrl, translationRoomService } from "@/services/translationRoom.service";
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
  workspaceRole?: string;
  membershipType?: string;
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
  const roomId = params.id;
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const invitationsQuery = useTranslationRoomInvitations(roomId);
  const endRoomMutation = useEndTranslationRoom();
  const updateRoomSettings = useUpdateTranslationRoomSettings();
  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const liveRoomState = useTranslationRoomStore((state) => state.translationRoomState);
  const user = useAuthStore((state) => state.user);

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

  useRegisterAssistantContext(
    room
      ? {
          pageType: "room_detail",
          entityId: room.id,
          workspaceId: validWorkspaceId,
          snapshot: {
            title: room.title,
            status: room.status,
            participantCount: String(activeParticipantCount),
          },
        }
      : null
  );

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
  const rawParticipants = buildUserList(room, apiParticipants, apiInvitations, membersArray, user);
  const hostUser = getHostUser(room, rawParticipants, membersArray, user);
  const participants = sortRoomPeople(rawParticipants, hostUser);
  const threadEvents = buildThreadEvents(
    room,
    hostUser,
    participants,
    apiParticipants,
    apiInvitations,
    languageNames
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-1 text-ink">
      {copiedText ? (
        <div className="fixed left-1/2 top-6 z-[100] -translate-x-1/2 rounded-md bg-black px-4 py-2 text-[13px] font-medium text-white shadow-lg">
          {copiedText}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto xl:overflow-hidden">
        <div className="mx-auto grid min-h-full w-full max-w-[1500px] grid-cols-1 gap-8 px-6 py-8 xl:h-full xl:grid-cols-[minmax(0,1fr)_300px] xl:px-10">
          <main className="min-w-0 pr-1 xl:min-h-0 xl:overflow-y-auto xl:pr-2">
            <div className="mb-8 flex flex-col gap-5 border-b border-border/60 pb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-foreground">{room.title}</h1>
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
                  <PeopleSummary people={participants} />
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

            <RoomNotesEditor
              key={room.id}
              initialContent={room.description ?? ""}
              canEdit={isHost}
              onSave={(html) => updateRoomSettings.mutateAsync({ id: room.id, data: { description: html } })}
            />

            <MeetingTranscriptArtifact
              segments={transcriptSegments}
              baseTime={transcriptQuery.data?.createdAt || room.startedAt || room.createdAt}
              isEnded={isEnded}
              isLoading={transcriptQuery.isLoading || segmentsQuery.isLoading}
              onCopy={handleCopy}
            />

            <RoomThread events={threadEvents} />
          </main>

          <aside className="flex min-w-0 flex-col gap-3 pr-1 xl:sticky xl:top-8 xl:min-h-0 xl:max-h-[calc(100vh-4rem)] xl:overflow-y-auto xl:pr-0">
            <PropertyPanel title="Tracking">
              <PropertyLine label="Organizer">
                <UserChip user={hostUser} compact />
              </PropertyLine>
              <AttendeesList attendees={participants.filter((participant) => participant.id !== hostUser.id)} />
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
              {isUpcomingScheduledRoom(room) ? <AddToCalendarMenu room={room} /> : null}
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
                <div className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-1 text-ink">
                  <Video className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">WarpTalk Session</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{room.translationRoomCode}</p>
                </div>
              </div>
              <Button
                className="h-9 justify-between rounded-md text-[13px] !text-white [&_svg]:!text-white"
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

function RoomThread({ events }: { events: ThreadEvent[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="relative mt-8">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="mb-2 flex w-full cursor-pointer items-center justify-between gap-3 rounded-md py-1 text-left transition-colors hover:bg-surface-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-expanded={isExpanded}
        aria-controls="room-activity-panel"
      >
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground">
            <ChevronDown
              className={cn("size-4 transition-transform duration-200", isExpanded ? "" : "-rotate-90")}
            />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Activity</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Room events and participant changes.</p>
          </div>
        </div>
        <InlineChip icon={<MessageSquareText className="size-3.5" />}>{events.length} updates</InlineChip>
      </button>

      {isExpanded ? (
        <div id="room-activity-panel" className="relative mt-4 border-l border-border pl-5">
          <div className="space-y-1">
            {events.length === 0 ? (
              <ThreadEmptyState />
            ) : (
              events.map((event) => (
                <article
                  key={event.id}
                  className="relative rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-1"
                >
                  <span className="absolute -left-5 top-4 h-px w-3 bg-border" />
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <KindChip kind={event.kind} />
                    <UserChip user={event.actor} compact />
                    <span className="font-medium text-ink">{event.title}</span>
                    {event.at ? <span className="text-muted-foreground">{event.at}</span> : null}
                    {event.metadata?.map((item) => <InlineChip key={item}>{item}</InlineChip>)}
                  </div>
                  {event.content ? <MarkdownContent content={event.content} /> : null}
                </article>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ThreadEmptyState() {
  return (
    <div className="-ml-5 py-6 text-center text-[12px] text-muted-foreground">
      No activity yet.
    </div>
  );
}

/**
 * The saved meeting transcript, rendered as a distinct artifact participants can read
 * and copy after the meeting ends. Data is the persisted TranscriptService segments for
 * this room (already fetched on the page), so it does not depend on any exported file
 * being stored — it always reflects what was actually transcribed.
 */
function MeetingTranscriptArtifact({
  segments,
  baseTime,
  isEnded,
  isLoading,
  onCopy,
}: {
  segments: TranscriptSegmentDto[];
  baseTime?: string;
  isEnded: boolean;
  isLoading: boolean;
  onCopy: (text: string, label: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const ordered = [...segments].sort((left, right) => left.sequenceOrder - right.sequenceOrder);
  const base = baseTime ? new Date(baseTime) : null;

  function segmentTime(startMs: number) {
    if (!base) return "";
    const stamp = new Date(base);
    stamp.setMilliseconds(stamp.getMilliseconds() + startMs);
    return stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <section className="mt-8 border-b border-border/60 pb-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-left transition-colors hover:bg-surface-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-expanded={isExpanded}
          aria-controls="meeting-transcript-panel"
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground">
            <ChevronDown
              className={cn("size-4 transition-transform duration-200", isExpanded ? "" : "-rotate-90")}
            />
          </span>
          <h2 className="shrink-0 text-[15px] font-semibold text-ink">Meeting transcript</h2>
          <InlineChip icon={<FileText className="size-3.5" />}>
            {isEnded ? "Saved" : "Live"} - {ordered.length} {ordered.length === 1 ? "entry" : "entries"}
          </InlineChip>
        </button>
        {ordered.length > 0 ? (
          <button
            type="button"
            onClick={() => onCopy(assembleTranscriptText(ordered), "Transcript")}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Copy className="size-3.5" />
            Copy
          </button>
        ) : null}
      </div>

      {isExpanded ? (
        <div id="meeting-transcript-panel">
          {isLoading ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-surface-1 px-3.5 py-3 text-[13px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading transcript...
          </div>
        ) : ordered.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-surface-1 px-3.5 py-3 text-[13px] text-muted-foreground">
            {isEnded
              ? "No transcript was captured for this meeting."
              : "Transcript entries will appear here during the meeting."}
          </div>
        ) : (
          <div className="max-h-[480px] space-y-3 overflow-y-auto rounded-lg border border-border bg-surface-1 p-4 shadow-inner">
            {ordered.map((segment) => (
              <div key={segment.id} className="flex flex-col gap-1 border-b border-border/30 pb-2.5 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className="font-semibold text-ink">{segment.speakerName || "Unknown speaker"}</span>
                  <InlineChip>{segment.originalLanguage?.toUpperCase() || "?"}</InlineChip>
                  {base ? <span className="text-muted-foreground">{segmentTime(segment.startTimeMs)}</span> : null}
                </div>
                <p className="text-[13px] leading-6 text-ink-subtle">{segment.originalText}</p>
              </div>
            ))}
          </div>
        )}
        </div>
      ) : null}
    </section>
  );
}

function assembleTranscriptText(segments: TranscriptSegmentDto[]): string {
  return segments
    .map((segment) => `[${segment.speakerName || "Unknown"} (${(segment.originalLanguage || "").toUpperCase()})] ${segment.originalText}`)
    .join("\n");
}

type SaveState = "idle" | "saving" | "saved";

// tiptap-markdown doesn't augment @tiptap/core's Storage type, so its storage key is untyped.
function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

function RoomNotesEditor({
  initialContent,
  canEdit,
  onSave,
}: {
  initialContent: string;
  canEdit: boolean;
  onSave: (html: string) => Promise<void>;
}) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialContent);

  const flushSave = useCallback(
    (html: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (html === lastSavedRef.current) return;
      lastSavedRef.current = html;
      setSaveState("saving");
      onSave(html)
        .then(() => {
          setSaveState("saved");
          if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
          savedFlashRef.current = setTimeout(() => setSaveState("idle"), 1800);
        })
        .catch(() => {
          // Mutation toast handles the error; just stop showing "Saving...".
          setSaveState("idle");
        });
    },
    [onSave]
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: "whenNotEditable",
        autolink: true,
        HTMLAttributes: { class: "text-brand-primary underline underline-offset-2" },
      }),
      Placeholder.configure({
        placeholder: canEdit ? "Add agenda, context, decisions, or review notes..." : "No room notes yet.",
        showOnlyWhenEditable: false,
      }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "min-h-[160px] w-full max-w-none text-[13px] leading-6 text-ink outline-none " +
          "[&_p]:my-1.5 [&_h1]:mt-4 [&_h1]:mb-1.5 [&_h1]:text-[20px] [&_h1]:font-semibold [&_h1]:text-foreground " +
          "[&_h2]:mt-3.5 [&_h2]:mb-1.5 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-foreground " +
          "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-foreground " +
          "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
          "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
          "[&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] " +
          "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
          "[&_.is-empty::before]:pointer-events-none [&_.is-empty::before]:float-left [&_.is-empty::before]:h-0 [&_.is-empty::before]:text-muted-foreground [&_.is-empty::before]:content-[attr(data-placeholder)]",
      },
    },
    onUpdate: ({ editor }) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => flushSave(getMarkdown(editor)), 900);
    },
  });

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  // Flush any pending debounced save immediately when the editor loses focus,
  // so quickly navigating away doesn't drop the last edit.
  useEffect(() => {
    if (!editor) return;
    const handleBlur = ({ editor: instance }: { editor: Editor }) => flushSave(getMarkdown(instance));
    editor.on("blur", handleBlur);
    return () => {
      editor.off("blur", handleBlur);
    };
  }, [editor, flushSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
    };
  }, []);

  const editorState = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            strike: editor.isActive("strike"),
            link: editor.isActive("link"),
            blockquote: editor.isActive("blockquote"),
            code: editor.isActive("code"),
            codeBlock: editor.isActive("codeBlock"),
            bulletList: editor.isActive("bulletList"),
            orderedList: editor.isActive("orderedList"),
            heading1: editor.isActive("heading", { level: 1 }),
            heading2: editor.isActive("heading", { level: 2 }),
            heading3: editor.isActive("heading", { level: 3 }),
          }
        : null,
  });

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="border-b border-border/60 pb-7">
      <div className="mb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-2 text-left transition-colors hover:opacity-80 focus:outline-none"
        >
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform duration-200", isExpanded ? "" : "-rotate-90")}
          />
          <h2 className="text-[15px] font-semibold text-ink">Room notes</h2>
        </button>
        <SaveIndicator state={saveState} />
      </div>

      {isExpanded ? (
        <>

      {editor && canEdit ? (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
        >
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[12px] font-medium text-muted-foreground outline-none hover:bg-surface-2 hover:text-ink">
              Aa
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>Text</DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>Heading 1</DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>Heading 2</DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>Heading 3</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolbarSeparator />

          <ToolbarButton label="Bold" icon={<Bold className="size-3.5" />} active={editorState?.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarButton label="Italic" icon={<Italic className="size-3.5" />} active={editorState?.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarButton label="Underline" icon={<UnderlineIcon className="size-3.5" />} active={editorState?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <ToolbarButton label="Strikethrough" icon={<Strikethrough className="size-3.5" />} active={editorState?.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />

          <ToolbarSeparator />

          <LinkToolbarButton editor={editor} active={editorState?.link} />

          <ToolbarSeparator />

          <ToolbarButton label="Quote" icon={<Quote className="size-3.5" />} active={editorState?.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton label="Inline code" icon={<Code className="size-3.5" />} active={editorState?.code} onClick={() => editor.chain().focus().toggleCode().run()} />
          <ToolbarButton label="Code block" icon={<Code2 className="size-3.5" />} active={editorState?.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />

          <ToolbarSeparator />

          <ToolbarButton label="Bullet list" icon={<List className="size-3.5" />} active={editorState?.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton label="Numbered list" icon={<ListOrdered className="size-3.5" />} active={editorState?.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        </BubbleMenu>
      ) : null}

      <div
        onClick={() => canEdit && editor?.chain().focus().run()}
        className={cn("-mx-1 rounded-md px-1", canEdit ? "cursor-text" : "")}
      >
        <EditorContent editor={editor} />
      </div>
        </>
      ) : null}
    </section>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Saving...
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1 text-[12px] text-muted-foreground transition-opacity">
        <Check className="size-3" />
        Saved
      </span>
    );
  }
  return null;
}

function ToolbarSeparator() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />;
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink",
        active ? "bg-surface-2 text-ink" : ""
      )}
    >
      {icon}
    </button>
  );
}

function LinkToolbarButton({ editor, active }: { editor: Editor; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  function submitLink() {
    const trimmed = url.trim();
    if (trimmed) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setUrl((editor.getAttributes("link").href as string) ?? "");
      }}
    >
      <PopoverTrigger
        onMouseDown={(event) => event.preventDefault()}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink",
          active ? "bg-surface-2 text-ink" : ""
        )}
        title="Link"
        aria-label="Link"
      >
        <LinkIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submitLink();
          }}
        >
          <input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste a link..."
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2 text-[12px] text-ink outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
          <Button type="submit" size="sm" className="h-8 shrink-0 rounded-md text-[12px] !text-white">
            Apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function PeopleSummary({ people }: { people: UserIdentity[] }) {
  const visiblePeople = people.slice(0, 4);
  const hiddenPeople = people.slice(4);

  if (people.length === 0) {
    return <span className="text-[13px] text-muted-foreground">No participants added</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visiblePeople.map((participant) => (
        <UserChip key={participant.id} user={participant} />
      ))}
      {hiddenPeople.length > 0 ? (
        <Popover>
          <PopoverTrigger
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 text-[12px] font-medium text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label={`Show ${hiddenPeople.length} more people`}
          >
            <MoreHorizontal className="size-3.5" />
            <span>+{hiddenPeople.length}</span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[320px] rounded-xl border-border/70 p-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <p className="text-[13px] font-semibold text-ink">People</p>
                <p className="text-[11px] text-muted-foreground">{people.length} participants and invitees</p>
              </div>
              <InlineChip>{hiddenPeople.length} more</InlineChip>
            </div>
            <div className="mt-2 max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {people.map((participant) => (
                <UserRow key={participant.id} user={participant} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function UserChip({ user, compact = false }: { user: UserIdentity; compact?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface-1 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
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
              {user.workspaceRole ? <InlineChip>{user.workspaceRole}</InlineChip> : null}
              {user.membershipType ? <InlineChip>{normalizeLabel(user.membershipType)}</InlineChip> : null}
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
  roomParticipants: TranslationRoomParticipantDto[],
  invitations: TranslationRoomInvitationDto[],
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
      content: `Language scope: **${languageNames.join(", ") || "Not set"}**.`,
      metadata: [room.translationRoomCode],
    },
  ];

  const participantEvents = roomParticipants
    .filter((participant) => participant.joinedAt)
    .map((participant) => ({
      id: `participant-${participant.id}`,
      kind: "log" as const,
      title: "Participant joined",
      at: formatDateTime(participant.joinedAt),
      actor: participants.find((item) => item.id === participant.userId) ?? toUserIdentity(participant),
      accent: "muted" as const,
      content: `Joined with **${getLanguageName(participant.speakLanguage)}** speaking and **${getLanguageName(participant.listenLanguage)}** listening.`,
      metadata: [normalizeLabel(participant.status) ?? "Joined"],
    }));

  const invitationEvents = invitations.map((invitation) => ({
    id: `invitation-${invitation.id}`,
    kind: "log" as const,
    title: "Invitation updated",
    at: formatDateTime(invitation.updatedAt || invitation.createdAt),
    actor: hostUser,
    accent: "muted" as const,
    content: `Invitation for **${invitation.email}** is **${normalizeLabel(invitation.status) ?? "Pending"}**.`,
  }));

  events.push(...participantEvents, ...invitationEvents);

  if (room.startedAt) {
    events.push({
      id: "started",
      kind: "log",
      title: "Meeting started",
      at: formatDateTime(room.startedAt),
      actor: hostUser,
      accent: "success",
      content: "Realtime translation and transcript capture started.",
    });
  }

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

  return events.sort((left, right) => compareEventTime(left.at, right.at));
}

function buildUserList(
  room: TranslationRoomDto,
  participants: TranslationRoomParticipantDto[],
  invitations: TranslationRoomInvitationDto[],
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null
): UserIdentity[] {
  const mapped = participants.map((participant) => toUserIdentity(participant, membersArray, currentUser));
  if (!mapped.some((participant) => participant.id === room.hostId)) {
    const hostMember = findWorkspaceMember(room.hostId, membersArray, currentUser);
    mapped.unshift({
      id: room.hostId,
      name: resolveUserName(room.hostId, membersArray, currentUser),
      email: hostMember?.email ?? (room.hostId === currentUser?.id ? currentUser?.email : undefined),
      role: "Organizer",
      workspaceRole: hostMember?.roleName,
      membershipType: hostMember?.membershipType,
      status: "Organizer",
    });
  }

  for (const invitation of invitations) {
    const member = membersArray.find((item) => item.userId === invitation.email || item.id === invitation.email || item.email === invitation.email);
    const name = member?.fullName || invitation.email;
    if (!mapped.some((participant) => participant.email?.toLowerCase() === invitation.email.toLowerCase() || participant.id === invitation.email)) {
      mapped.push({
        id: invitation.id ?? invitation.email,
        name,
        email: invitation.email,
        role: "Invitee",
        workspaceRole: member?.roleName,
        membershipType: member?.membershipType,
        status: invitation.status ? invitation.status.toLowerCase() : "pending",
      });
    }
  }

  return dedupeRoomPeople(mapped);
}

function toUserIdentity(
  participant: TranslationRoomParticipantDto,
  membersArray: WorkspaceMemberDto[] = [],
  currentUser: UserDto | null = null
): UserIdentity {
  const member = findWorkspaceMember(participant.userId, membersArray, currentUser);
  const role = participant.role.toLowerCase() === "host" ? "Organizer" : normalizeLabel(participant.role);
  return {
    id: participant.userId || participant.id,
    name: resolveUserName(participant.userId, membersArray, currentUser, participant.displayName),
    email: member?.email,
    role,
    workspaceRole: member?.roleName,
    membershipType: member?.membershipType,
    status: normalizeLabel(participant.status),
    avatarUrl: participant.avatarUrl,
    speakLanguage: participant.speakLanguage,
    listenLanguage: participant.listenLanguage,
  };
}

function getHostUser(
  room: TranslationRoomDto,
  participants: UserIdentity[],
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null
) {
  const hostMember = findWorkspaceMember(room.hostId, membersArray, currentUser);
  return participants.find((participant) => participant.id === room.hostId) ?? {
    id: room.hostId,
    name: resolveUserName(room.hostId, membersArray, currentUser),
    email: hostMember?.email ?? (room.hostId === currentUser?.id ? currentUser?.email : undefined),
    role: "Organizer",
    workspaceRole: hostMember?.roleName,
    membershipType: hostMember?.membershipType,
    status: "Organizer",
  };
}

function findWorkspaceMember(
  userId: string | undefined,
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null
) {
  if (!userId) return undefined;
  return membersArray.find(
    (item) =>
      item.userId === userId ||
      item.id === userId ||
      item.email === userId ||
      (userId === currentUser?.id && item.email === currentUser.email)
  );
}

function dedupeRoomPeople(people: UserIdentity[]) {
  const seen = new Set<string>();
  const deduped: UserIdentity[] = [];

  for (const person of people) {
    const key = person.email?.toLowerCase() || person.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(person);
  }

  return deduped;
}

function sortRoomPeople(people: UserIdentity[], hostUser: UserIdentity) {
  return dedupeRoomPeople(people).sort((left, right) => {
    const leftRank = getRoomPeopleRank(left, hostUser);
    const rightRank = getRoomPeopleRank(right, hostUser);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.name.localeCompare(right.name);
  });
}

function getRoomPeopleRank(user: UserIdentity, hostUser: UserIdentity) {
  if (
    user.id === hostUser.id ||
    (Boolean(user.email && hostUser.email) && user.email?.toLowerCase() === hostUser.email?.toLowerCase()) ||
    user.role?.toLowerCase() === "organizer"
  ) {
    return 0;
  }

  const workspaceRole = user.workspaceRole?.toLowerCase() ?? "";
  const membershipType = user.membershipType?.toLowerCase() ?? "";

  if (workspaceRole === "owner") return 1;
  if (workspaceRole === "admin") return 2;
  if (membershipType === "internal" || workspaceRole) return 3;
  return 4;
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

function PropertyPanel({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex max-h-[min(560px,calc(100vh-5rem))] min-h-0 flex-col overflow-hidden rounded-[10px] border border-border bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all">
      <div className="flex min-h-11 shrink-0 items-center justify-between px-3">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-0.5 text-left text-[12px] font-semibold text-ink transition-colors hover:bg-surface-2 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-expanded={isOpen}
          aria-controls={`room-property-panel-${title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <span className="truncate">{title}</span>
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-200", isOpen ? "" : "-rotate-90")}
          />
        </button>
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label={`${title} options`}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      {isOpen ? (
        <div
          id={`room-property-panel-${title.toLowerCase().replace(/\s+/g, "-")}`}
          className="min-h-0 space-y-3 overflow-y-auto px-3 pb-3"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function AttendeesList({ attendees }: { attendees: UserIdentity[] }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-expanded={isOpen}
        aria-controls="room-attendees-panel"
      >
        <span>Attendees: {attendees.length}</span>
        <ChevronDown
          className={cn("size-3 transition-transform duration-200", isOpen ? "" : "-rotate-90")}
        />
      </button>
      {isOpen ? (
        <div id="room-attendees-panel" className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {attendees.length > 0 ? (
            attendees.map((participant) => <UserRow key={participant.id} user={participant} />)
          ) : (
            <p className="text-[12px] text-muted-foreground">No attendees yet.</p>
          )}
        </div>
      ) : null}
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
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2/70">
      <div className="min-w-0 flex-1">
        <UserChip user={user} compact />
      </div>
      {user.status ? <span className="max-w-[76px] shrink-0 truncate text-right text-[11px] text-muted-foreground">{user.status}</span> : null}
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

/** WT-14: only offer calendar export for a room that is still SCHEDULED and hasn't started yet. */
function isUpcomingScheduledRoom(room: TranslationRoomDto): boolean {
  return room.status === "scheduled" && Boolean(room.scheduledAt) && new Date(room.scheduledAt!).getTime() > Date.now();
}

function AddToCalendarMenu({ room }: { room: TranslationRoomDto }) {
  const joinLink = `${window.location.origin}/join?code=${room.translationRoomCode}`;

  function handleDownloadIcs() {
    const url = translationRoomService.getCalendarIcsUrl(room.id);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meeting.ics";
    link.click();
  }

  function handleAddToGoogleCalendar() {
    const url = buildGoogleCalendarUrl({
      title: room.title,
      scheduledAt: room.scheduledAt!,
      joinLink,
      description: room.description,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px] text-muted-foreground outline-none transition-colors hover:bg-surface-2">
        <CalendarPlus className="size-3.5" />
        <span className="text-foreground">Add to calendar</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={handleDownloadIcs}>
          <Download className="mr-2 size-3.5" />
          Download .ics
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleAddToGoogleCalendar}>
          <CalendarPlus className="mr-2 size-3.5" />
          Add to Google Calendar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

function KindChip({ kind }: { kind: ThreadKind }) {
  const config: Record<ThreadKind, { icon: ReactNode; label: string }> = {
    log: { icon: <Hash className="size-3.5" />, label: "Event" },
    note: { icon: <Hash className="size-3.5" />, label: "Note" },
    transcript: { icon: <MessageSquareText className="size-3.5" />, label: "Transcript" },
    system: { icon: <Hash className="size-3.5" />, label: "System" },
  };
  return <InlineChip icon={config[kind].icon}>{config[kind].label}</InlineChip>;
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

function resolveUserName(
  userId: string | undefined,
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null,
  fallback?: string
) {
  if (userId && userId === currentUser?.id) {
    return currentUser.fullName || currentUser.email || "Current user";
  }

  const member = userId
    ? membersArray.find((item) => item.userId === userId || item.id === userId || item.email === userId)
    : undefined;
  if (member?.fullName) return member.fullName;
  if (member?.email) return member.email;

  const normalizedFallback = fallback?.trim();
  if (normalizedFallback && normalizedFallback.toLowerCase() !== "host") {
    return normalizedFallback;
  }

  return "Organizer";
}

function formatDateTime(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

function compareEventTime(left?: string, right?: string) {
  const leftTime = left ? new Date(left).getTime() : Number.NaN;
  const rightTime = right ? new Date(right).getTime() : Number.NaN;
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
  return leftTime - rightTime;
}
