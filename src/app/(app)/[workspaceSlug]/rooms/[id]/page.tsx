"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
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
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Play,
  Quote,
  Star,
  StopCircle,
  Strikethrough,
  Underline as UnderlineIcon,
  Video,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Markdown } from "tiptap-markdown";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { useRoomOccupancy } from "@/hooks/use-room-occupancy";
import {
  useTranscriptByRoom,
  useTranscriptSegments,
} from "@/hooks/use-transcripts";
import {
  useEndTranslationRoom,
  useStartTranslationRoom,
  useTranslationRoom,
  useTranslationRoomInvitations,
  useTranslationRoomParticipants,
  useTranslationRoomSessions,
  useUpdateTranslationRoomSettings,
} from "@/hooks/use-translationRooms";
import { useWorkspaceMembers, useWorkspaces } from "@/hooks/use-workspace";
import { getErrorMessage } from "@/lib/errors";
import { getLanguageName } from "@/lib/languages";
import { saveBlobDownload } from "@/lib/download-artifact";
import {
  resolveRoomEntryIntent,
  type RoomEntryIntent,
} from "@/lib/translation-room-access";
import {
  groupSavedTranscriptSegments,
  groupSegmentsByTranslationSession,
  type TranslationSessionBlock,
} from "@/lib/transcript-display";
import { cn } from "@/lib/utils";
import {
  buildGoogleCalendarUrl,
  translationRoomService,
} from "@/services/translationRoom.service";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { UserDto } from "@/types/auth";
import type { TranscriptSegmentDto } from "@/types/transcript";
import type {
  TranslationRoomDto,
  TranslationRoomInvitationDto,
  TranslationRoomParticipantDto,
  TranslationRoomSessionDto,
  TranslationRoomStatus,
} from "@/types/translationRoom";
import type { WorkspaceMemberDto } from "@/types/workspace";
import { MeetingPropertiesPills } from "./MeetingPropertiesPills";

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
  const params = useParams<{ workspaceSlug: string; id: string }>();
  const workspaceSlug = params.workspaceSlug;
  const router = useRouter();
  const roomId = params.id;
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const invitationsQuery = useTranslationRoomInvitations(roomId);
  const endRoomMutation = useEndTranslationRoom();
  const startRoomMutation = useStartTranslationRoom();
  const updateRoomSettings = useUpdateTranslationRoomSettings();
  const user = useAuthStore((state) => state.user);

  const transcriptQuery = useTranscriptByRoom(roomId);
  const segmentsQuery = useTranscriptSegments(transcriptQuery.data?.id);
  const transcriptSegments = segmentsQuery.data?.items || [];

  const room = roomQuery.data;
  const apiParticipants = participantsQuery.data ?? [];
  const apiInvitations = invitationsQuery.data ?? [];
  const { data: workspaces } = useWorkspaces();
  const validWorkspaceId =
    room?.workspaceId &&
    room.workspaceId !== "00000000-0000-0000-0000-000000000000"
      ? room.workspaceId
      : workspaces?.items?.[0]?.id;
  const { data: members } = useWorkspaceMembers(validWorkspaceId || "");
  const membersArray = members?.items ?? [];

  // WT-274: the ONE read of "who is in this room" on this page. The header chip and the
  // Tracking panel both render off this object; neither one filters a status itself, which is
  // what let them show 1/100 and "Attendees: 0" at the same moment.
  const occupancy = useRoomOccupancy(room, participantsQuery.data ?? null);

  useRegisterAssistantContext(
    room
      ? {
          pageType: "room_detail",
          entityId: room.id,
          workspaceId: validWorkspaceId,
          snapshot: {
            title: room.title,
            status: room.status,
            participantCount: String(occupancy.seatCount),
          },
        }
      : null,
  );

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(`${label} copied`);
    setTimeout(() => setCopiedText(null), 2000);
  }

  if (!room) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-muted-foreground">
          Room information is unavailable.
        </p>
      </div>
    );
  }

  const isEnded = room.status === "ended";
  const isHost = room.hostId === user?.id || Boolean(room.isHost);
  // WT-273: the CTA is one decision, taken with the viewer's host identity in hand. It used to
  // be derived from room.status alone, three lines above where `isHost` was computed, so the
  // host was offered the lobby CTA and told to wait for himself.
  const entryIntent = resolveRoomEntryIntent({
    status: room.status,
    isHost,
    statusLabel: statusLabels[room.status],
    scheduledAtLabel: room.scheduledAt ? formatDateTime(room.scheduledAt) : null,
  });

  async function handleRoomEntry() {
    if (!room) return;
    switch (entryIntent.mode) {
      case "unavailable":
        return;
      case "host_start":
        // The host opens the room rather than queueing for it. Mirrors the lobby console's
        // own start action (rooms/[id]/waiting/page.tsx).
        try {
          await startRoomMutation.mutateAsync(room.id);
          router.push(`/room/${room.id}`);
        } catch (error) {
          toast.error(getErrorMessage(error, "Could not start the meeting."));
        }
        return;
      case "lobby":
        // WT-232: a room nobody has started yet has no call to join. Sending people through
        // device setup into an empty session was the confusing part of that report — the lobby
        // is where they actually wait, and it says so.
        router.push(`/${workspaceSlug}/rooms/${roomId}/waiting`);
        return;
      case "join":
        useUIStore.getState().setSetupRoomId(roomId);
        useUIStore.getState().setSetupRoomModalOpen(true);
    }
  }

  const participants = buildUserList(
    room,
    apiParticipants,
    apiInvitations,
    membersArray,
    user,
  );
  const hostUser = getHostUser(room, participants, membersArray, user);
  // WT-274: the Tracking panel's rows are the seat holders `occupancy` already resolved,
  // mapped through the same identity resolver the rest of the page uses. It does not re-decide
  // who counts.
  const seatedIdentities = occupancy.seated.map((participant) =>
    toUserIdentity(participant, membersArray, user),
  );
  const seatedIds = new Set(seatedIdentities.map((identity) => identity.id));
  const notInRoom = participants.filter(
    (participant) => !seatedIds.has(participant.id),
  );
  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-1 text-ink">
      {copiedText ? (
        <div className="fixed left-1/2 top-6 z-[100] -translate-x-1/2 rounded-md border border-border bg-surface-1 px-4 py-2 text-[13px] font-medium text-ink shadow-lg">
          {copiedText}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid min-h-full w-full max-w-[1500px] grid-cols-1 gap-8 px-6 py-8 xl:grid-cols-[minmax(0,1fr)_300px] xl:px-10">
          <main className="min-w-0">
            <div className="mb-8 flex flex-col gap-5 border-b border-border/60 pb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {/* WT-310(8): no breadcrumb here. The app shell's Topbar already renders
                      "Meetings / {room title}" for this exact route (see topbar.tsx's
                      Breadcrumbs, isRoomInformationPage), so this second copy printed the
                      identical trail one line below the first. The shell's is the one that
                      stays — it is present on every route, and it links to the list rather
                      than calling router.back(), which sent the user wherever they came
                      from instead of to Meetings. */}
                  <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-foreground">
                    {room.title}
                  </h1>
                  <MeetingPropertiesPills
                    room={room}
                    apiParticipants={apiParticipants}
                    occupancyLabel={occupancy.label}
                    user={user}
                    onCopy={handleCopy}
                  />
                </div>
                <div className="flex w-full max-w-[280px] shrink-0 flex-col items-end gap-2">
                  {/* WT-310(10): the status is rendered once, by MeetingPropertiesPills under
                      the title. A second StatusChip stood here, so the same room announced
                      "Waiting" twice on one screen in two different visual languages — a grey
                      chip up here and an amber pill down there — and a reader had no way to
                      know which was authoritative. The pills row keeps it: it is the same
                      StatusPanel the meetings list row uses, so the state a room shows in the
                      list is the state it shows when opened. */}
                  {/* WT-197: the primary action lives here, at the top of the page, next to the
                      title. It used to exist only in "Meeting access" — the last panel of a
                      sticky, independently scrolling right column — so it sat below the fold
                      with nothing on screen hinting that more content existed. A mentor lost
                      ~40 minutes hunting for it during a live demo.

                      WT-330: and now it lives here ONLY. WT-197 promoted a second copy rather
                      than moving the control, so the page offered the same lobby action twice —
                      once here and once at the bottom of the right column, where the original
                      still sat below the fold behind that column's own scrollbar. Two buttons
                      firing the same handler is not redundancy a reader can benefit from; it
                      reads as two different actions. The panel copy is gone, and `helpText`
                      came up here with it so the explanation stays attached to the control it
                      explains. */}
                  {entryIntent.isActionable ? (
                    <>
                      <RoomEntryButton
                        intent={entryIntent}
                        pending={startRoomMutation.isPending}
                        onActivate={handleRoomEntry}
                        className="h-9 px-4"
                      />
                      {entryIntent.helpText ? (
                        <p className="text-right text-[12px] leading-relaxed text-muted-foreground">
                          {entryIntent.helpText}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  {room.hostId === user?.id &&
                  (room.status === "scheduled" || room.status === "waiting") ? (
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

              {/* WT-330: "When" is the only metadata row left, and that is the point.
                  - "People" listed `participants` capped at 8. The right column's Tracking
                    panel renders the same identities through UserRow — which wraps the very
                    same UserChip popover — split into who holds a seat and who does not, and
                    with no cap. Every chip this row could show appears there, so deleting it
                    removes a duplicate, not a source.
                  - The location row answered with a hardcoded product string for a bridge that
                    does not exist. WT-310(6) had already caught that its location pin promised
                    a place and swapped the icon for a video glyph — which left a row asking
                    "where" and answering with a video chip, contradicting itself. The honest
                    fix is not a better icon; it is not claiming a location at all. */}
              <div className="grid gap-2 border-y border-border/60 py-2 text-[13px]">
                <MetadataRow icon={<Clock className="size-4" />} label="When">
                  <span>
                    {formatDateTime(room.scheduledAt ?? room.createdAt)}
                  </span>
                  {room.endedAt ? (
                    <span className="text-muted-foreground">
                      - {formatDateTime(room.endedAt)}
                    </span>
                  ) : null}
                </MetadataRow>
              </div>
            </div>

            <RoomNotesEditor
              key={room.id}
              initialContent={room.description ?? ""}
              canEdit={isHost}
              onSave={(html) =>
                updateRoomSettings.mutateAsync({
                  id: room.id,
                  data: { description: html },
                })
              }
            />

            {isEnded || transcriptSegments.length > 0 ? (
              <MeetingTranscriptArtifact
                segments={transcriptSegments}
                baseTime={
                  transcriptQuery.data?.createdAt ||
                  room.startedAt ||
                  room.createdAt
                }
                roomId={room.id}
                currentUserId={user?.id}
                isEnded={isEnded}
                onCopy={handleCopy}
              />
            ) : null}

          </main>

          {/* WT-330(8): the column no longer scrolls as one block. It used to be a single
              `xl:overflow-y-auto`, so the ONE thing that grows with the data — the invitee
              list — drove the scroll of everything: six invitees already pushed `Actions`
              215px below the fold, and thirty buried it entirely. The controls a host came
              here for cannot be a function of how many people were invited.

              Now the column is a flex stack that fits the viewport: `Actions` and `Meeting
              access` are fixed-size and pinned (`shrink-0`), and `Tracking` takes whatever
              height is left and scrolls its own body. That gives the roster a bounded area
              that GROWS on a tall screen instead of a hardcoded max-height that is wrong on
              every screen but one. Below `xl` the column is a normal stacked block and the
              page scrolls, so none of this applies — hence every class here is `xl:`. */}
          <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)] xl:overflow-hidden">
            <PropertyPanel
              title="Tracking"
              className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden"
              /* The one bounded scroll region. `overscroll-auto` is the default, restated:
                 chaining is what keeps this from trapping the page's scroll at its end. */
              bodyClassName="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-auto xl:pr-1"
            >
              <PropertyLine label="Organizer">
                <UserChip user={hostUser} compact />
              </PropertyLine>
              {/* WT-330(5): "Attendees" here was the page's only use of that word — every other
                  surface, and the seat rule itself, says "participants". One word, everywhere. */}
              <CollapsibleSection label={`Participants: ${occupancy.label}`}>
                {seatedIdentities.length > 0 ? (
                  seatedIdentities.map((participant) => (
                    <UserRow key={participant.id} user={participant} />
                  ))
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    Nobody is in the room right now.
                  </p>
                )}
              </CollapsibleSection>
              {notInRoom.length > 0 ? (
                <CollapsibleSection label={`Invited: ${notInRoom.length}`}>
                  {notInRoom.map((participant) => (
                    <UserRow key={participant.id} user={participant} />
                  ))}
                </CollapsibleSection>
              ) : null}
            </PropertyPanel>

            <PropertyPanel title="Actions" className="xl:shrink-0">
              <ActionButton
                icon={<Copy className="size-3.5" />}
                onClick={() =>
                  handleCopy(room.translationRoomCode, "Room code")
                }
              >
                Copy room code
              </ActionButton>
              {isHost ? (
                <ActionButton
                  icon={<LinkIcon className="size-3.5" />}
                  onClick={() =>
                    handleCopy(
                      `${window.location.origin}/join?code=${room.translationRoomCode}`,
                      "Invite link",
                    )
                  }
                >
                  Copy invite link
                </ActionButton>
              ) : null}
              {isUpcomingScheduledRoom(room) ? (
                <AddToCalendarMenu room={room} />
              ) : null}
              <ActionButton icon={<Star className="size-3.5" />}>
                Add to favorites
              </ActionButton>
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

            <PropertyPanel title="Meeting access" className="xl:shrink-0">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/70 p-3">
                <div className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-1 text-ink">
                  <Video className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">WarpTalk Session</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {room.translationRoomCode}
                  </p>
                </div>
              </div>
              {/* WT-330: the second RoomEntryButton stood here. See the header CTA above — the
                  control and its help text now live there, once. This panel keeps what is
                  actually specific to it: the session identity and the room code. */}
            </PropertyPanel>
          </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * WT-197 / WT-273: the room's primary action, rendered identically wherever it appears.
 *
 * It exists as a component because WT-197 puts a second copy of it in the page header — the
 * one place a visitor is guaranteed to be looking — while the "Meeting access" panel keeps
 * its own. Both are driven by the same `RoomEntryIntent`, so the label, the disabled state and
 * the action cannot drift between them.
 */
function RoomEntryButton({
  intent,
  pending,
  onActivate,
  className,
}: {
  intent: RoomEntryIntent;
  pending: boolean;
  onActivate: () => void;
  className?: string;
}) {
  const isStart = intent.mode === "host_start";

  return (
    <Button
      className={cn(
        "rounded-md text-[13px] !text-white [&_svg]:!text-white",
        className,
      )}
      disabled={!intent.isActionable || pending}
      onClick={onActivate}
    >
      {isStart ? <Play className="size-4" /> : null}
      {pending ? "Starting..." : intent.label}
      {isStart ? null : <ArrowRight className="size-4" />}
    </Button>
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
  roomId,
  currentUserId,
  isEnded,
  onCopy,
}: {
  segments: TranscriptSegmentDto[];
  baseTime?: string;
  roomId: string;
  currentUserId?: string;
  isEnded: boolean;
  onCopy: (text: string, label: string) => void;
}) {
  const ordered = [...segments].sort(
    (left, right) => left.sequenceOrder - right.sequenceOrder,
  );
  const grouped = groupSavedTranscriptSegments(ordered);
  const sessionsQuery = useTranslationRoomSessions(roomId);
  const blocks = groupSegmentsByTranslationSession(grouped, sessionsQuery.data ?? [], baseTime);
  const showSessionLabels = blocks.length > 1;
  const totalCount = grouped.length;
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
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-ink">
            Meeting transcript
          </h2>
          <InlineChip icon={<FileText className="size-3.5" />}>
            {isEnded ? "Saved" : "Live"} · {totalCount}{" "}
            {totalCount === 1 ? "entry" : "entries"}
          </InlineChip>
        </div>
        {totalCount > 0 ? (
          <button
            type="button"
            onClick={() => onCopy(assembleTranscriptText(blocks), "Transcript")}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Copy className="size-3.5" />
            Copy
          </button>
        ) : null}
      </div>

      {totalCount === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface-1 px-3.5 py-3 text-[13px] text-muted-foreground">
          {isEnded
            ? "No transcript was captured for this meeting."
            : "The transcript is saved here as the meeting is transcribed."}
        </div>
      ) : (
        <div className="space-y-1 rounded-xl border border-border bg-surface-1 p-4">
          {blocks.map((block) => (
            <div key={block.sessionNumber} className="space-y-2">
              {showSessionLabels ? (
                <TranscriptSessionDivider sessionNumber={block.sessionNumber} session={block.session} />
              ) : null}
              {block.segments.map((segment) => {
                const isSelf = Boolean(currentUserId) && segment.speakerParticipantId === currentUserId;
                return (
                  <div
                    key={segment.id}
                    className={`flex ${isSelf ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`flex max-w-[75%] flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}>
                      <div className={`flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground ${isSelf ? "flex-row-reverse" : ""}`}>
                        <span className="font-semibold text-ink">
                          {isSelf ? "You" : segment.speakerName || "Unknown speaker"}
                        </span>
                        <InlineChip>{segment.originalLanguage?.toUpperCase() || "?"}</InlineChip>
                        {base ? <span>{segmentTime(segment.startTimeMs)}</span> : null}
                      </div>
                      <div
                        className={`rounded-2xl px-3 py-2 ${
                          isSelf
                            ? "rounded-tr-sm bg-primary"
                            : "rounded-tl-sm border border-border bg-white"
                        }`}
                      >
                        <p className={`text-[13px] leading-6 ${isSelf ? "text-white" : "text-ink-subtle"}`}>
                          {segment.originalText}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TranscriptSessionDivider({
  sessionNumber,
  session,
}: {
  sessionNumber: number;
  session: TranslationRoomSessionDto | null;
}) {
  const started = session?.startedAt
    ? new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const ended = session?.endedAt
    ? new Date(session.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "now";

  return (
    <div className="flex items-center gap-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>
        Translation {sessionNumber}
        {started ? ` · ${started}–${ended}` : ""}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function assembleTranscriptText(blocks: TranslationSessionBlock<TranscriptSegmentDto>[]): string {
  const showSessionLabels = blocks.length > 1;
  return blocks
    .map((block) => {
      const lines = block.segments.map(
        (segment) =>
          `[${segment.speakerName || "Unknown"} (${(segment.originalLanguage || "").toUpperCase()})] ${segment.originalText}`,
      );
      if (!showSessionLabels) return lines.join("\n");
      return [`--- Translation ${block.sessionNumber} ---`, ...lines].join("\n");
    })
    .join("\n\n");
}

type SaveState = "idle" | "saving" | "saved";

// tiptap-markdown doesn't augment @tiptap/core's Storage type, so its storage key is untyped.
function getMarkdown(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
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
    [onSave],
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
        HTMLAttributes: {
          class: "text-primary underline underline-offset-2",
        },
      }),
      Placeholder.configure({
        placeholder: canEdit
          ? "Add agenda, context, decisions, or review notes..."
          : "No room notes yet.",
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
      saveTimeoutRef.current = setTimeout(
        () => flushSave(getMarkdown(editor)),
        900,
      );
    },
  });

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  // Flush any pending debounced save immediately when the editor loses focus,
  // so quickly navigating away doesn't drop the last edit.
  useEffect(() => {
    if (!editor) return;
    const handleBlur = ({ editor: instance }: { editor: Editor }) =>
      flushSave(getMarkdown(instance));
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

  return (
    <section className="border-b border-border/60 pb-7">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Room notes</h2>
        <SaveIndicator state={saveState} />
      </div>

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
              <DropdownMenuItem
                onClick={() => editor.chain().focus().setParagraph().run()}
              >
                Text
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
              >
                Heading 1
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
              >
                Heading 2
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 3 }).run()
                }
              >
                Heading 3
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolbarSeparator />

          <ToolbarButton
            label="Bold"
            icon={<Bold className="size-3.5" />}
            active={editorState?.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="Italic"
            icon={<Italic className="size-3.5" />}
            active={editorState?.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            label="Underline"
            icon={<UnderlineIcon className="size-3.5" />}
            active={editorState?.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            label="Strikethrough"
            icon={<Strikethrough className="size-3.5" />}
            active={editorState?.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />

          <ToolbarSeparator />

          <LinkToolbarButton editor={editor} active={editorState?.link} />

          <ToolbarSeparator />

          <ToolbarButton
            label="Quote"
            icon={<Quote className="size-3.5" />}
            active={editorState?.blockquote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            label="Inline code"
            icon={<Code className="size-3.5" />}
            active={editorState?.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <ToolbarButton
            label="Code block"
            icon={<Code2 className="size-3.5" />}
            active={editorState?.codeBlock}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          />

          <ToolbarSeparator />

          <ToolbarButton
            label="Bullet list"
            icon={<List className="size-3.5" />}
            active={editorState?.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="Numbered list"
            icon={<ListOrdered className="size-3.5" />}
            active={editorState?.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
        </BubbleMenu>
      ) : null}

      <div
        onClick={() => canEdit && editor?.chain().focus().run()}
        className={cn("-mx-1 rounded-md px-1", canEdit ? "cursor-text" : "")}
      >
        <EditorContent editor={editor} />
      </div>
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
        active ? "bg-surface-2 text-ink" : "",
      )}
    >
      {icon}
    </button>
  );
}

function LinkToolbarButton({
  editor,
  active,
}: {
  editor: Editor;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  function submitLink() {
    const trimmed = url.trim();
    if (trimmed) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: trimmed })
        .run();
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
          active ? "bg-surface-2 text-ink" : "",
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
          <Button
            type="submit"
            size="sm"
            className="h-8 shrink-0 rounded-md text-[12px] !text-white"
          >
            Apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function UserChip({
  user,
  compact = false,
}: {
  user: UserIdentity;
  compact?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          compact
            ? "h-6 px-1.5 pr-2 text-[11px]"
            : "h-7 px-2 pr-2.5 text-[12px]",
        )}
      >
        <AvatarInitial
          user={user}
          className={compact ? "size-4 text-[9px]" : "size-5 text-[10px]"}
        />
        <span className="truncate font-medium">{user.name}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[260px] rounded-xl border-border/70 p-3 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <AvatarInitial user={user} className="size-10 text-[14px]" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-ink">
              {user.name}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">
              {user.email ?? user.id}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.role ? <InlineChip>{user.role}</InlineChip> : null}
              {user.status ? <InlineChip>{user.status}</InlineChip> : null}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <div>
            <p>Speaks</p>
            <p className="mt-0.5 font-medium text-ink">
              {user.speakLanguage
                ? getLanguageName(user.speakLanguage)
                : "Not set"}
            </p>
          </div>
          <div>
            <p>Listens</p>
            <p className="mt-0.5 font-medium text-ink">
              {user.listenLanguage
                ? getLanguageName(user.listenLanguage)
                : "Not set"}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function buildUserList(
  room: TranslationRoomDto,
  participants: TranslationRoomParticipantDto[],
  invitations: TranslationRoomInvitationDto[],
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null,
): UserIdentity[] {
  const mapped = participants.map((participant) =>
    toUserIdentity(participant, membersArray, currentUser),
  );
  if (!mapped.some((participant) => participant.id === room.hostId)) {
    mapped.unshift({
      id: room.hostId,
      name: resolveUserName(room.hostId, membersArray, currentUser),
      email: room.hostId === currentUser?.id ? currentUser?.email : undefined,
      role: "Organizer",
      status: "Organizer",
    });
  }

  for (const invitation of invitations) {
    const member = membersArray.find(
      (item) =>
        item.userId === invitation.email ||
        item.id === invitation.email ||
        item.email === invitation.email,
    );
    const name = member?.fullName || invitation.email;
    // WT-191: match on email only. The previous check also compared against
    // participant.id, which is a user UUID and can never equal an email — and
    // toUserIdentity did not populate `email` at all, so nothing ever matched and
    // every invitee was appended a second time. That is what produced one row for
    // the participant ("Waiting"/"Left") and a duplicate for the invitation
    // ("pending"/"accepted") for the same person.
    const invitationEmail = invitation.email?.trim().toLowerCase();
    const alreadyListed = invitationEmail
      ? mapped.some(
          (participant) =>
            participant.email?.trim().toLowerCase() === invitationEmail,
        )
      : false;

    if (!alreadyListed) {
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

function toUserIdentity(
  participant: TranslationRoomParticipantDto,
  membersArray: WorkspaceMemberDto[] = [],
  currentUser: UserDto | null = null,
): UserIdentity {
  const role =
    participant.role.toLowerCase() === "host"
      ? "Organizer"
      : normalizeLabel(participant.role);
  return {
    id: participant.userId || participant.id,
    name: resolveUserName(
      participant.userId,
      membersArray,
      currentUser,
      participant.displayName,
    ),
    // WT-191: required for buildUserList to recognise that an invitee has already
    // joined. Without it every invitation was rendered as a second attendee row.
    email: resolveUserEmail(participant.userId, membersArray, currentUser),
    role,
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
  currentUser: UserDto | null,
) {
  return (
    participants.find((participant) => participant.id === room.hostId) ?? {
      id: room.hostId,
      name: resolveUserName(room.hostId, membersArray, currentUser),
      email: room.hostId === currentUser?.id ? currentUser?.email : undefined,
      role: "Organizer",
      status: "Organizer",
    }
  );
}

function MetadataRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-9 grid-cols-[28px_90px_minmax(0,1fr)] items-center gap-2">
      <div className="flex justify-center text-muted-foreground">{icon}</div>
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
        {children}
      </div>
    </div>
  );
}

function PropertyPanel({
  title,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  children: ReactNode;
  /** WT-330(8): lets the Tracking panel flex while Actions / Meeting access stay fixed. */
  className?: string;
  /** WT-330(8): lets the Tracking panel's body become the one bounded scroll region. */
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-surface-1 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {/* WT-310(7): the caret and the overflow dots are gone. Neither was a button — they were
          bare icons with no handler, no menu and no state — but they are the exact glyphs the
          rest of the app uses for "opens a menu", so "Tracking ⌄" and "Actions ⌄ ⋯" read as
          three controls per panel that did nothing when clicked. A panel heading that is only
          a heading is written as only a heading. */}
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <span className="flex items-center gap-1 px-0.5 text-[12px] font-medium text-muted-foreground">
          {title}
        </span>
      </div>
      <div className={cn("space-y-3", bodyClassName)}>{children}</div>
    </div>
  );
}

function PropertyLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * WT-330(6): a Tracking-panel section that actually opens and closes.
 *
 * The two headings this replaces drew a static `ChevronDown` and wired nothing to it. The
 * chevron is the app's own "this opens" glyph, so a reader who clicked it and got nothing had
 * been told the panel was broken. Now the whole heading is the trigger, the chevron rotates
 * with `data-panel-open`, and `aria-expanded` is handled by the primitive.
 *
 * Open by default: the roster is the reason the panel exists, so collapsing is the deliberate
 * act, not the resting state.
 *
 * WT-330(8): note what is deliberately NOT here — a `max-h` on the list.
 *
 * The growing list does need a bounded scroll area, but bounding it HERE was the wrong place.
 * A hardcoded height (210px, say) is wrong on every screen but the one it was measured on, and
 * with two of these sections plus ~500px of fixed panel chrome it still could not fit a 720px
 * viewport — `Actions` stayed below the fold. Worse, a scroll box inside the panel's own
 * scroll box is two nested scrollbars, which is the trap this was supposed to avoid.
 *
 * So the bound lives one level up: the Tracking panel's body is the single scroll region, and
 * it FLEXES — it takes whatever height the viewport leaves after the pinned Actions and
 * Meeting access panels, so it grows on a tall screen instead of being frozen at one guess.
 * Collapsing one section hands its space to the other, which is a real reason for item 6's
 * collapsing to exist rather than being decoration.
 */
function CollapsibleSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen className="space-y-2">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-md py-0.5 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <ChevronDown className="size-3 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-0 -rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="space-y-1.5">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function UserRow({ user }: { user: UserIdentity }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2/70">
      <UserChip user={user} compact />
      {user.status ? (
        <span className="truncate text-[11px] text-muted-foreground">
          {user.status}
        </span>
      ) : null}
    </div>
  );
}

function ActionButton({
  children,
  icon,
  destructive,
  disabled,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px] transition-colors hover:bg-surface-2 disabled:opacity-50",
        destructive
          ? "text-red-500 hover:bg-red-500/10"
          : "text-muted-foreground",
      )}
    >
      {icon}
      <span className={cn("text-foreground", destructive && "text-red-500")}>
        {children}
      </span>
    </button>
  );
}

/** WT-14: only offer calendar export for a room that is still SCHEDULED and hasn't started yet. */
function isUpcomingScheduledRoom(room: TranslationRoomDto): boolean {
  return (
    room.status === "scheduled" &&
    Boolean(room.scheduledAt) &&
    new Date(room.scheduledAt!).getTime() > Date.now()
  );
}

function AddToCalendarMenu({ room }: { room: TranslationRoomDto }) {
  const joinLink = `${window.location.origin}/join?code=${room.translationRoomCode}`;

  async function handleDownloadIcs() {
    const { data } = await translationRoomService.downloadCalendarIcs(room.id);
    saveBlobDownload(data, "meeting.ics");
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
        <DropdownMenuItem onClick={() => void handleDownloadIcs()}>
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

function InlineChip({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2 text-[11px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function AvatarInitial({
  user,
  className,
}: {
  user: UserIdentity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold uppercase text-primary",
        className,
      )}
    >
      {user.name?.charAt(0) || "U"}
    </span>
  );
}

function normalizeLabel(value?: string) {
  if (!value) return undefined;
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Best-effort email for a room participant. Participants only carry a user id, so an
 * invitation (which is keyed by email) can only be matched back to someone who already
 * joined by resolving that id through the workspace member list. Returns undefined for
 * guests and for members the caller cannot see — callers must treat that as "unknown",
 * never as "not the same person".
 */
function resolveUserEmail(
  userId: string | undefined,
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null,
): string | undefined {
  if (!userId) return undefined;
  if (userId === currentUser?.id) return currentUser?.email ?? undefined;

  const member = membersArray.find(
    (item) =>
      item.userId === userId || item.id === userId || item.email === userId,
  );
  return member?.email ?? undefined;
}

function resolveUserName(
  userId: string | undefined,
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null,
  fallback?: string,
) {
  if (userId && userId === currentUser?.id) {
    return currentUser.fullName || currentUser.email || "Current user";
  }

  const member = userId
    ? membersArray.find(
        (item) =>
          item.userId === userId || item.id === userId || item.email === userId,
      )
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
