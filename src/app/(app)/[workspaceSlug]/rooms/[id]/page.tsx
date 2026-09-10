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
  Maximize2,
  Minimize2,
  MoreHorizontal,
  CalendarPlus,
  Check,
  ChevronDown,
  ClipboardList,
  Code,
  Code2,
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
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
import {
  UserChipCard,
  type UserChipIdentity,
} from "@/components/user/user-chip";
import { usePresence } from "@/hooks/use-presence";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { useEndedRoomRecord } from "@/hooks/use-room-history";
import { findSegmentAtMs } from "@/lib/meeting/meeting-summary";
import {
  ArtifactsPanel,
  MeetingRecordTabButton,
  type SeekRequest,
  useArtifactDownload,
} from "@/components/rooms/meeting-record-panels";
import { MeetingFeedbackMenu } from "@/components/rooms/feedback-menu";
import { TranscriptReadingLayout } from "@/components/rooms/meeting-reading-rail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MeetingTranscriptArtifact } from "@/components/rooms/meeting-transcript-panel";
import { MinutesPanel } from "@/components/rooms/minutes-panel";
import { groupSavedTranscriptSegments } from "@/lib/transcript/transcript-display";
import {
  countPlayableRecordings,
  findPlayableRecording,
  hasPendingRecording,
} from "@/lib/meeting/meeting-artifacts";
import { resolveCitationRowId } from "@/lib/meeting/citation-target";
import {
  MOMENT_PARAM,
  parseMomentParam,
  withMomentParam,
} from "@/lib/meeting/moment-link";
import {
  canAlignToRecording,
  seekTargetSeconds,
  type SeekSources,
} from "@/lib/meeting/recording-seek";
import {
  describeRecordSharing,
  isRecordShared,
  nextArtifactAccess,
} from "@/lib/meeting/record-sharing";
import type { EndedRoomHistoryItem } from "@/types/roomHistory";
import { useRoomOccupancy } from "@/hooks/use-room-occupancy";
import {
  isFinishedStatus,
  participantPresence,
  type ParticipantPresence,
} from "@/lib/meeting/room-occupancy";
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
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
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

/**
 * The meeting record's tabs.
 *
 * Owned by the page rather than by MeetingRecordSection, because the page's right rail now
 * depends on which one is open — see `readingLayoutOpen`.
 */
/**
 * WHY THERE IS NO "SUMMARY" TAB, AND WHY THE FIRST ONE IS NOT CALLED "TRANSCRIPT".
 *
 * The first tab holds three things — the recording, the transcript, and (in the rail beside it)
 * the summary. It was called Transcript, which named one of them, while a second tab offered the
 * summary again on its own. So the summary had two homes: a rail that could not show all of it
 * and a tab that could not show the transcript it cited. Checking a claim meant leaving the
 * summary; reading the summary meant leaving the transcript.
 *
 * One tab now, named for what it actually contains.
 */
type MeetingRecordTab = "recap" | "minutes" | "artifacts";

/**
 * Nothing cited, as ONE value rather than a new one every time.
 *
 * The transcript column is several hundred rows on a meeting anybody bothers to read, and a fresh
 * `new Set()` is a new prop identity — which is that whole column re-rendering to draw exactly what
 * it already had. Same reason NO_MARKED_KEYS exists on the other end of this wire.
 */
const NO_HIGHLIGHTED_SEGMENTS: ReadonlySet<string> = new Set<string>();

