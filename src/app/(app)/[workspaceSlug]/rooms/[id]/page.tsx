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
  ClipboardList,
  Code,
  Code2,
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
import { useParams, useRouter } from "next/navigation";
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
  MeetingRecordingPlayer,
  type SeekRequest,
  SummaryPanel,
  useArtifactDownload,
} from "@/components/rooms/meeting-record-panels";
import { MeetingFeedbackMenu } from "@/components/rooms/feedback-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MeetingTranscriptArtifact } from "@/components/rooms/meeting-transcript-panel";
import { MinutesPanel } from "@/components/rooms/minutes-panel";
import { groupSavedTranscriptSegments } from "@/lib/transcript/transcript-display";
import { findPlayableRecording } from "@/lib/meeting/meeting-artifacts";
import { canAlignToRecording, seekTargetSeconds } from "@/lib/meeting/recording-seek";
import {
  describeRecordSharing,
  isRecordShared,
  nextArtifactAccess,
} from "@/lib/meeting/record-sharing";
import type { EndedRoomHistoryItem } from "@/types/roomHistory";
import { useRoomOccupancy } from "@/hooks/use-room-occupancy";
import { isFinishedStatus } from "@/lib/meeting/room-occupancy";
import { looksLikeRoomId } from "@/lib/meeting/room-code-guess";
import {
  useTranscriptByRoom,
  useTranscriptSegments,
  useTranscriptTranslations,
} from "@/hooks/use-transcripts";
import {
  useEndTranslationRoom,
  useSetArtifactAccess,
  useStartTranslationRoom,
  useTranslationRoom,
  useTranslationRoomInvitations,
  useTranslationRoomParticipants,
  useUpdateTranslationRoomSettings,
} from "@/hooks/use-translationRooms";
import { useWorkspaceMembers, useWorkspaces } from "@/hooks/use-workspace";
import { getErrorMessage } from "@/lib/api/errors";
import { getLanguageName } from "@/lib/language/languages";
import { saveBlobDownload } from "@/lib/ui/download-artifact";
import {
  resolveRoomEntryIntent,
  type RoomEntryIntent,
} from "@/lib/meeting/translation-room-access";
import { cn } from "@/lib/utils";
import {
  buildGoogleCalendarUrl,
  translationRoomService,
} from "@/services/translation-room.service";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { UserDto } from "@/types/auth";
import type { TranscriptSegmentDto } from "@/types/transcript";
import type {
  TranslationRoomDto,
  TranslationRoomInvitationDto,
  TranslationRoomParticipantDto,
  TranslationRoomStatus,
} from "@/types/translationRoom";
import type { WorkspaceMemberDto } from "@/types/workspace";
import { RoomRecurrenceLine } from "@/components/rooms/room-recurrence-line";
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
  // WT-433: the "Ask to join" button's in-flight state.
  const [askingToJoin, setAskingToJoin] = useState(false);

  const roomQuery = useTranslationRoom(roomId);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const invitationsQuery = useTranslationRoomInvitations(roomId);
  const endRoomMutation = useEndTranslationRoom();
  const startRoomMutation = useStartTranslationRoom();
  const updateRoomSettings = useUpdateTranslationRoomSettings();
  const user = useAuthStore((state) => state.user);

  const transcriptQuery = useTranscriptByRoom(roomId);
  const segmentsQuery = useTranscriptSegments(transcriptQuery.data?.id);
  // What the meeting was translated into while it ran. Read here rather than inside the
  // transcript panel so it sits above the `if (!room)` return with the other transcript
  // reads — see the note on `activeRoomId` below for why the position is not a style choice.
  const translationsQuery = useTranscriptTranslations(transcriptQuery.data?.id);
  // Memoised because jumpToTranscriptMoment depends on it; `?? []` allocates a fresh
  // array every render, which would rebuild the callback on every keystroke of a
  // transcript correction.
  const transcriptSegments = useMemo(
    () => segmentsQuery.data?.items ?? [],
    [segmentsQuery.data],
  );
  const transcriptTranslations = useMemo(
    () => translationsQuery.data?.items ?? [],
    [translationsQuery.data],
  );
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);
  const [seek, setSeek] = useState<SeekRequest | null>(null);

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
   * Faces for the transcript, by user id.
   *
   * The member list is the only place one exists: transcript_segments records who spoke as a user
   * id, and the participants API carries no avatar at all — the same join the live meeting does in
   * lib/meeting/participant-identity. Somebody who was in the meeting and is not a member of this
   * workspace simply is not in here, and falls back to their initials.
   */
  const speakerDirectory = useMemo(
    () =>
      Object.fromEntries(
        (members?.items ?? []).map((member) => [
          member.userId,
          { fullName: member.fullName, avatarUrl: member.avatarUrl },
        ]),
      ),
    // On members?.items, not on the `?? []` above it: that default is a fresh array every render,
    // so the memo would rebuild the directory on each one and hand the transcript a new object
    // to re-render against.
    [members?.items],
  );

  /**
   * Scroll the transcript to the moment a summary claim cites, and mark it.
   *
   * Resolved to the segment that was BEING SPOKEN at that moment rather than the nearest
   * one — see findSegmentAtMs. The DOM node is found by segment id rather than held in a
   * ref map, because the transcript re-renders on every correction and a ref map would go
   * stale exactly when the host is editing.
   */
  // The two origins WT-473 stored for exactly this. Either missing means the transcript cannot be
  // aligned to the recording at all, and recording-seek.ts refuses rather than guessing.
  const seekSources = useMemo(
    () => ({
      timelineAnchorAt: transcriptQuery.data?.timelineAnchorAt ?? null,
      recordingStartedAt:
        findPlayableRecording(endedRecordQuery.data?.artifacts)?.recordingStartedAt ?? null,
    }),
    [transcriptQuery.data?.timelineAnchorAt, endedRecordQuery.data?.artifacts],
  );

  /** Move the recording to a meeting moment. Silent when the clocks cannot be reconciled. */
  const requestSeek = useCallback(
    (atMs: number) => {
      const seconds = seekTargetSeconds(seekSources, atMs);
      if (seconds === null) return;
      // A token, so clicking the SAME line twice seeks twice — the viewer has scrubbed away since.
      setSeek({ seconds, token: Date.now() });
    },
    [seekSources],
  );

  /**
   * What the Transcript tab counts — the entries it actually shows.
   *
   * It counted raw saved segments, and the panel below it counts what a person can read: a tab
   * reading "Transcript (200)" opened onto "Saved · 145 entries". Both numbers were true and
   * they answer different questions. Rows in the table are not utterances — the same function
   * that draws the list drops control markers like __MEETING_END__ and merges the consecutive
   * segments that make up one continuous piece of speech.
   *
   * A tab label is a promise about what is behind it, so it counts through the same function
   * rather than a second, cheaper approximation of it.
   *
   * The function is imported here even though the panel that draws the list now lives in its own
   * file: what makes the two numbers agree is that they are produced by the SAME grouping, and a
   * count passed back up out of the panel would be a second claim rather than the same one.
   */
  const transcriptEntryCount = useMemo(
    () =>
      groupSavedTranscriptSegments(
        [...transcriptSegments].sort(
          (left, right) => left.sequenceOrder - right.sequenceOrder,
        ),
      ).length,
    [transcriptSegments],
  );

  /**
   * Whether this meeting captured any transcript — `undefined` until that is actually known.
   *
   * The summary is made out of the transcript, and the AI worker returns before the model when
   * the meeting produced no substantive speech. So a meeting with no transcript is not waiting
   * on a summary; nothing is coming. Reported here rather than guessed at in the panel, because
   * only this page knows whether the two queries have settled — and an empty list that is merely
   * un-fetched must never be read as a meeting nobody spoke in.
   */
  const hasTranscript = useMemo(() => {
    if (transcriptQuery.isSuccess && !transcriptQuery.data) return false;
    if (!transcriptQuery.data?.id) return undefined;
    if (!segmentsQuery.isSuccess) return undefined;
    return transcriptEntryCount > 0;
  }, [
    transcriptQuery.isSuccess,
    transcriptQuery.data,
    segmentsQuery.isSuccess,
    transcriptEntryCount,
  ]);

  const jumpToTranscriptMoment = useCallback(
    (atMs: number) => {
      // Both, and the seek first: it is the part with nothing on screen to acknowledge it, so it
      // must not wait behind a scroll animation.
      requestSeek(atMs);
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
    [transcriptSegments, requestSeek],
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

  // Read ABOVE the `if (!room)` guard below, and it has to stay there. React counts hooks
  // per render: while the room query is still loading this component returns early, so a
  // hook placed after that guard runs on the second render and not the first. React sees
  // the count grow and throws error #310 ("Rendered more hooks than during the previous
  // render"), which is a blank error page rather than a degraded one — the whole room
  // detail route died on every fresh load.
  const activeRoomId = useActiveMeetingStore((state) => state.activeRoomId);

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(`${label} copied`);
    setTimeout(() => setCopiedText(null), 2000);
  }

  if (!room) {
    // WT-433 (Linear): one blanket sentence used to cover loading, refusal AND network error.
    // The refusal case is the important one — the detail read answers 404 for a workspace
    // member who was never invited (deliberately indistinguishable from a missing room, WT-334),
    // and this page rendered that as a dead end. The waiting-room path exists; this hands them
    // the door instead of the wall.
    if (roomQuery.isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-[13px] text-muted-foreground">Loading room…</p>
        </div>
      );
    }

    // WT-528: an OLD LINK is not a refusal, and must not be reported as one.
    //
    // `/room/{x}` and `/rooms/{x}` forward their segment here verbatim, and server-built
    // invitation and reminder links used to carry the room CODE. A code can never resolve on
    // this page, so the room read failed and this branch blamed the viewer's access — the room
    // was fine and only the identifier was of the wrong kind. It then offered "Ask to join",
    // which POSTs the code to an endpoint whose Guid binding answers 400 in a shape the client
    // cannot parse, so the toast fell back to "This room is not available to join." — the
    // sentence in the report.
    //
    // The links are fixed at the source, but ones already sent still carry codes.
    if (!looksLikeRoomId(roomId)) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="text-[13px] text-muted-foreground">
              This meeting link is out of date, so we can&rsquo;t open the room from it. Open the
              meeting from your Meetings list, or ask whoever invited you to share it again.
            </p>
            <Button size="sm" onClick={() => router.push(`/${workspaceSlug}/rooms`)}>
              Go to Meetings
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-[13px] text-muted-foreground">
            You don&rsquo;t have access to this room yet. If a teammate shared this link with
            you, you can ask the host to let you in.
          </p>
          <Button
            size="sm"
            disabled={askingToJoin}
            onClick={async () => {
              setAskingToJoin(true);
              try {
                await translationRoomService.joinById(roomId, {
                  displayName: user?.fullName || user?.email || "Participant",
                  speakLanguage: "vi",
                  listenLanguage: "vi",
                });
                router.push(`/${workspaceSlug}/rooms/${roomId}/waiting`);
              } catch (error) {
                // A non-member of the workspace gets the same 404 the detail read gave — the
                // room genuinely is not theirs to knock on.
                toast.error(
                  getErrorMessage(error, "This room is not available to join."),
                );
              } finally {
                setAskingToJoin(false);
              }
            }}
          >
            {askingToJoin ? "Asking…" : "Ask to join"}
          </Button>
        </div>
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
    room.hostId === user?.id &&
    (room.status === "scheduled" || room.status === "waiting");

  const openRoomEditor = () => {
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
                  {/* WT-327: the repeat rule lives on the meeting, because the meeting is the
                      only thing there is. There is no separate booking page to send anyone to —
                      the booking has one code and one next date, and this page already shows the
                      code. Host-only "Stop repeating" sits here for the same reason: deleting the
                      page it used to live on must not delete the ability. */}
                  {room.seriesId ? (
                    <RoomRecurrenceLine
                      seriesId={room.seriesId}
                      // WT-548: the occurrence being viewed. Stopping the schedule must not
                      // cancel the meeting whose page the button is on.
                      occurrenceId={room.id}
                      isHost={canEditRoom}
                    />
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
                  {/* Rating a meeting used to live on `/ended`, which was the only door to it and
                      is gone. Here it is a control on the meeting itself, offered only once the
                      meeting is over — there is nothing to rate before that. */}
                  {isEnded ? (
                    <MeetingFeedbackMenu roomId={room.id} meetingTitle={room.title} />
                  ) : null}
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
                roomId={room.id}
                isHost={isHost}
                isEnded={isEnded}
                artifactAccess={room.settings?.artifactAccess}
                endedRecord={endedRecordQuery.data ?? null}
                segments={transcriptSegments}
                hasTranscript={hasTranscript}
                seek={seek}
                onRecordChanged={() => void endedRecordQuery.refetch()}
                onJumpToMoment={jumpToTranscriptMoment}
                transcript={
                  <MeetingTranscriptArtifact
                    segments={transcriptSegments}
                    translations={transcriptTranslations}
                    preferredLanguage={user?.preferredLanguage}
                    onSeekToRecording={
                      canAlignToRecording(seekSources) ? requestSeek : undefined
                    }
                    baseTime={
                      transcriptQuery.data?.createdAt ||
                      room.startedAt ||
                      room.createdAt
                    }
                    roomId={room.id}
                    currentUserId={user?.id}
                    isEnded={isEnded}
                    onCopy={handleCopy}
                    transcriptId={transcriptQuery.data?.id}
                    transcriptStatus={transcriptQuery.data?.status}
                    canEdit={isHost}
                    onSegmentsChanged={() => void segmentsQuery.refetch()}
                    highlightedSegmentId={highlightedSegmentId}
                    speakerDirectory={speakerDirectory}
                  />
                }
                transcriptCount={transcriptEntryCount}
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
  roomId,
  isHost,
  isEnded,
  artifactAccess,
  transcript,
  transcriptCount,
  endedRecord,
  segments,
  hasTranscript,
  seek,
  onRecordChanged,
  onJumpToMoment,
}: {
  roomId: string;
  /** WT-480: only the host may change who the record is shared with. */
  isHost: boolean;
  /**
   * Whether the meeting is over, which is what separates "there is no record" from "the record
   * is not written yet". The host lands here the moment they press End, and the finalizer takes
   * about a minute — an empty transcript in that window is a wrong answer, not an empty one.
   */
  isEnded: boolean;
  /** WT-480: the room's stored `artifactAccess`. Absent reads as not shared. */
  artifactAccess?: string | null;
  transcript: React.ReactNode;
  transcriptCount: number;
  /**
   * Whether the meeting captured any transcript, once that is known — `undefined` while the
   * queries are still settling. Threaded from the page rather than derived from `transcriptCount`
   * here: a count of zero and a count not yet fetched are the same number, and only the page can
   * tell them apart.
   */
  hasTranscript?: boolean;
  endedRecord: EndedRoomHistoryItem | null;
  /** The persisted segments, so the summary panel can tell the reader it is behind a correction. */
  segments: TranscriptSegmentDto[];
  /** Where to move the recording, when a citation or a transcript line asked. */
  seek: SeekRequest | null;
  onRecordChanged: () => void;
  onJumpToMoment: (atMs: number) => void;
}) {
  const [tab, setTab] = useState<
    "transcript" | "summary" | "minutes" | "artifacts"
  >("transcript");
  const { busyArtifactId, downloadArtifact } =
    useArtifactDownload(onRecordChanged);
  // WT-492: null when the meeting was not recorded, or the file is not ready yet.
  const recording = findPlayableRecording(endedRecord?.artifacts);
  // WT-480: who may read this record. One derivation feeds the badge, the banner and the button.
  const setArtifactAccess = useSetArtifactAccess(roomId);
  const sharing = describeRecordSharing({ artifactAccess, isHost });

  // What "the summary changed" means, as one value. The template alone could not answer it:
  // regenerating in the SAME shape leaves the template identical, so the old arrival test was
  // already true when the request was made and the poll stopped before refetching anything.
  // updatedAt moves on every rewrite (see translation_room_artifacts.updated_at), and the
  // template is kept in the stamp so a legacy artifact with no updatedAt can still report a reshape.
  const summaryArtifact = endedRecord?.artifacts.find((item) => item.type === "summary_export");
  const summaryStamp = `${summaryArtifact?.updatedAt ?? ""}|${endedRecord?.summary?.templateKey ?? ""}`;

  // Read inside the polling interval, which closes over the render that started it and
  // would otherwise never see the rewritten summary arrive.
  const summaryStampRef = useRef(summaryStamp);
  const rewritePollRef = useRef<number | null>(null);

  // In an effect, not during render: writing a ref while rendering is how a component ends
  // up reading a value React has not committed yet.
  useEffect(() => {
    summaryStampRef.current = summaryStamp;
  }, [summaryStamp]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-semibold text-ink">Meeting record</h2>
          {/* WT-480: the badge and the banner below come from one call, so they cannot end up
              disagreeing — a "Draft" chip beside a banner saying everyone can read it is worse
              than either alone. */}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
              sharing.tone === "shared"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
          >
            {sharing.badge}
          </span>
        </div>

        {sharing.action ? (
          <button
            type="button"
            onClick={() => void setArtifactAccess.mutateAsync(nextArtifactAccess(artifactAccess))
              .then(() => {
                toast.success(
                  isRecordShared(artifactAccess)
                    ? "Record unpublished. Only you can see it now."
                    : "Record published. Everyone who took part can read it.",
                );
                onRecordChanged();
              })
              .catch((error: unknown) =>
                toast.error(getErrorMessage(error, "Could not change who this record is shared with.")),
              )}
            disabled={setArtifactAccess.isPending}
            className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            {setArtifactAccess.isPending ? "Saving…" : sharing.action}
          </button>
        ) : null}
      </div>

      {sharing.message ? (
        <div
          className={cn(
            "mt-3 rounded-[8px] border px-3.5 py-2.5 text-[13px] leading-relaxed",
            sharing.tone === "shared"
              ? "border-emerald-500/25 bg-emerald-500/5 text-ink"
              : sharing.tone === "draft"
                ? "border-amber-500/25 bg-amber-500/5 text-ink"
                : "border-border bg-surface-2 text-ink-muted",
          )}
        >
          {sharing.message}
        </div>
      ) : null}

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
          {/* Minutes came from the deleted `/ended` page, which was the only place they could be
              read or signed. They belong here for the reason the rest of the record does: the
              biên bản is a document ABOUT this meeting, drafted from its own summary. It also
              gains something in the move — the transcript is on this page, so a minute can cite
              a moment and the reader can go and check it. */}
          <MeetingRecordTabButton
            active={activeTab === "minutes"}
            onClick={() => setTab("minutes")}
            icon={ClipboardList}
            label="Minutes"
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

      {/* WT-492: above the transcript, and only in that tab — the two are read together, and it
          is the pairing the ticket asks for. On Summary and Artifacts it would push the panel the
          reader came for down the page for no reason; Artifacts still lists the same file to
          download. Rendered only when a ready recording exists, so a meeting nobody recorded shows
          no empty frame promising one. */}
      {/* On Summary as well as Transcript now. A summary citation is the same gesture as clicking
          a transcript line, and it cannot move a player the reader cannot see — sending them to
          another tab to watch what they just clicked is the long way round. Artifacts still gets
          none: it is a list of files, and the player would push the list the reader came for down
          the page. */}
      {activeTab === "transcript" || activeTab === "summary" ? (
        <MeetingRecordingPlayer
          artifact={recording}
          onConsentGranted={onRecordChanged}
          seek={seek}
        />
      ) : null}
      {activeTab === "transcript" ? (
        // "Still writing this up" came from the deleted `/ended` page, and it has to come with
        // it: the host now lands HERE the moment they press End, which is the one minute when
        // the finalizer has not run and there is genuinely nothing to read. Without it the
        // transcript's own empty state says "No transcript was captured for this meeting" —
        // a wrong answer, given confidently, at the only moment it is wrong. `useEndedRoomRecord`
        // already polls while anything is generating, so this clears itself.
        isEnded && !hasRecord ? (
          <div className="rounded-[8px] border border-dashed border-border bg-surface-1 px-3.5 py-3">
            <p className="text-[13px] font-medium text-ink">Still writing this up</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              The transcript and the AI summary are produced after a meeting ends — usually
              within a minute. This page updates on its own.
            </p>
          </div>
        ) : (
          transcript
        )
      ) : null}
      {activeTab === "minutes" ? (
        // Behind the same record gate the tab row is: the draft is assembled from the summary
        // artifact, so drawing it up before the finalizer has run would produce a minutes
        // document with an empty body and consume its number doing it.
        <MinutesPanel
          roomId={roomId}
          canManage={isHost}
          // The same switch the summary's citations make: the moment being cited is a node in
          // the transcript, and that node only exists while the transcript tab is rendered.
          onSeek={(atMs) => {
            setTab("transcript");
            onJumpToMoment(atMs);
          }}
        />
      ) : null}
      {activeTab === "summary" && endedRecord ? (
        <SummaryPanel
          room={endedRecord}
          segments={segments}
          hasTranscript={hasTranscript}
          busyArtifactId={busyArtifactId}
          onDownload={downloadArtifact}
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
            const askedAt = summaryStampRef.current;
            const stopAt = Date.now() + 90_000;
            rewritePollRef.current = window.setInterval(() => {
              // Any change to the stamp means something landed — a new shape or the same shape
              // rewritten. An artifact predating updated_at whose shape did not change cannot be
              // detected this way and falls through to the deadline, which is the honest
              // degradation rather than a poll that claims success.
              const arrived = summaryStampRef.current !== askedAt;
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
        <PersonAvatar
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
          <PersonAvatar user={user} className="size-10 text-[14px]" />
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
    // NOT participant.avatarUrl. The participants API has never returned one — the field on the
    // web DTO is a phantom that reads as "this person has no picture". The workspace member list
    // is the only place a face lives, and this page already has it.
    avatarUrl: resolveUserAvatar(participant.userId, membersArray, currentUser),
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

/**
 * A person on the room's record: their face when they have one, their initial when they do not.
 *
 * This drew the initial and nothing else — a circle with one letter in it, with no code path that
 * could ever show a picture. `UserIdentity` has declared `avatarUrl` the whole time, so it looked
 * from the outside like the data was missing rather than the rendering.
 *
 * AvatarImage resolves the stored value against the API origin, which an uploaded avatar needs:
 * it is a relative path, and the app is served from a different host than the API.
 */
function PersonAvatar({
  user,
  className,
}: {
  user: UserIdentity;
  className?: string;
}) {
  return (
    <Avatar
      className={cn("shrink-0 bg-primary/10", className)}
      title={user.name}
    >
      {/* No <AvatarImage> at all without a URL: base-ui keeps the fallback mounted until an image
          resolves, and an <img src=""> resolves against the page URL and logs a failed request on
          every render. */}
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-transparent font-semibold uppercase text-primary">
        {user.name?.charAt(0) || "U"}
      </AvatarFallback>
    </Avatar>
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

/**
 * The picture for a user id, from the only place one exists.
 *
 * Same lookup shape as resolveUserName: self first, then the member row. Somebody who was in the
 * meeting and is not a member of this workspace has no row and no face, which is the correct
 * answer for them rather than a degraded one.
 */
function resolveUserAvatar(
  userId: string | undefined,
  membersArray: WorkspaceMemberDto[],
  currentUser: UserDto | null,
): string | undefined {
  if (userId && userId === currentUser?.id) {
    return currentUser.avatarUrl?.trim() || undefined;
  }

  const member = userId
    ? membersArray.find(
        (item) =>
          item.userId === userId || item.id === userId || item.email === userId,
      )
    : undefined;
  return member?.avatarUrl?.trim() || undefined;
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
