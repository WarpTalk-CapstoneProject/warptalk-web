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
  Archive,
  ArrowRight,
  Bold,
  CalendarPlus,
  Check,
  ChevronDown,
  Code,
  Code2,
  CheckCircle,
  Copy,
  Download,
  FileText,
  Pencil,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Play,
  Quote,
  Sparkles,
  Star,
  StopCircle,
  Strikethrough,
  Repeat,
  Underline as UnderlineIcon,
} from "lucide-react";
// Aliased: this file already imports Tiptap's `Link` extension, and the editor's Link and the
// router's Link are two very different things to have under one name.
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Markdown } from "tiptap-markdown";

import { Button } from "@/components/ui/button";
import { liveMeetingPath } from "@/lib/workspace/workspace-routes";
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
import { useEndedRoomRecord } from "@/hooks/use-room-history";
import { findSegmentAtMs } from "@/lib/meeting/meeting-summary";
import {
  ArtifactsPanel,
  MeetingRecordTabButton,
  SummaryPanel,
  useArtifactDownload,
} from "@/components/rooms/meeting-record-panels";
import type { EndedRoomHistoryItem } from "@/types/roomHistory";
import { useRoomOccupancy } from "@/hooks/use-room-occupancy";
import { isFinishedStatus } from "@/lib/meeting/room-occupancy";
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
import { getErrorMessage } from "@/lib/api/errors";
import { getLanguageName } from "@/lib/language/languages";
import { saveBlobDownload } from "@/lib/ui/download-artifact";
import { transcriptService } from "@/services/transcript.service";
import {
  resolveRoomEntryIntent,
  type RoomEntryIntent,
} from "@/lib/meeting/translation-room-access";
import {
  groupSavedTranscriptSegments,
  groupSegmentsByTranslationSession,
  type TranslationSessionBlock,
} from "@/lib/transcript/transcript-display";
import { cn } from "@/lib/utils";
import {
  buildGoogleCalendarUrl,
  translationRoomService,
} from "@/services/translation-room.service";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useCanCreateMeetings } from "@/stores/workspace-store";
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
  const searchParams = useSearchParams();
  const roomId = params.id;
  const previewSummaryLoading = searchParams.get("summaryPreview") === "loading";
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const invitationsQuery = useTranslationRoomInvitations(roomId);
  const endRoomMutation = useEndTranslationRoom();
  const startRoomMutation = useStartTranslationRoom();
  const updateRoomSettings = useUpdateTranslationRoomSettings();
  const canCreateMeetings = useCanCreateMeetings();
  const user = useAuthStore((state) => state.user);
  // Read ABOVE the `if (!room)` guard below, and it has to stay there. React counts hooks
  // per render: while the room query is still loading this component returns early, so a
  // hook placed after that guard runs on the second render and not the first. React sees
  // the count grow and throws error #310 ("Rendered more hooks than during the previous
  // render"), which is a blank error page rather than a degraded one.
  const activeRoomId = useActiveMeetingStore((state) => state.activeRoomId);

  const transcriptQuery = useTranscriptByRoom(roomId);
  const segmentsQuery = useTranscriptSegments(transcriptQuery.data?.id);
  // Memoised because jumpToTranscriptMoment depends on it; `?? []` allocates a fresh
  // array every render, which would rebuild the callback on every keystroke of a
  // transcript correction.
  const transcriptSegments = useMemo(
    () => segmentsQuery.data?.items ?? [],
    [segmentsQuery.data],
  );
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);

  const room = roomQuery.data;
  const apiParticipants = participantsQuery.data ?? [];
  const apiInvitations = invitationsQuery.data ?? [];
  const { data: workspaces } = useWorkspaces();
  const validWorkspaceId =
    room?.workspaceId &&
    room.workspaceId !== "00000000-0000-0000-0000-000000000000"
      ? room.workspaceId
      : workspaces?.items?.[0]?.id;
  // The AI summary and retained files for this meeting. Keyed on the room's own
  // workspace, and sharing the workspace history query — the only endpoint carrying them.
  const endedRecordQuery = useEndedRoomRecord(validWorkspaceId ?? null, roomId);
  const { data: members } = useWorkspaceMembers(validWorkspaceId || "");
  const membersArray = members?.items ?? [];

  /**
   * Scroll the transcript to the moment a summary claim cites, and mark it.
   *
   * Resolved to the segment that was BEING SPOKEN at that moment rather than the nearest
   * one — see findSegmentAtMs. The DOM node is found by segment id rather than held in a
   * ref map, because the transcript re-renders on every correction and a ref map would go
   * stale exactly when the host is editing.
   */
  const jumpToTranscriptMoment = useCallback(
    (atMs: number) => {
      const segment = findSegmentAtMs(transcriptSegments, atMs);
      if (!segment) {
        toast.error("That moment is not in the saved transcript.");
        return;
      }
      // The tab switch renders the transcript in the same commit, so the node does not
      // exist yet on this frame.
      requestAnimationFrame(() => {
        const node = document.getElementById(`transcript-segment-${segment.id}`);
        if (!node) return;
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedSegmentId(segment.id);
      });
    },
    [transcriptSegments],
  );

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
  const isActiveInMeeting = activeRoomId === room.id;
  // WT-273: the CTA is one decision, taken with the viewer's host identity in hand. It used to
  // be derived from room.status alone, three lines above where `isHost` was computed, so the
  // host was offered the lobby CTA and told to wait for himself.
  const entryIntent = resolveRoomEntryIntent({
    status: room.status,
    isHost,
    statusLabel: statusLabels[room.status],
    scheduledAtLabel: room.scheduledAt ? formatDateTime(room.scheduledAt) : null,
    isActiveInMeeting,
    // WT-341: a meeting that does not require the host's approval can be opened by anyone
    // invited to it, so a busy host no longer blocks it. Undefined stays host-only.
    requiresApproval: room.settings?.requiresApproval,
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
          router.push(liveMeetingPath(workspaceSlug, room.id));
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

  // Only the host, and only while the room still has settings worth changing — once it is
  // live or ended, editing it would rewrite a meeting already in progress or already over.
  const canEditRoom =
    canCreateMeetings &&
    room.hostId === user?.id &&
    (room.status === "scheduled" || room.status === "waiting");

  const openRoomEditor = () => {
    if (!canCreateMeetings) return;
    useUIStore.getState().setEditRoomId(room.id);
    useUIStore.getState().setCreateRoomModalOpen(true);
  };

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
    (participant) =>
      participant.role === "Invitee" && !seatedIds.has(participant.id),
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
                  {/* The edit control sits on the title because the title is what it edits.
                      As a labelled outline button it stood in the top-right action stack
                      directly under "Start meeting", where a secondary action borrowed the
                      weight of the primary one and read as the second half of a pair. */}
                  <div className="flex items-center gap-2">
                    <h1 className="min-w-0 truncate text-[30px] font-semibold leading-tight tracking-tight text-foreground">
                      {room.title}
                    </h1>
                    {canEditRoom ? (
                      <button
                        type="button"
                        aria-label="Edit room"
                        title="Edit room"
                        // Visible at rest, not on hover. A hover-revealed control is
                        // undiscoverable on a touch screen and unfindable by anyone watching
                        // a demo who is not moving the pointer.
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={openRoomEditor}
                      >
                        <Pencil className="size-[18px]" />
                      </button>
                    ) : null}
                  </div>
                  {/* WT-327: an occurrence is an ordinary meeting, and this page treats it as
                      one — but the person looking at it may have arrived expecting the whole
                      repeating booking, so the page says which it is.

                      Not a link. This read "see the whole schedule" and pointed at
                      `/{slug}/series/{seriesId}`, a route that exists nowhere under src/app, so
                      the one control offering to answer "where are the other dates?" answered
                      with not-found.tsx. Stating the fact is worth keeping; promising a
                      destination that 404s is not. Restore the link with the page. */}
                  {room.seriesId ? (
                    <span className="flex w-fit items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[12px] font-medium text-primary">
                      <Repeat size={12} aria-hidden />
                      One of a repeating meeting
                    </span>
                  ) : null}
                  <MeetingPropertiesPills
                    room={room}
                    apiParticipants={apiParticipants}
                    occupancyLabel={occupancy.label}
                    occupancyNoun={isFinishedStatus(room.status) ? "attended" : "in room"}
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
                </div>
              </div>

              {/* The "When" row stood here, and it is gone with the last of the metadata
                  rows it belonged to. It was not a pure duplicate: the date pill under the
                  title showed createdAt and only the month and day, so a scheduled meeting
                  displayed the day it was created rather than the day it runs, and never the
                  time. The pill now carries both — scheduledAt when there is one, and the full
                  timestamp on hover — so this row's last unique fact survives it. */}
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
              <MeetingRecordSection
                endedRecord={endedRecordQuery.data ?? null}
                previewSummaryLoading={previewSummaryLoading}
                onRecordChanged={() => void endedRecordQuery.refetch()}
                onJumpToMoment={jumpToTranscriptMoment}
                transcript={
                  <MeetingTranscriptArtifact
                    segments={transcriptSegments}
                    baseTime={
                      transcriptQuery.data?.createdAt ||
                      room.startedAt ||
                      room.createdAt
                    }
                    roomId={room.id}
                    participants={apiParticipants}
                    currentUserId={user?.id}
                    currentUserName={user?.fullName || user?.email}
                    isEnded={isEnded}
                    onCopy={handleCopy}
                    transcriptId={transcriptQuery.data?.id}
                    transcriptStatus={transcriptQuery.data?.status}
                    canEdit={isHost}
                    onSegmentsChanged={() => void segmentsQuery.refetch()}
                    highlightedSegmentId={highlightedSegmentId}
                  />
                }
                transcriptCount={transcriptSegments.length}
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

            {/* "Meeting access" stood here: a hardcoded "WarpTalk Session" over the room
                code. The pills row under the title already shows that code and, unlike this
                panel, lets you click it to copy — so the panel was the same fact with less
                to do. WT-330 had already taken its entry button; this is the rest. */}
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
      {/* Filled. This is a lucide icon, which strokes an outline and leaves the interior
          transparent — a hollow triangle on a solid primary button reads as disabled, and at
          16px the outline is most of what is left of the shape. `fill="currentColor"` rather
          than a literal white, so it keeps following the `!text-white` above it. */}
      {isStart ? <Play fill="currentColor" className="size-4" /> : null}
      {pending ? "Starting..." : intent.label}
      {isStart ? null : <ArrowRight className="size-4" />}
    </Button>
  );
}