type UserIdentity = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  /** Already through `normalizeLabel` — a display string, e.g. "Connected", "Pending". */
  status?: string;
  /**
   * WT-641: the row's presence, resolved once through the shared rule rather than re-derived
   * from `status` by each caller. Absent means this row is an invitation only — somebody who
   * has never been a participant, so no participant status exists to resolve.
   */
  presence?: ParticipantPresence;
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

  /**
   * WT-588: whether the record has taken the whole page.
   *
   * The default split gives the transcript ~780px, which at 14px is 95–105 characters a line —
   * well past the 80 that makes prose readable — while the right rail holds a roster nobody is
   * reading WHILE they read the transcript. Expanding drops the rail and lets the column breathe.
   *
   * Page state rather than a URL param or localStorage on purpose: it is a reading posture for
   * the next few minutes, not a preference. A shared link should open in the layout its author
   * described, and a remembered value would silently hide the roster for somebody who came here
   * to look at the roster.
   */
  const [recordExpanded, setRecordExpanded] = useState(false);
  // Lifted out of MeetingRecordSection: the right rail is rendered by this component and now
  // has to know which record tab is open.
  const [recordTab, setRecordTab] = useState<MeetingRecordTab>("recap");

  const transcriptQuery = useTranscriptByRoom(roomId);
  const segmentsQuery = useTranscriptSegments(transcriptQuery.data?.id);
  // WT-516: the server's own reason, not just "it failed". `FORBIDDEN` here means the record
  // exists and this viewer may not read it — which the Transcript tab used to render as "No
  // transcript was captured for this meeting".
  const transcriptErrorCode = apiErrorCode(
    transcriptQuery.error ?? segmentsQuery.error,
  );
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
  // A set, because a summary sentence rests on every turn it was drawn from — see
  // jumpToTranscriptMoment. The transcript asks it once per rendered line, so it is handed the
  // lookup rather than a list it would have to scan.
  const [highlightedSegmentIds, setHighlightedSegmentIds] =
    useState<ReadonlySet<string>>(NO_HIGHLIGHTED_SEGMENTS);
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  /**
   * WT-655 — how long the recording runs, as the media element reports it. Null until it does.
   *
   * The setter is handed to the player unwrapped, which is why this is `useState` and not a ref:
   * `useState` setters are referentially stable for the life of the component, and the player
   * retracts the duration whenever the callback it was given changes identity. The same trick the
   * reading sync already plays with `publishPlaying: setIsPlaying`.
   */
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState<number | null>(
    null,
  );

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
   * Scroll the transcript to the moments a summary claim cites, and mark all of them.
   *
   * Each moment is resolved to the segment that was BEING SPOKEN then rather than the nearest
   * one — see findSegmentAtMs. The DOM node is found by segment id rather than held in a
   * ref map, because the transcript re-renders on every correction and a ref map would go
   * stale exactly when the host is editing.
   *
   * A claim can rest on more than one moment: "Kenji carried on with the install" and the "ok,
   * taking it" that answered it are two turns by two people, and marking only the first showed
   * the reader half of the evidence for a sentence about both.
   */
  // The two origins WT-473 stored for exactly this. Either missing means the transcript cannot be
  // aligned to the recording at all, and recording-seek.ts refuses rather than guessing.
  /**
   * WT-655 — the third field, and the one with no column behind it.
   *
   * `durationSeconds` is what makes seekTargetSeconds refuse a moment that falls after the host
   * stopped recording. Nothing supplied it before, so that refusal had never once executed in
   * production: a late moment yielded a positive offset, the browser clamped `currentTime` to the
   * end of the file, and the reader got the final frame — which is a still picture of the meeting
   * ending and is indistinguishable from a seek that worked.
   *
   * IT ARRIVES LATE, ON PURPOSE, AND THE GUARD IS DORMANT UNTIL IT DOES
   *   The player fetches its presigned url only when somebody presses play (a fifteen-minute link
   *   spent on every visit to this page mostly expires unwatched), so before the first press there
   *   is no media element, no metadata, and no length. Every timestamp clicked in that window is
   *   checked against `null` and therefore against nothing. The refusal TIGHTENS once the file is
   *   loaded rather than being in force from the start, and that is the ceiling of this approach —
   *   a duration stored beside `recording_started_at` would arrive with the artifact and guard the
   *   first click too. Until then the first click is covered one layer down instead: the player
   *   compares a queued seek against its own `duration` before applying it, which is the only
   *   moment the number exists for a click that arrived before the file did.
   */
  const seekSources = useMemo(
    () => ({
      timelineAnchorAt: transcriptQuery.data?.timelineAnchorAt ?? null,
      recordingStartedAt:
        findPlayableRecording(endedRecordQuery.data?.artifacts)?.recordingStartedAt ?? null,
      durationSeconds: recordingDurationSeconds,
    }),
    [
      transcriptQuery.data?.timelineAnchorAt,
      endedRecordQuery.data?.artifacts,
      recordingDurationSeconds,
    ],
  );

  /**
   * Whether a transcript timestamp may open the recording at all, and if not, why. WT-655.
   *
   * ONE DERIVATION, THREE CONSUMERS
   *   The gate on `onSeekToRecording`, the notice above the transcript, and the player's own
   *   `unavailableReason` all read this. Deriving each separately is how a page ends up hiding
   *   every timestamp while explaining nothing, which is exactly the bug being fixed: `undefined`
   *   for the handler was the whole of the old answer, so every click on a timestamp was quietly
   *   swallowed with nothing on screen saying why.
   *
   * WHY MORE THAN ONE RECORDING MEANS NONE
   *   Anyone in the room can stop and restart recording, and each run is a separate file with its
   *   own start instant. `findPlayableRecording` hands back the first, so a moment from the second
   *   half of the meeting would be measured against the first file and produce a positive,
   *   plausible, WRONG offset — a seek that appears to work and lands on the wrong sentence.
   *   Picking the right file needs recording durations the backend does not store yet, so until it
   *   does, seeking is withheld and said out loud. See countPlayableRecordings.
   */
  const playableRecordingCount = countPlayableRecordings(
    endedRecordQuery.data?.artifacts,
  );
  const canSeekToRecording =
    playableRecordingCount === 1 && canAlignToRecording(seekSources);

  /**
   * Why a moment cannot be opened, for the reader — null when it can, or when there is nothing to
   * explain.
   *
   * A meeting with NO recording is deliberately null: not being recorded is the ordinary case and
   * gets a plain reading page, not a notice about a feature it was never going to have.
   * `"unalignable"` is the permanent one — the transcript predates the release that stored where
   * its timeline begins (WT-473), and no value can be reconstructed for it, so the notice states it
   * flatly rather than implying a wait. See SEEK_UNAVAILABLE_MESSAGES.
   */
  const seekUnavailableReason: "unalignable" | "multiple" | null =
    playableRecordingCount > 1
      ? "multiple"
      : playableRecordingCount === 1 && !canAlignToRecording(seekSources)
        ? "unalignable"
        : null;

  /**
   * What the PLAYER says when it has nothing to play, or nothing it can safely seek in.
   *
   * A different question from the notice above, which is about timestamps: `"processing"` is not a
   * seek problem at all, it is "the file is still being written, come back in a minute" — and
   * `findPlayableRecording` cannot report it, because it collapses "never recorded" and "not ready"
   * into the same null on purpose. The union is fixed by meeting-record-panels.
   */
  const recordingUnavailableReason: "processing" | "multiple" | null =
    playableRecordingCount > 1
      ? "multiple"
      : playableRecordingCount === 0 &&
          hasPendingRecording(endedRecordQuery.data?.artifacts)
        ? "processing"
        : null;

  /**
   * WT-655 — true only for the instant a `?t=` arrival is being applied.
   *
   * The arrival runs through the same `jumpToTranscriptMoment` a click does, deliberately: one path
   * from a moment to a scrolled row, so the row-resolution fix Wave 1 landed cannot be bypassed. But
   * that path writes the moment back into the URL, which for a click is the whole point and for an
   * arrival would put back the parameter we are about to strip — and the strip is what stops the
   * link re-firing every time an internal navigation returns to this page. The apply is entirely
   * synchronous, so a flag set around it is enough; nothing can interleave.
   */
  const arrivingFromMomentLinkRef = useRef(false);

  /**
   * Put the moment the reader is looking at into the address bar. WT-655.
   *
   * NOT A NEW LINK, AND NOTHING IS MADE PUBLIC. This is the page's own URL with one parameter added:
   * whoever opens it meets exactly the access checks this page already applies, and a viewer with no
   * right to the meeting sees what they would have seen without the parameter. Worth saying out loud,
   * because "share a moment" is the kind of feature that grows a public-link mode by accident.
   *
   * `router.replace`, so the back button still goes back to wherever the reader came from rather
   * than walking them through every timestamp they clicked. `scroll: false` because the default
   * scrolls to the top — which would undo the scroll that is the reason we are here.
   *
   * THE CONSEQUENCE, STATED: after clicking a timestamp the URL shows that moment, so copying the
   * address bar copies what is on screen. A refresh then honours it once and clears it again.
   */
  const rememberMomentInUrl = useCallback(
    (atMs: number) => {
      if (arrivingFromMomentLinkRef.current) return;
      const query = withMomentParam(window.location.search, atMs);
      router.replace(
        `${window.location.pathname}${query ? `?${query}` : ""}`,
        { scroll: false },
      );
    },
    [router],
  );

  /** Move the recording to a meeting moment. Silent when the clocks cannot be reconciled. */
  const requestSeek = useCallback(
    (atMs: number) => {
      // Before the refusal below, not after it. The moment is on the MEETING axis and is what the
      // reader is looking at whether or not the video can follow — a meeting with no recording, or
      // with several, still deserves a shareable address bar.
      rememberMomentInUrl(atMs);
      const seconds = seekTargetSeconds(seekSources, atMs);
      if (seconds === null) return;
      // A token, so clicking the SAME line twice seeks twice — the viewer has scrubbed away since.
      setSeek({ seconds, token: Date.now() });
    },
    [seekSources, rememberMomentInUrl],
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
   *
   * WT-655: it is now the rows themselves that are memoised rather than only their number, because
   * jumping to a cited moment has to resolve that moment to a ROW — see citation-target.ts. Same
   * grouping, same sort, one call: the count and the jump target cannot disagree about what a row
   * is, which is the whole point of not approximating this a second time.
   */
  const transcriptRows = useMemo(
    () =>
      groupSavedTranscriptSegments(
        [...transcriptSegments].sort(
          (left, right) => left.sequenceOrder - right.sequenceOrder,
        ),
      ),
    [transcriptSegments],
  );
  const transcriptEntryCount = transcriptRows.length;

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
    (atMs: number, alsoAtMs: readonly number[] = []) => {
      // Resolved before anything moves, because until every moment is in hand there is nothing
      // that can say which of them comes FIRST — and the first is where both the scroll and the
      // seek have to land. A reader dropped into the middle of the evidence has to scroll
      // backwards to find where it started, which is the opposite of checking a claim.
      const byId = new Map<string, TranscriptSegmentDto>();
      for (const moment of [atMs, ...alsoAtMs]) {
        const segment = findSegmentAtMs(transcriptSegments, moment);
        // Several moments of one exchange routinely land in the same turn — that is one place to
        // light, not three.
        if (segment && !byId.has(segment.id)) byId.set(segment.id, segment);
      }
      // On the segment's own start, not on the order the moments arrived in: `alsoAtMs` is sorted,
      // but `atMs` is the PRIMARY moment rather than the earliest one, and a claim whose primary
      // anchor is the reply would otherwise open at the reply.
      const cited = [...byId.values()].sort(
        (left, right) => left.startTimeMs - right.startTimeMs,
      );
      const earliest = cited[0];

      // Ahead of the scroll: it is the part with nothing on screen to acknowledge it, so it must
      // not wait behind an animation. It still fires when nothing resolved — the recording and the
      // saved transcript are different artifacts, and a moment the transcript trimmed away may
      // well be on the tape.
      requestSeek(earliest ? earliest.startTimeMs : atMs);

      // Only when NO moment resolved. A group where some of them did is a jump that worked, and
      // an error toast over a transcript that just scrolled to the right place reads as a bug.
      if (!earliest) {
        toast.error("That moment is not in the saved transcript.");
        return;
      }
      /**
       * WT-655: the cited SEGMENT is resolved to the ROW that contains it before anything is looked
       * up in the DOM.
       *
       * findSegmentAtMs searches the raw, ungrouped list, because that is the list with the timings
       * in it — but the transcript on screen is drawn from groupSavedTranscriptSegments, which folds
       * consecutive chunks of one continuous piece of speech into one bubble named after the FIRST
       * of them. A citation that landed anywhere else in a bubble produced an id that names no
       * element and no row, and `if (!node) return` swallowed it: the click did nothing, said
       * nothing, and looked deliberate next to the toast one branch above. The `highlighted`
       * comparison in the transcript panel is keyed on the row's id too, so the same mismatch was
       * also eating the highlight.
       */
      // EVERY cited segment, not just the earliest: the ids that end up in `highlighted` have to be
      // row ids, because that is what the panel compares and what the elements are named after.
      // Highlighting the raw segment ids would light nothing for any citation that landed past the
      // first chunk of a bubble — the same mismatch this resolution exists to close.
      const rowIds: string[] = [];
      for (const segment of cited) {
        const rowId = resolveCitationRowId(transcriptRows, segment.id);
        if (rowId && !rowIds.includes(rowId)) rowIds.push(rowId);
      }
      // Ordered by the segments they came from, so the first row is the earliest evidence.
      const firstRowId = rowIds[0];
      if (!firstRowId) {
        // Grouping drops control markers before anything is drawn, so a moment can genuinely have
        // no line a person can read. Scrolling to the nearest row instead would land the reader on
        // a line that is not the evidence they clicked to check.
        toast.error("That moment has no line in the transcript.");
        return;
      }
      // The tab switch renders the transcript in the same commit, so the node does not
      // exist yet on this frame.
      requestAnimationFrame(() => {
        const node = document.getElementById(`transcript-segment-${firstRowId}`);
        if (!node) {
          // Never silent again. The row exists in the data and not on screen — a filter or a
          // language view is hiding it — and the reader has to be told, or the citation looks
          // broken in exactly the way it used to be.
          toast.error("Could not scroll to that moment in the transcript.");
          return;
        }
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedSegmentIds(new Set(rowIds));
      });
    },
    [transcriptSegments, transcriptRows, requestSeek],
  );

  /** Whether this arrival's `?t=` has been dealt with. One shot per mount, malformed values too. */
  const momentLinkAppliedRef = useRef(false);
  /**
   * Whether the answer carrying `recordingStartedAt` is in.
   *
   * `useEndedRoomRecord` is disabled until a workspace id is known, and a disabled query never
   * leaves `pending` — so "settled" cannot be `!isPending` or an arrival on a meeting with no
   * workspace resolved would wait forever for an answer that is not coming. A room whose own lookup
   * has finished with no workspace behind it never had a record to fetch, and counts as answered.
   */
  const recordAnswerSettled =
    endedRecordQuery.isSuccess ||
    endedRecordQuery.isError ||
    ((roomQuery.isSuccess || roomQuery.isError) && !validWorkspaceId);

  /**
   * `?t=` — someone shared a moment of this meeting. WT-655.
   *
   * WHY IT WAITS
   *   Both answers have to be in first, and for different reasons. Without the transcript there is
   *   no row to scroll to, and an empty list at this point is not "no line" but "not fetched" — the
   *   difference between honouring the link and telling the reader their moment is not in the
   *   transcript. Without the ended record there is no `recordingStartedAt`, so `requestSeek` would
   *   refuse silently and the video would sit still on a link that should have moved it. Neither is
   *   a race worth losing for the sake of firing a few hundred milliseconds earlier.
   *
   * WHY IT GOES THROUGH jumpToTranscriptMoment
   *   Because that is the one path from a moment to the row a reader can see. It seeks AND scrolls,
   *   and when the meeting cannot be seeked at all — no recording, clocks unreconcilable, several
   *   recordings — the seek is the half that quietly declines and the scroll is the half that still
   *   works. Reading the right sentence is most of the value of "look at this bit", and it is the
   *   part that survives a meeting nobody recorded. A second scroll path would also reintroduce the
   *   mid-group citation bug Wave 1 fixed; see resolveCitationRowId.
   *
   *   The recording being unloaded at this instant is not a problem: the player holds a seek that
   *   arrives before its file does and applies it once metadata lands, so the moment is waiting for
   *   the reader's first press of play rather than being dropped.
   *
   * WHY THE PARAMETER IS THEN REMOVED
   *   A parameter that lingers re-fires on every internal navigation back to this page: leave the
   *   record, come back to it, and the reader is yanked to a moment they visited ten minutes ago.
   *   `router.replace`, so this leaves no history entry to press Back through.
   */
  useEffect(() => {
    if (momentLinkAppliedRef.current) return;
    if (hasTranscript === undefined || !recordAnswerSettled) return;

    const atMs = parseMomentParam(
      new URLSearchParams(window.location.search).get(MOMENT_PARAM),
    );
    momentLinkAppliedRef.current = true;

    // Silence, deliberately. A malformed `?t=` is somebody's mangled copy-paste — broken across two
    // lines in a chat client, or with an auto-linker's bracket stuck to the end — and there is no
    // action the reader can take about it. No seek, no toast, and above all no jump to 0:00, which
    // would be a confident answer to a question nobody asked. It is also left IN the URL: there is
    // nothing to re-fire, and the reader may be about to fix it by hand.
    if (atMs === null) return;

    // See the ref: the arrival must not re-mint the parameter it is consuming.
    arrivingFromMomentLinkRef.current = true;
    try {
      jumpToTranscriptMoment(atMs);
    } finally {
      arrivingFromMomentLinkRef.current = false;
    }

    const query = withMomentParam(window.location.search, null);
    router.replace(
      `${window.location.pathname}${query ? `?${query}` : ""}`,
      { scroll: false },
    );
  }, [
    hasTranscript,
    recordAnswerSettled,
    jumpToTranscriptMoment,
    router,
  ]);

  // WT-274: the ONE read of "who is in this room" on this page. The header chip and the
  // Tracking panel both render off this object; neither one filters a status itself, which is
  // what let them show 1/100 and "Attendees: 0" at the same moment.
  const occupancy = useRoomOccupancy(room, participantsQuery.data ?? null);

  // One request for the whole roster instead of one per row, the same call people-panel.tsx
  // makes. Read ABOVE the `if (!room)` guard for the reason spelled out on `activeRoomId`
  // below: a hook after that early return runs on the second render and not the first, and
  // React answers the changed hook count with error #310 — a blank page, not a degraded one.
  // Keyed off the API rows because those exist before the room query resolves; an
  // invitation-only row has no user id for presence to resolve anyway.
  usePresence((participantsQuery.data ?? []).map((participant) => participant.userId));

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
  // WT-641: the roster is grouped by what each row's status actually says. It no longer asks
  // `occupancy.seated` for the first group and sweeps the remainder under a heading that reads
  // "Invited" — that split produced rows saying "Invited — Removed", and on a finished room
  // (where the service moves everyone CONNECTED -> DISCONNECTED) an empty first group under a
  // heading that said 8.
  //
  // WT-274 still holds: `occupancy` remains the only thing that COUNTS people, and the header
  // pill is still the one place a seat total is rendered. This decides headings, not numbers.
  const recordSectionShown = isEnded || transcriptSegments.length > 0;
  /**
   * The transcript tab renders TranscriptReadingLayout, which brings its own 420px rail.
   *
   * Two rails on one page is not a tidiness problem, it is a width one. That component's own
   * opening comment sets the budget it was designed around — "620 for a transcript at a readable
   * 66 characters" — and does the arithmetic against the full page width. This page's aside takes
   * 300px plus a 32px gap before any of that, so on a 1280px window the reading column lands at
   * 428px: about 46 characters, against the 66 the layout exists to protect. At 1440 it is 588px.
   * Only from ~1536px up does the column reach its cap with both rails present.
   *
   * So the aside stands down while the record is being read. Nothing is lost: it answers "who was
   * invited, who attended", which is not the question anyone has while reading a transcript, and
   * any other tab brings it straight back.
   */
  const readingLayoutOpen =
    recordSectionShown &&
    recordTab === "recap" &&
    Boolean(endedRecordQuery.data);
  const railHidden = recordExpanded || readingLayoutOpen;

  const rosterGroups = groupRoster(participants, isEnded);
  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-1 text-ink">
      {copiedText ? (
        <div className="fixed left-1/2 top-6 z-[100] -translate-x-1/2 rounded-md border border-border bg-surface-1 px-4 py-2 text-[13px] font-medium text-ink shadow-lg">
          {copiedText}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto grid min-h-full w-full max-w-[1500px] grid-cols-1 gap-8 px-6 py-8 xl:px-10",
            // WT-588: expanded is one column, and the aside is not rendered at all rather than
            // hidden — a `display:none` rail keeps mounting its roster queries and its
            // collapsibles, and keeps them in the tab order for a keyboard user who cannot see
            // where focus went.
            railHidden ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_300px]",
          )}
        >
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
                  {/* Moved into the button row below. On its own line it stacked above the
                      `···`, and on an ENDED room — where there is no primary button — that left
                      two lone icons floating one above the other at the page's right edge,
                      reading as two unrelated controls rather than one cluster. */}
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
                  {/* The `···` beside the primary button is where the right column's `Actions`
                      panel went. Those five entries were: the room code (the pill under the
                      title already copies it on click), `Add to favorites` (wired to nothing —
                      WT-642), and three real ones. Three items do not earn a permanent 185px
                      panel, and by WT-197's own logic a room's actions belong next to the
                      control that acts on the room. The primary button is untouched. */}
                  <div className="flex items-center gap-2">
                    {entryIntent.isActionable ? (
                      <RoomEntryButton
                        intent={entryIntent}
                        pending={startRoomMutation.isPending}
                        onActivate={handleRoomEntry}
                        className="h-9 px-4"
                      />
                    ) : null}
                    {/* Rating a meeting used to live on `/ended`, which was the only door to it
                        and is gone. Here it is a control on the meeting itself, offered only once
                        the meeting is over — there is nothing to rate before that. */}
                    {isEnded ? (
                      <MeetingFeedbackMenu
                        roomId={room.id}
                        meetingTitle={room.title}
                      />
                    ) : null}
                    <RoomActionsMenu
                      room={room}
                      isHost={isHost}
                      canEnd={isHost && !isEnded && room.status !== "cancelled"}
                      endPending={endRoomMutation.isPending}
                      onCopy={handleCopy}
                      onEnd={async () => {
                        try {
                          await endRoomMutation.mutateAsync(room.id);
                        } catch {
                          // Mutation toast handles the error.
                        }
                      }}
                    />
                  </div>
                  {entryIntent.isActionable && entryIntent.helpText ? (
                    <p className="text-right text-[12px] leading-relaxed text-muted-foreground">
                      {entryIntent.helpText}
                    </p>
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

            {recordSectionShown ? (
              <MeetingRecordSection
                roomId={room.id}
                isHost={isHost}
                isEnded={isEnded}
                artifactAccess={room.settings?.artifactAccess}
                endedRecord={endedRecordQuery.data ?? null}
                segments={transcriptSegments}
                hasTranscript={hasTranscript}
                seek={seek}
                seekSources={seekSources}
                onRecordChanged={() => void endedRecordQuery.refetch()}
                // WT-655: the media element is the only source of the recording's length, and this
                // is the wire it comes back up. See the note on `seekSources` above.
                onDurationSeconds={setRecordingDurationSeconds}
                onJumpToMoment={jumpToTranscriptMoment}
                seekUnavailableReason={seekUnavailableReason}
                recordingUnavailableReason={recordingUnavailableReason}
                speakerDirectory={speakerDirectory}
                transcript={
                  <MeetingTranscriptArtifact
                    segments={transcriptSegments}
                    translations={transcriptTranslations}
                    preferredLanguage={user?.preferredLanguage}
                    // WT-655: the count gate joined the alignment gate. Two playable recordings
                    // means every offset is measured against the wrong file half the time, and the
                    // notice above the transcript now says why the timestamps went quiet.
                    onSeekToRecording={canSeekToRecording ? requestSeek : undefined}
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
                    // WT-311(c): the meeting's own clock, not the translation session's. A
                    // host who never pressed Start Translation still held a meeting with a length.
                    meetingStartedAt={room.startedAt}
                    meetingEndedAt={room.endedAt}
                    // WT-516: the panel cannot tell "refused" from "empty" without this. The
                    // by-room lookup is where a non-participant is turned away (FORBIDDEN), and
                    // it is also the query whose failure leaves `transcriptId` undefined — so
                    // the segments query never runs and the count is zero for a reason that has
                    // nothing to do with the meeting.
                    transcriptErrorCode={transcriptErrorCode}
                    transcriptLoading={
                      transcriptQuery.isLoading || segmentsQuery.isLoading
                    }
                    canEdit={isHost}
                    onSegmentsChanged={() => void segmentsQuery.refetch()}
                    highlightedSegmentIds={highlightedSegmentIds}
                    speakerDirectory={speakerDirectory}
                  />
                }
                transcriptCount={transcriptEntryCount}
                tab={recordTab}
                onTabChange={setRecordTab}
                expanded={recordExpanded}
                onToggleExpanded={() => setRecordExpanded((current) => !current)}
              />
            ) : null}

          </main>

          {/* One panel, so the column holds one thing.

              WT-330(8) built a bounded, flexing scroll region here because the invitee list
              could push everything else off screen. That is kept — the roster is still the one
              thing that grows with the data — but it now has the column to itself, so on any
              ordinary meeting it never has to scroll at all.

              WT-588, for whoever reads this next: that ticket deliberately put `Actions` ABOVE
              the roster, so a long roster could not bury the controls. The panel is gone
              entirely now and its three real entries live in the header's `···` menu, beside
              the primary button — which is where WT-197 established that a room's actions
              belong. The ordering problem WT-588 solved cannot recur, so do not "restore" it.

              Still `xl:`-only. Below that the column is a normal stacked block and the page
              scrolls, which is also where the roster's grid earns its keep: at that width it
              lays out in several columns instead of one. */}
          {railHidden ? null : (
          <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)] xl:overflow-hidden">
            <PropertyPanel
              title="People"
              className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden"
              /* The one bounded scroll region. `overscroll-auto` is the default, restated:
                 chaining is what keeps this from trapping the page's scroll at its end. */
              bodyClassName="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-auto xl:pr-1"
            >
              {/* THE SHARED NUMBER, STILL SAID OUT LOUD.
                  The groups below each carry their own count, which is what a grouped roster
                  needs — but the header chip and this panel once showed "1/100" and
                  "Attendees: 0" at the same moment, and they stopped doing that by both
                  reading `occupancy` rather than filtering for themselves. Rendering the
                  shared label here keeps that guarantee visible: if a group's arithmetic ever
                  drifts from occupancy, the two numbers sit one above the other. */}
              <p className="mb-2 text-[12px] text-muted-foreground">
                {`Participants: ${occupancy.label}`}
              </p>

              {rosterGroups.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  {/* Not "Nobody is in the room right now" — that sentence answers a question
                      about presence, and the situation here is that there is nobody to be
                      present yet. */}
                  No one else invited yet.
                </p>
              ) : (
                rosterGroups.map((group) => (
                  <CollapsibleSection
                    key={group.label}
                    label={`${group.label}: ${group.people.length}`}
                    defaultOpen={group.defaultOpen}
                  >
                    {group.people.map((person) => (
                      <UserRow
                        key={person.id}
                        user={person}
                        isHost={person.id === room.hostId}
                      />
                    ))}
                  </CollapsibleSection>
                ))
              )}
            </PropertyPanel>
          </aside>
          )}
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
 * WT-655 — what a reader is told when a timestamp will not open the recording.
 *
 * THE SILENCE THIS BREAKS
 *   `onSeekToRecording` was gated on `canAlignToRecording` alone, and the gate's only expression
 *   was passing `undefined`: every timestamp in the transcript kept its clickable look, lost its
 *   click, and offered no reason anywhere on the page. A feature that quietly does nothing is
 *   indistinguishable from a broken one, and the reader's next move is to file a bug about the
 *   transcript.
 *
 * WHY THE WORDING AVOIDS "YET"
 *   `unalignable` is permanent. The two origins the arithmetic needs were added by WT-473 and
 *   cannot be reconstructed for a meeting recorded before them, so there is nothing to wait for
 *   and saying "not yet" would invite a reader to keep coming back. `multiple` genuinely is
 *   temporary — it needs recording durations the backend does not store — so it is the one that
 *   gets a "yet".
 */
