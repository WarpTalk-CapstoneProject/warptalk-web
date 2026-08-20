/**
 * TranslationRoom domain types — aligned with backend TranslationRoomService DTOs.
 * Source: WarpTalk.TranslationRoomService.Application.DTOs.TranslationRoomDtos
 */

// ── Response DTOs ─────────────────────────────

export type TranslationRoomStatus =
  | "scheduled"
  | "waiting"
  | "in_progress"
  | "paused"
  | "ended"
  | "cancelled"
  | "expired"
  | "failed"
  | "timeout";

export type TranslationRoomLifecycleAction = "start" | "end" | "cancel";

export interface TranslationRoomDto {
  id: string;
  workspaceId: string;
  hostId: string;
  title: string;
  description?: string;
  translationRoomCode: string;
  status: TranslationRoomStatus;
  translationRoomType: string;
  maxParticipants: number;
  sourceLanguage?: string;
  targetLanguages: string[];
  scheduledAt?: string;
  invitedEmails?: string[];
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  createdAt: string;
  settings?: {
    requiresApproval: boolean;
    /**
     * WT-480: who besides the host may read this meeting's record — its transcript, AI summary
     * and recording, governed together. One of `ArtifactAccessLevels`; absent reads as host-only.
     *
     * The server has always sent this (`RoomSettingsResponse` carries it straight from the
     * settings blob); this type simply never declared it, so no screen could read the state it
     * was already being told.
     */
    artifactAccess?: string;
    /** WT-371: whether anyone in the room may start translation, or only the host. */
    participantsCanStartTranslation?: boolean;
  };
  participantCount?: number;
  /**
   * Distinct people who were ever in the room. `participantCount` is live occupancy and is 0
   * for every finished meeting, so a room that ended showed "0/100" however many attended.
   */
  attendedCount?: number;
  isHost?: boolean;
  /**
   * WT-327: the recurring series this room is an occurrence of, or absent for a one-off room.
   * An occurrence is an ORDINARY meeting in every other respect — its own code, transcript,
   * artifacts and billing — so this is only ever used to say "this repeats" in the UI.
   */
  seriesId?: string;
  /**
   * WT-327: the booking this row stands for, present only on a list that asked to be grouped by
   * series. On an ungrouped list it is absent even for an occurrence, so a caller can never
   * mistake "one occurrence of many" for "the whole booking".
   */
  series?: SeriesListSummary | null;
}

/** One Start→Pause (or Start→End) window — "Translation N" in the transcript is this
 * list's chronological position (oldest first). */