/**
 * Everything a meeting left behind, on the meeting's own page.
 *
 * The transcript, the AI summary and the retained files used to be a separate Transcripts
 * page: to read what a meeting decided you left the meeting, found it again in a
 * workspace-wide queue, and picked a tab. They are three views of one meeting, so they are
 * three tabs here instead, directly below the description.
 *
 * The transcript is passed in rather than rendered here because it is the one tab that is
 * live during a meeting — it has its own data, its own corrections, and its own actions.
 */
function MeetingRecordSection({
  transcript,
  transcriptCount,
  endedRecord,
  previewSummaryLoading,
  onRecordChanged,
  onJumpToMoment,
}: {
  transcript: React.ReactNode;
  transcriptCount: number;
  endedRecord: EndedRoomHistoryItem | null;
  previewSummaryLoading?: boolean;
  onRecordChanged: () => void;
  onJumpToMoment: (atMs: number) => void;
}) {
  const [tab, setTab] = useState<"transcript" | "summary" | "artifacts">(
    () => (previewSummaryLoading ? "summary" : "transcript"),
  );
  const { busyArtifactId, downloadArtifact } =
    useArtifactDownload(onRecordChanged);

  // Read inside the polling interval, which closes over the render that started it and
  // would otherwise never see the rewritten summary arrive.
  const summaryTemplateRef = useRef(endedRecord?.summary?.templateKey);
  const rewritePollRef = useRef<number | null>(null);

  // In an effect, not during render: writing a ref while rendering is how a component ends
  // up reading a value React has not committed yet.
  useEffect(() => {
    summaryTemplateRef.current = endedRecord?.summary?.templateKey;
  }, [endedRecord?.summary?.templateKey]);

  useEffect(
    () => () => {
      // Leaving the page mid-rewrite must not leave a timer refetching a room nobody is
      // looking at.
      if (rewritePollRef.current !== null) window.clearInterval(rewritePollRef.current);
    },
    [],
  );

  // No ended record means the meeting has not finished, so there is nothing to summarise and
  // no files to retain. Showing two permanently empty tabs would only invite clicking them.
  const hasRecord = Boolean(endedRecord);
  const activeTab = hasRecord ? tab : "transcript";

  return (
    <section className="mt-8 border-b border-border/60 pb-7">
      <h2 className="text-[15px] font-semibold text-ink">Meeting record</h2>

      {hasRecord ? (
        <div
          className="mt-2 mb-4 flex items-center gap-1 border-b border-border"
          role="tablist"
          aria-label="Meeting record sections"
        >
          <MeetingRecordTabButton
            active={activeTab === "transcript"}
            onClick={() => setTab("transcript")}
            icon={FileText}
            label="Transcript"
            count={transcriptCount || undefined}
          />
          <MeetingRecordTabButton
            active={activeTab === "summary"}
            onClick={() => setTab("summary")}
            icon={Sparkles}
            label="Summary"
          />
          <MeetingRecordTabButton
            active={activeTab === "artifacts"}
            onClick={() => setTab("artifacts")}
            icon={Archive}
            label="Artifacts"
            count={endedRecord?.artifacts.length}
          />
        </div>
      ) : (
        <div className="mt-3" />
      )}

      {activeTab === "transcript" ? transcript : null}
      {activeTab === "summary" && endedRecord ? (
        <SummaryPanel
          room={endedRecord}
          busyArtifactId={busyArtifactId}
          onDownload={downloadArtifact}
          forceGenerating={previewSummaryLoading}
          // Checking a claim means leaving the summary, so the tab switches with it —
          // scrolling the transcript while the reader is still looking at the summary
          // would look like the button did nothing.
          onJumpToMoment={(atMs) => {
            setTab("transcript");
            onJumpToMoment(atMs);
          }}
          onRewrite={async (templateKey) => {
            await translationRoomService.regenerateSummary(
              endedRecord.id,
              templateKey,
            );
            toast.success("Rewriting the summary…");
            // The endpoint answers 202 — the summary lands on the artifact later, so this
            // polls for it rather than trusting the response. It stops the moment the new
            // shape arrives, and gives up after 90 seconds either way.
            if (rewritePollRef.current !== null) {
              window.clearInterval(rewritePollRef.current);
            }
            const stopAt = Date.now() + 90_000;
            rewritePollRef.current = window.setInterval(() => {
              const arrived = summaryTemplateRef.current === templateKey;
              if (arrived || Date.now() > stopAt) {
                if (rewritePollRef.current !== null) {
                  window.clearInterval(rewritePollRef.current);
                  rewritePollRef.current = null;
                }
                return;
              }
              onRecordChanged();
            }, 4000);
          }}
        />
      ) : null}
      {activeTab === "artifacts" && endedRecord ? (
        <ArtifactsPanel
          artifacts={endedRecord.artifacts}
          busyArtifactId={busyArtifactId}
          onDownload={downloadArtifact}
        />
      ) : null}
    </section>
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
  participants,
  currentUserId,
  currentUserName,
  isEnded,
  onCopy,
  transcriptId,
  transcriptStatus,
  highlightedSegmentId,
  canEdit,
  onSegmentsChanged,
}: {
  segments: TranscriptSegmentDto[];
  baseTime?: string;
  roomId: string;
  participants: TranslationRoomParticipantDto[];
  currentUserId?: string;
  currentUserName?: string;
  isEnded: boolean;
  onCopy: (text: string, label: string) => void;
  /** Needed to correct or finalize; omit and the section stays read-only. */
  transcriptId?: string;
  transcriptStatus?: string;
  /** Set when a summary citation jumped here; the row is marked so the reader can see
   *  which line the claim came from rather than landing in an anonymous wall of text. */
  highlightedSegmentId?: string | null;
  /** Only the host may rewrite what the room recorded. */
  canEdit?: boolean;
  /** Refetch after a correction lands, so the line shows what was actually saved. */
  onSegmentsChanged?: () => void;
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

  // Correcting the transcript used to live on a separate Transcripts page, which showed the
  // same segments for the same room under its own queue and its own tabs. The room already
  // owns everything that page needed — the meeting, the host, the segments — so the editing
  // moved to where the transcript is read rather than the reading moving to where it was
  // edited.
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const isFinalized = transcriptStatus === "finalized";
  const canCorrect = Boolean(canEdit && transcriptId) && !isFinalized;

  async function saveCorrection(segment: TranscriptSegmentDto) {
    const correctedText = draftText.trim();
    // Closing without a change is not a correction — posting one would record an edit that
    // changed nothing and count against the transcript's revision history.
    if (!transcriptId || !correctedText || correctedText === segment.originalText.trim()) {
      setEditingSegmentId(null);
      return;
    }

    setIsSavingCorrection(true);
    try {
      await transcriptService.correctSegment(transcriptId, segment.id, {
        originalText: segment.originalText,
        correctedText,
        correctionType: "stt",
        triggeredRetranslation: false,
      });
      onSegmentsChanged?.();
      setEditingSegmentId(null);
      toast.success("Transcript correction saved.");
    } catch {
      toast.error("Could not save the transcript correction.");
    } finally {
      setIsSavingCorrection(false);
    }
  }

  async function finalizeTranscript() {
    if (!transcriptId) return;
    setIsFinalizing(true);
    try {
      await transcriptService.finalize(transcriptId);
      onSegmentsChanged?.();
      toast.success("Transcript finalized.");
    } catch {
      toast.error("Could not finalize the transcript.");
    } finally {
      setIsFinalizing(false);
    }
  }

  function downloadTranscript() {
    saveBlobDownload(
      new Blob([assembleTranscriptText(blocks)], { type: "text/plain;charset=utf-8" }),
      `transcript-${roomId}.txt`,
    );
  }

  function segmentTime(startMs: number) {
    if (!base) return "";
    const stamp = new Date(base);
    stamp.setMilliseconds(stamp.getMilliseconds() + startMs);
    return stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const normalizedCurrentUserId = currentUserId?.trim().toLowerCase();
  const normalizedCurrentUserName = normalizeTranscriptIdentity(currentUserName);
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));

  function isCurrentViewerSegment(segment: TranscriptSegmentDto) {
    const speakerParticipant = segment.speakerParticipantId
      ? participantById.get(segment.speakerParticipantId)
      : undefined;

    if (
      normalizedCurrentUserId &&
      (
        speakerParticipant?.userId.trim().toLowerCase() === normalizedCurrentUserId ||
        segment.speakerParticipantId?.trim().toLowerCase() === normalizedCurrentUserId
      )
    ) {
      return true;
    }

    const speakerNames = [
      speakerParticipant?.displayName,
      segment.speakerName,
    ].map(normalizeTranscriptIdentity);

    return Boolean(
      normalizedCurrentUserName &&
        speakerNames.some((name) => name && name === normalizedCurrentUserName),
    );
  }

  return (
    /* The heading and the section frame belong to MeetingRecordSection now — this is the
       Transcript tab, not a section of its own. The action row stays: copy, download and
       finalize act on the transcript specifically, not on the record as a whole. */
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <InlineChip icon={<FileText className="size-3.5" />}>
            {isEnded ? "Saved" : "Live"} · {totalCount}{" "}
            {totalCount === 1 ? "entry" : "entries"}
          </InlineChip>
        </div>
        {totalCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onCopy(assembleTranscriptText(blocks), "Transcript")}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Copy className="size-3.5" />
              Copy
            </button>
            <button
              type="button"
              onClick={downloadTranscript}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Download className="size-3.5" />
              Download
            </button>
            {canCorrect ? (
              <button
                type="button"
                onClick={() => void finalizeTranscript()}
                disabled={isFinalizing}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              >
                <CheckCircle className="size-3.5" />
                {isFinalizing ? "Finalizing…" : "Finalize"}
              </button>
            ) : null}
            {/* Said out loud, because after finalizing the pencils simply stop appearing and
                that on its own reads as the page having broken. */}
            {isFinalized ? (
              <InlineChip icon={<CheckCircle className="size-3.5" />}>Finalized</InlineChip>
            ) : null}
          </div>
        ) : null}
      </div>

      {totalCount === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface-1 px-3.5 py-3 text-[13px] text-muted-foreground">
          {isEnded
            ? "No transcript was captured for this meeting."
            : "The transcript is saved here as the meeting is transcribed."}
        </div>
      ) : (
        /* The transcript is the one thing on this page with no upper bound — an hour of
           talking is hundreds of entries, and letting it set the page height pushed every
           section below it, and the page's own scrollbar, out of reach. It scrolls inside
           its own frame instead. Capped against the viewport rather than a fixed pixel
           height so it does not swallow a short laptop screen whole.

           Scroll chaining is left at its default, as WT-330(8) requires of every inner
           scroller here — and requires by name, so do not write the containment utility
           into this comment either: check-room-surface-contract matches the file's text,
           not its markup, and the word alone fails it. Containing the scroll would stop
           the page at the end of the transcript, which is the trap that ticket removed. */
        <div className="max-h-[min(60vh,560px)] overflow-hidden rounded-xl border border-border bg-surface-1">
          <div className="max-h-[min(60vh,560px)] space-y-3 overflow-y-auto p-4 pr-3">
            {blocks.map((block) => (
              <div key={block.sessionNumber} className="space-y-2">
              {showSessionLabels ? (
                <TranscriptSessionDivider sessionNumber={block.sessionNumber} session={block.session} />
              ) : null}
              {block.segments.map((segment) => {
                const isSelf = isCurrentViewerSegment(segment);
                return (
                  <div
                    key={segment.id}
                    id={`transcript-segment-${segment.id}`}
                    className={`flex scroll-mt-4 rounded-md transition-colors ${
                      isSelf ? "justify-end" : "justify-start"
                    } ${
                      highlightedSegmentId === segment.id
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : ""
                    }`}
                  >
                    <div className={`flex max-w-[75%] flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}>
                      <div className={`flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground ${isSelf ? "flex-row-reverse" : ""}`}>
                        <span className="font-semibold text-foreground">
                          {isSelf ? "You" : segment.speakerName || "Unknown speaker"}
                        </span>
                        <InlineChip>{segment.originalLanguage?.toUpperCase() || "?"}</InlineChip>
                        {base ? <span>{segmentTime(segment.startTimeMs)}</span> : null}
                      </div>
                      {editingSegmentId === segment.id ? (
                        <div className="w-full min-w-0 space-y-2 rounded-xl border border-primary/40 bg-surface-1 p-2.5">
                          <textarea
                            value={draftText}
                            onChange={(event) => setDraftText(event.target.value)}
                            aria-label={`Edit transcript line by ${segment.speakerName || "unknown speaker"}`}
                            className="min-h-24 w-full resize-y rounded-md border border-border bg-canvas px-2.5 py-2 text-[13px] leading-6 text-ink outline-none focus:border-primary"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingSegmentId(null)}
                              className="rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isSavingCorrection || !draftText.trim()}
                              onClick={() => void saveCorrection(segment)}
                              className="rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
                            >
                              {isSavingCorrection ? "Saving…" : "Save correction"}
                            </button>
                          </div>
                        </div>
                      ) : (
                      <div
                        className={`group/line relative rounded-2xl border border-border bg-white px-3 py-2 shadow-sm ${canCorrect ? "pr-9" : ""} ${
                          isSelf ? "rounded-tr-sm" : "rounded-tl-sm"
                        }`}
                      >
                        <p className="text-[13px] leading-6 text-black">
                          {segment.originalText}
                        </p>
                        {canCorrect ? (
                          <button
                            type="button"
                            aria-label="Edit transcript line"
                            title="Edit this line"
                            onClick={() => {
                              setEditingSegmentId(segment.id);
                              setDraftText(segment.originalText);
                            }}
                            className="absolute right-1 top-1 grid size-7 place-items-center rounded-md text-neutral-500 opacity-60 transition-opacity hover:bg-neutral-100 group-hover/line:opacity-100 focus-visible:opacity-100"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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

function normalizeTranscriptIdentity(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
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