const SEEK_UNAVAILABLE_MESSAGES: Record<"unalignable" | "multiple", string> = {
  unalignable:
    "You can watch this recording, but jumping to a moment is not available for it — this meeting was transcribed before WarpTalk started recording where a video's timeline begins.",
  multiple:
    "This meeting has more than one recording, so jumping to a moment is not available yet — a timestamp cannot be matched to the right file.",
};

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
  seekSources,
  onRecordChanged,
  onDurationSeconds,
  onJumpToMoment,
  seekUnavailableReason,
  recordingUnavailableReason,
  speakerDirectory,
  tab,
  onTabChange,
  expanded,
  onToggleExpanded,
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
  /**
   * WT-655 — the two clock origins, for the direction that runs the other way: the recording is
   * playing, and the transcript has to know which line that is.
   *
   * The same object `requestSeek` measures against, threaded rather than rebuilt here. Two
   * derivations of this pair would be two answers to where the meeting's timeline begins, and the
   * second one is wrong in a way that renders as a highlight sitting a sentence behind the audio.
   */
  seekSources?: SeekSources;
  onRecordChanged: () => void;
  /**
   * WT-655 — the recording's length, going the other way from everything else here.
   *
   * Both players on this page report it to the same handler, and they cannot both be mounted: the
   * pip belongs to the Transcript tab and the block player to Summary, so switching tabs unmounts
   * one (which publishes null) and mounts the other (which publishes the number again once its own
   * metadata lands). That is why the handler is a plain setter and not a merge of two sources.
   */
  onDurationSeconds?: (seconds: number | null) => void;
  /** The claim's primary moment, and the others it rests on. A caller with a single moment — the
   *  minutes panel, a transcript line — passes one and nothing changes for it. */
  onJumpToMoment: (atMs: number, alsoAtMs?: readonly number[]) => void;
  /**
   * WT-655 — why a transcript timestamp does not open the recording, when it does not.
   *
   * Derived on the page, because only the page holds the transcript's `timelineAnchorAt`. Null
   * covers both "it works" and "there is no recording to jump into" — a meeting nobody recorded
   * gets a plain reading page, not a notice about a feature it never had.
   */
  seekUnavailableReason?: "unalignable" | "multiple" | null;
  /** Passed straight to the player. The union is meeting-record-panels'. */
  recordingUnavailableReason?: "processing" | "multiple" | null;
  /** Faces for the reading rail's attendees tab, from the same workspace member list the
   *  transcript's own speakers come from — the only place an avatar exists. */
  speakerDirectory?: Readonly<
    Record<string, { fullName?: string | null; avatarUrl?: string | null }>
  >;
  /** Owned by the page: it decides the right rail's fate from this. */
  tab: MeetingRecordTab;
  onTabChange: (tab: MeetingRecordTab) => void;
  /** WT-588: whether the record has the page to itself, with the right rail dropped. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
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

  /**
   * Ask for the summary to be rewritten, and watch for it landing.
   *
   * Lifted out of the deleted Summary tab unchanged. The endpoint answers 202 — the summary lands
   * on the artifact later — so this polls for it rather than trusting the response, stops the
   * moment the new shape arrives, and gives up after 90 seconds either way.
   */
  const requestSummaryRewrite = useCallback(
    async (templateKey: string) => {
      if (!endedRecord) return;
      await translationRoomService.regenerateSummary(endedRecord.id, templateKey);
      toast.success("Rewriting the summary…");

      if (rewritePollRef.current !== null) {
        window.clearInterval(rewritePollRef.current);
      }
      const askedAt = summaryStampRef.current;
      const stopAt = Date.now() + 90_000;
      rewritePollRef.current = window.setInterval(() => {
        // Any change to the stamp means something landed — a new shape or the same shape
        // rewritten. An artifact predating updated_at whose shape did not change cannot be
        // detected this way and falls through to the deadline, which is the honest degradation
        // rather than a poll that claims success.
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
    },
    [endedRecord, onRecordChanged],
  );

  // No ended record means the meeting has not finished, so there is nothing to summarise and
  // no files to retain. Showing two permanently empty tabs would only invite clicking them.
  const hasRecord = Boolean(endedRecord);
  const activeTab = hasRecord ? tab : "recap";

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
            active={activeTab === "recap"}
            onClick={() => onTabChange("recap")}
            icon={FileText}
            label="Recap"
            count={transcriptCount || undefined}
          />
          {/* Minutes came from the deleted `/ended` page, which was the only place they could be
              read or signed. They belong here for the reason the rest of the record does: the
              biên bản is a document ABOUT this meeting, drafted from its own summary. It also
              gains something in the move — the transcript is on this page, so a minute can cite
              a moment and the reader can go and check it. */}
          <MeetingRecordTabButton
            active={activeTab === "minutes"}
            onClick={() => onTabChange("minutes")}
            icon={ClipboardList}
            label="Minutes"
          />
          <MeetingRecordTabButton
            active={activeTab === "artifacts"}
            onClick={() => onTabChange("artifacts")}
            icon={Archive}
            label="Artifacts"
            count={endedRecord?.artifacts.length}
          />

          {/* WT-588. On the tab strip rather than inside the transcript toolbar, because it
              widens the RECORD — summary, minutes and artifacts gain the same room, and a
              control that moved only when you were on one tab would read as belonging to that
              tab's content.

              `ml-auto` and no label: it is the one control here that changes the page's shape
              rather than what it shows, and the icon pair is the convention for that everywhere
              else. Hidden below xl — there is no second column to reclaim, so the button would
              do nothing visible. */}
          {onToggleExpanded ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-pressed={!!expanded}
              title={
                expanded
                  ? "Show the meeting details again"
                  : "Give the record the full width"
              }
              aria-label={
                expanded ? "Collapse the record" : "Expand the record"
              }
              className="ml-auto mb-1 hidden shrink-0 cursor-pointer rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink xl:block"
            >
              {expanded ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </button>
          ) : null}
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
          the page.

          Option C: on the TRANSCRIPT tab the player is no longer here at all. It has stopped being
          a full-width block above the reading column and become the pip at the top of the reading
          rail — the same component, the same element, one `variant` apart. A 16:9 frame the width
          of the record is the single biggest reason the transcript below it was being read a
          screenful at a time. The Summary tab keeps the block player, because there is no reading
          column beside it there to compete with. */}
      {/* WT-655: the one line that stops the transcript's timestamps going quiet without a reason.
          Above the reading surface, because it is about the timestamps in it. A meeting that was
          simply never recorded produces no reason at all and so renders nothing — see
          seekUnavailableReason. The player it used to sit beside is gone: Summary and Transcript
          are one tab now, and the rail's pip is the only player on it. */}
      {activeTab === "recap" && seekUnavailableReason ? (
        <div className="mb-3 rounded-[8px] border border-border bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
          {SEEK_UNAVAILABLE_MESSAGES[seekUnavailableReason]}
        </div>
      ) : null}
      {activeTab === "recap" ? (
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
        ) : hasRecord ? (
          /* The record exists, so there is something to put beside the transcript: a summary with
             citations in it, or at the very least who did the talking. A meeting still in progress
             has neither, and gets the reading column on its own rather than an empty rail
             occupying 420px of it. */
          <TranscriptReadingLayout
            transcript={transcript}
            record={endedRecord}
            segments={segments}
            hasTranscript={hasTranscript}
            recording={recording}
            recordingUnavailableReason={recordingUnavailableReason}
            seek={seek}
            seekSources={seekSources}
            busyArtifactId={busyArtifactId}
            onConsentGranted={onRecordChanged}
            onDurationSeconds={onDurationSeconds}
            onJumpToMoment={onJumpToMoment}
            onDownload={downloadArtifact}
            onRewrite={endedRecord ? requestSummaryRewrite : undefined}
            speakerDirectory={speakerDirectory}
          />
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
            onTabChange("recap");
            onJumpToMoment(atMs);
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
          // 160px of empty box was a tenth of the first screen on a room whose notes nobody
          // wrote — and most rooms have none. The editor grows with its content anyway, so the
          // floor only has to be a comfortable click target for an empty one: three lines.
          "min-h-[72px] w-full max-w-none text-[13px] leading-6 text-ink outline-none " +
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

/**
 * The card a person opens into, and the popover shell around it.
 *
 * Extracted from the capsule chip this page used to draw people with. The card's markup lived
 * inside that chip, so the only way for a row to offer the card was to BE a chip — which is
 * what kept the roster drawn as a column of capsules. With the card standing on its own, a
 * plain row can open it, and the chip had nothing left to do.
 */
function PersonPopover({ user }: { user: UserIdentity }) {
  // The card is the shared one now. Its markup used to live here in full, one of several
  // near-identical copies scattered across the app — which is how the archive, the meetings
  // list and the schedule all ended up printing a name with nothing behind it while THIS page
  // had the good version. The trigger stays local: the roster is rows, not chips.
  return <UserChipCard user={toChipIdentity(user)} align="start" />;
}

function toChipIdentity(user: UserIdentity): UserChipIdentity {
  return {
    // For an invitee this is an invitation id rather than a user id — presence simply never
    // resolves for it, which is the correct answer for somebody who has not accepted yet.
    userId: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    speakLanguage: user.speakLanguage,
    listenLanguage: user.listenLanguage,
  };
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
      role: "Host",
      status: "Host",
      // The service seeds a participant row for the host at creation, so reaching here means
      // that row is missing rather than that the host declined anything. "Not in room" is the
      // neutral answer; bucketing them as an unanswered invitation would be a claim.
      presence: "not-in-room",
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
      ? "Host"
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
    presence: participantPresence(participant.status),
    // NOT participant.avatarUrl. The participants API has never returned one — the field on the
    // web DTO is a phantom that reads as "this person has no picture". The workspace member list
    // is the only place a face lives, and this page already has it.
    avatarUrl: resolveUserAvatar(participant.userId, membersArray, currentUser),
    speakLanguage: participant.speakLanguage,
    listenLanguage: participant.listenLanguage,
  };
}

/**
 * WT-641 — which heading each row sits under.
 *
 * Presence comes from `participantPresence`, the shared resolver people-panel.tsx already uses,
 * so the two rosters in this app cannot end up disagreeing about what a status means. Rows with
 * no presence at all are invitation-only: they have never been a participant, so they are
 * bucketed by whether the invitation was answered.
 *
 * Empty groups are dropped rather than rendered as "Declined: 0". Order is fixed and reads as a
 * priority: the group with something to do first, then the room, then the record, then the
 * people who never arrived.
 */
function groupRoster(people: UserIdentity[], isEnded: boolean) {
  const byPresence = (...states: ParticipantPresence[]) =>
    people.filter(
      (person) => person.presence && states.includes(person.presence),
    );
  const invitedWith = (accepted: boolean) =>
    people.filter(
      (person) =>
        !person.presence &&
        (person.status?.toLowerCase() === "accepted") === accepted,
    );

  const groups = [
    { label: "Waiting to be admitted", people: byPresence("lobby") },
    { label: "In room", people: byPresence("in-room", "connected") },
    {
      // "Left" is wrong for a meeting that is over — everybody left, that is what ending is.
      label: isEnded ? "Attended" : "Left",
      people: byPresence("disconnected", "left"),
    },
    { label: "Accepted", people: invitedWith(true) },
    { label: "Awaiting reply", people: invitedWith(false) },
    {
      label: isEnded ? "Did not attend" : "Not in room",
      // The people who never arrived are the longest group on a big invite list and the least
      // often read, so they start closed — the heading still carries the count, which is the
      // part anyone actually scans for.
      collapsed: true,
      people: byPresence("not-in-room"),
    },
  ].filter((group) => group.people.length > 0);

  // Unless it is all there is: a panel whose only group is shut looks like a panel with no
  // data in it.
  return groups.map((group, _index, all) => ({
    ...group,
    defaultOpen: all.length === 1 || !("collapsed" in group && group.collapsed),
  }));
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
  defaultOpen = true,
  children,
}: {
  label: string;
  /** Terminal groups start closed — see groupRoster. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="space-y-2">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-md py-0.5 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <ChevronDown className="size-3 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-0 -rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        {/* Columns follow the width this list actually has, which is not always the rail's.
            Below `xl` the whole column drops under the main one and spans the page — and the
            roster used to keep stacking one name per row there, each row using ~300px of
            ~1100px and paying for the rest in page length. `auto-fill` with a 260px floor
            resolves to a single column inside the 276px rail, so one declaration serves both
            placements: no `compact` variant, no second render path.

            260px is the width at which a row still fits a 24px avatar, an average Vietnamese
            name and its status label without truncating. Below that, another column would only
            trade page length for ellipses. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-3">
          {children}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/**
 * One person on the roster: a ROW, not a capsule.
 *
 * The two cost the same vertical space — an `h-6` chip inside a `py-1.5` row is 36px either
 * way — so the capsule was not buying density with what it spent. What it spent was a border,
 * a shadow and a pill shape that reads as a removable token in a "To:" field rather than as a
 * row in a list, and it shrank the popover's hit target to the width of the name: 24px tall,
 * which is exactly WCAG 2.2 SC 2.5.8's floor with no headroom. The row is the trigger now, so
 * the target is the whole band, and the same padding doubles as visual rhythm.
 *
 * The presence dot keeps the meaning it already has everywhere else in the app (see
 * people-panel.tsx): whether this person is reachable in WarpTalk at all — NOT whether they
 * are in this room. Room presence is the label on the right and the group this row sits in.
 * One mark, one meaning, or the same dot means two things on two screens.
 */
function UserRow({ user, isHost }: { user: UserIdentity; isHost?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger className="grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <span className="relative size-6">
          <PersonAvatar user={user} className="size-6 text-[10px]" />
          <AvatarPresenceDot userId={user.id} />
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-ink">
            {user.name}
          </span>
          {isHost ? (
            <span className="shrink-0 rounded bg-primary/10 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-primary">
              Host
            </span>
          ) : null}
        </span>
        {user.status ? (
          <span className="shrink-0 text-[10.5px] text-muted-foreground">
            {user.status}
          </span>
        ) : null}
      </PopoverTrigger>
      <PersonPopover user={user} />
    </Popover>
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

/**
 * The room's secondary actions, in one menu beside the primary button.
 *
 * This replaces the right column's `Actions` panel. Of that panel's five entries, `Copy room
 * code` duplicated the code pill under the title (which copies on click, WT-310(12)) and
 * `Add to favorites` was wired to nothing at all (WT-642). The three that did something are
 * here. Destructive last and marked, the way it was in the panel.
 */
function RoomActionsMenu({
  room,
  isHost,
  canEnd,
  endPending,
  onCopy,
  onEnd,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  canEnd: boolean;
  endPending: boolean;
  onCopy: (text: string, label: string) => void;
  onEnd: () => void;
}) {
  const joinLink = `${window.location.origin}/join?code=${room.translationRoomCode}`;
  const showCalendar = isUpcomingScheduledRoom(room);

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

  // Nothing to offer is not the same as an empty menu: a trigger that opens onto nothing is
  // exactly the failure WT-310(7) cleaned up elsewhere on this page.
  if (!isHost && !showCalendar) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More actions"
        title="More actions"
        className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {isHost ? (
          <DropdownMenuItem onClick={() => onCopy(joinLink, "Invite link")}>
            <LinkIcon className="mr-2 size-3.5" />
            Copy invite link
          </DropdownMenuItem>
        ) : null}
        {showCalendar ? (
          <>
            <DropdownMenuItem onClick={() => void handleDownloadIcs()}>
              <Download className="mr-2 size-3.5" />
              Download .ics
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleAddToGoogleCalendar}>
              <CalendarPlus className="mr-2 size-3.5" />
              Add to Google Calendar
            </DropdownMenuItem>
          </>
        ) : null}
        {canEnd ? (
          <DropdownMenuItem
            disabled={endPending}
            onClick={onEnd}
            className="text-red-500 focus:text-red-500"
          >
            <StopCircle className="mr-2 size-3.5" />
            End meeting
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

  // A display NAME, and deliberately NOT a role word.
  //
  // The role rename (Organizer -> Host) does not reach here, and must not: the guard directly
  // above exists because the service sends displayName "host" for the host's own row, and
  // rendering a role where a person's name goes is the defect that guard was written for.
  // Returning "Host" would land on exactly the label that ticket removed, by another route.
  //
  // "Organizer" had the same problem and one more: this fallback is generic — it answers for
  // ANY user id that resolves to nobody, not just the host — so it was calling unresolvable
  // members organizers. The role now travels as a badge on the row, which frees the name to
  // say the only true thing left: we do not know it.
  return "Unnamed participant";
}

function formatDateTime(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