export interface TranslationRoomSessionDto {
  id: string;
  translationRoomId: string;
  mainLanguage: string;
  audioUrl?: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface TranslationRoomParticipantDto {
  id: string;
  translationRoomId: string;
  userId: string;
  displayName: string;
  role: "host" | "participant" | "interpreter" | "HOST" | "PARTICIPANT" | "INTERPRETER";
  listenLanguage: string;
  speakLanguage: string;
  status: "invited" | "waiting" | "joined" | "connected" | "disconnected" | "left" | "removed" | "kicked" | "rejected";
  isTranslationAudioEnabled?: boolean;
  isUsingVoiceClone?: boolean;
  avatarUrl?: string;
  joinedAt?: string;
  isExternal?: boolean;
}

// ── Request DTOs ──────────────────────────────

export interface CreateTranslationRoomRequest {
  workspaceId: string;
  title: string;
  description?: string;
  /** One of MEETING_TYPES' `value` (src/lib/meeting-types.ts). */
  translationRoomType: string;
  /** Omit to let the meeting type decide the seat count. */
  maxParticipants?: number;
  sourceLanguage: string;
  targetLanguages: string[];
  /**
   * Every field optional and only sent when the user overrides it — the meeting type seeds
   * whatever is left out, so sending `false` is not the same as sending nothing.
   */
  settings?: {
    requiresApproval?: boolean;
    artifactAccess?: string;
    muteOnEntry?: boolean;
    autoRecord?: boolean;
    breakoutsEnabled?: boolean;
    participantsCanStartTranslation?: boolean;
  };
  scheduledAt?: string;
  invitedEmails?: string[];
  /**
   * WT-327: present means "this is a repeating booking, not a single meeting". The server
   * derives every occurrence's `scheduledAt` from this rule, so sending BOTH `recurrence` and
   * `scheduledAt` is refused rather than silently resolved in favour of one of them.
   */
  recurrence?: RecurrenceRequest;
}

/**
 * WT-327: the daily repeat rule.
 *
 * Time is a WALL CLOCK plus an IANA zone, never a UTC instant: "08:00 daily" is a statement
 * about the clock on the wall in `timeZone`, and it has to stay 08:00 there even if that zone's
 * rules change. Sending a UTC instant, or a fixed offset, cannot express that.
 */
export interface RecurrenceRequest {
  type: RecurrenceType;
  /** "HH:mm", 24-hour, zero-padded. The hour picked in the repeat modal. */
  startTimeLocal: string;
  /** IANA zone id, e.g. "Asia/Ho_Chi_Minh". Read from the browser, not hardcoded. */
  timeZone: string;
  /** "yyyy-MM-dd". Omitted lets the server pick the next occurrence. */
  startDateLocal?: string;
  /** "yyyy-MM-dd", INCLUSIVE. Omitted means the server's default span — never "forever". */
  endDateLocal?: string;
  /**
   * WEEKLY only: ISO weekdays, Monday 1 … Sunday 7. Omitted means "the weekday the start date
   * lands on". Sending it on a DAILY or MONTHLY rule is refused by the server, not ignored — the
   * rule on screen and the rule that runs have to be the same rule.
   */
  byWeekdays?: number[];
  /** MONTHLY only: day of the month 1–31. Omitted means the start date's own day. */
  byMonthDay?: number;
}

export type RecurrenceType = "DAILY" | "WEEKLY" | "MONTHLY";

export type RecurrenceSeriesStatus = "ACTIVE" | "CANCELLED" | "COMPLETED";

/** WT-327: what a room reports about the series it belongs to. */
export interface RecurrenceSummaryResponse {
  seriesId: string;
  type: RecurrenceType;
  startTimeLocal: string;
  timeZone: string;
  startDateLocal: string;
  endDateLocal: string;
  status: RecurrenceSeriesStatus;
  interval: number;
  byWeekdays?: number[] | null;
  byMonthDay?: number | null;
}

/**
 * WT-327: the booking behind ONE row of a grouped meetings list — enough to render
 * "Weekly · Mon, Wed · 08:00 · next Thursday" without a request per row.
 *
 * Present only when the list was asked to group by series. Its absence on an occurrence row is
 * meaningful: that row is one meeting, not the whole booking.
 */
export interface SeriesListSummary {
  seriesId: string;
  type: RecurrenceType;
  interval: number;
  byWeekdays?: number[] | null;
  byMonthDay?: number | null;
  startTimeLocal: string;
  timeZone: string;
  status: RecurrenceSeriesStatus;
  /** Occurrences matching the same filters as the list — "3 meetings still to come", not the lifetime total. */
  occurrenceCount: number;
  /** UTC ISO of the first occurrence at or after now, or null when the rest are in the past. */
  nextOccurrenceAt?: string | null;
}

/** WT-327: the booking, its rule, and every occurrence the caller may see. */
export interface SeriesDetail {
  series: RecurrenceSummaryResponse;
  hostId: string;
  title: string;
  description?: string | null;
  translationRoomType: string;
  sourceLanguage: string;
  targetLanguages: string[];
  invitedEmails: string[];
  occurrences: TranslationRoomDto[];
  /**
   * The occurrence a "join this booking" action lands on: the one running now, else the next one
   * due. Null once the whole series is in the past — which is what makes a stable series link say
   * "nothing to join" rather than dropping someone into a finished meeting.
   */
  currentOccurrenceId?: string | null;
}

/**
 * WT-327: an edit to the BOOKING — the template every future occurrence is stamped from.
 *
 * The rule itself (cadence, time, date range) is deliberately not editable: moving a series has
 * to decide what happens to occurrences already invited to and possibly already started, and
 * that is a different feature with different confirmations.
 */
export interface UpdateSeriesRequest {
  title?: string;
  description?: string;
  maxParticipants?: number;
  sourceLanguage?: string;
  targetLanguages?: string[];
  settings?: CreateTranslationRoomRequest["settings"];
  invitedEmails?: string[];
}

export interface UpdateSeriesResult {
  seriesId: string;
  /** Future occurrences the edit reached. Meetings that already started keep what they ran with. */
  updatedOccurrenceCount: number;
}

/**
 * WT-327: what POST /translation-rooms returns when the request carried a `recurrence` block.
 * `firstOccurrence` is an ordinary room, so the dialog's success screen is unchanged.
 */
export interface CreateRecurringRoomResponse {
  series: RecurrenceSummaryResponse;
  firstOccurrence: TranslationRoomDto;
  /** How many rooms exist right now; the rest arrive as the server's horizon rolls forward. */
  materializedOccurrenceCount: number;
  /** How many the series will have in total. */
  totalOccurrenceCount: number;
}

export interface CancelSeriesResult {
  seriesId: string;
  cancelledOccurrenceCount: number;
}

export interface TranslationRoomListResponse {
  rooms: TranslationRoomDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JoinTranslationRoomRequest {
  displayName: string;
  listenLanguage: string;
  speakLanguage: string;
}

export type JoinTranslationRoomAccessStatus =
  | "idle"
  | "loading"
  | "invalid_code"
  | "room_unavailable"
  | "room_full"
  | "kicked"
  | "rejected"
  | "success";

export interface JoinTranslationRoomByCodeRequest extends JoinTranslationRoomRequest {
  translationRoomCode: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
}

export interface TranslationRoomPreflightDto {
  id: string;
  title: string;
  translationRoomCode: string;
  status: TranslationRoomStatus;
  maxParticipants: number;
  currentParticipants: number;
  topics: string[];
  keyTerms: string[];
  sourceLanguage: string;
  targetLanguages: string[];
  defaultTargetLanguage: string;
  translationMode: "single" | "multi";
  desktopAppRequired: boolean;
}

export interface JoinTranslationRoomResultDto {
  status: JoinTranslationRoomAccessStatus;
  message: string;
  room?: TranslationRoomPreflightDto;
  participant?: TranslationRoomParticipantDto;
}

export interface TranslationRoomFeedbackDto {
  id: string;
  translationRoomId: string;
  userId: string;
  overallRating: number;
  translationQuality?: number;
  audioQuality?: number;
  voiceCloneQuality?: number;
  aiSummaryQuality?: number;
  comments?: string;
  communicationInsights?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationRoomInvitationDto {
  id: string;
  translationRoomId: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitTranslationRoomFeedbackRequest {
  overallRating: number;
  translationQuality?: number;
  audioQuality?: number;
  voiceCloneQuality?: number;
  aiSummaryQuality?: number;
  comments?: string;
}

export interface TranslationRoomFeedbackStateDto {
  hasSubmitted: boolean;
  feedback?: TranslationRoomFeedbackDto;
}

export interface TranslationRoomArtifactDto {
  id: string;
  translationRoomId: string;
  type: string;
  title: string;
  fileUrl?: string;
  fileFormat?: string;
  fileSizeBytes?: number;
  containsRawAudio: boolean;
  containsRawVideo: boolean;
  consentRequired: boolean;
  retentionUntil?: string;
  status: string;
  createdAt: string;
  /** Inline artifact payload (e.g. the AI meeting-summary JSON). Null for artifact types
   * that only carry a fileUrl (transcript export, recording). */
  content?: string | null;
  /** When the CONTENT last changed — moved by a summary rewrite. Absent on artifacts written
   *  before the column existed; read that as unknown and fall back to createdAt. */
  updatedAt?: string | null;
  /** WT-473: when the recording BEGAN. Absent means NOT SEEKABLE, never zero. */
  recordingStartedAt?: string | null;
}

export interface TranslationRoomHistoryItemDto {
  room: TranslationRoomDto;
  participants: TranslationRoomParticipantDto[];
  artifacts: TranslationRoomArtifactDto[];
}

export interface TranslationRoomHistoryResponse {
  rooms: TranslationRoomHistoryItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateRoomSettingsRequest {
  title?: string;
  description?: string;
  maxParticipants?: number;
  scheduledAt?: string;
  invitedEmails?: string[];
  sourceLanguage?: string;
  targetLanguages?: string[];
  settings?: Record<string, unknown>;
}

export interface RoomPreflightResponse {
  roomCode: string;
  requiresJoinRequest: boolean;
  isUserMember: boolean;
  isDomainMatched: boolean;
  allowExternalCollaboration: boolean;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
  isAuthenticated: boolean;
}
