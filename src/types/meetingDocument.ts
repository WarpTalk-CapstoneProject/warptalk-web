/**
 * A meeting's outputs, seen as DOCUMENTS rather than as meetings.
 *
 * The archive (`types/roomHistory.ts`) is meeting-shaped: one entry per room with its outputs
 * folded inside. That answers "what meetings did we hold?" and cannot answer "where is that
 * transcript?", which is the question people actually arrive with. This is the same data, one
 * entry per document, and it is the only shape that can hold minutes — those are not artifacts
 * and the archive endpoint has never returned them.
 *
 * Mirrors MeetingDocumentDto in warptalk-backend/translation-room.
 */

/**
 * Note `minutes`, which `RoomArtifactType` has no member for, and `recording`, which the server
 * stores as `OPTIONAL_RECORDING` and normalises on the way out — so this list is the wire
 * vocabulary, not the storage vocabulary.
 */
export type MeetingDocumentType =
  | "TRANSCRIPT_EXPORT"
  | "SUMMARY_EXPORT"
  | "RECORDING"
  | "MINUTES";

/**
 * Why a meeting cannot have minutes drawn up right now.
 *
 * A code rather than a sentence: the server refuses to guess the reader's language, and the
 * wording belongs with the UI that has to say it.
 */
export type MinutesUnavailableReason =
  /** Still running, or cancelled before it ran. */
  | "MEETING_NOT_ENDED"
  /** Minutes already exist — the action is "open", not "draw up". */
  | "ALREADY_DRAFTED"
  /** Only the meeting's chair may draw up its minutes. */
  | "NOT_THE_CHAIR"
  /**
   * Nobody spoke, so there are no proceedings to record. By far the most common answer: 161 of
   * production's 275 summaries report insufficient data, and 151 of those meetings genuinely had
   * no speech. Drawing minutes up anyway would consume a number from the workspace's yearly
   * sequence and produce an attendance list with nothing under it.
   */
  | "NOTHING_TO_RECORD";

export interface MeetingDocumentDto {
  id: string;
  type: MeetingDocumentType;
  /** `COMPLETED` and friends for artifacts; `DRAFT` / `IN_REVIEW` / `APPROVED` for minutes. */
  status: string;
  translationRoomId: string;
  workspaceId: string;
  meetingTitle: string;
  translationRoomCode: string;
  meetingStatus: string;
  meetingEndedAt?: string | null;
  sourceLanguage?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  fileFormat?: string | null;
  fileSizeBytes?: number | null;
  consentRequired: boolean;
  /**
   * Whether this viewer may read the body, decided by the same predicate the download endpoint
   * uses. Rooms default to HOST_ONLY, so a participant seeing somebody else's summary listed is
   * the ordinary case — the card shows a lock rather than looking available and failing on click.
   */
  canOpen: boolean;
  /** Minutes only. */
  minutesNo?: string | null;
  /** Minutes only. */
  minutesVersion?: number | null;
  /** Whether this document's meeting already has minutes. */
  roomHasMinutes: boolean;
  isHost: boolean;
  /** Whether offering "draw up the minutes" here would produce a document with a body. */
  canDraftMinutes: boolean;
  /** Set only when {@link canDraftMinutes} is false. */
  minutesUnavailableReason?: MinutesUnavailableReason | null;
}

export interface MeetingDocumentsResponse {
  documents: MeetingDocumentDto[];
  /** The server's count for the current filters — NOT `documents.length`. */
  total: number;
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface MeetingDocumentsQuery {
  workspaceId?: string;
  /** Comma-separated widens the filter in one request. Omit for all four types. */
  type?: string;
  /** Matched against the MEETING's title, code and description — documents have no title. */
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * A screenful of cards. Smaller than the archive's 100 because a card is far taller than a table
 * row: a hundred of them is a scroll nobody reaches the end of, and the pager is now real.
 */
export const MEETING_DOCUMENTS_PAGE_SIZE = 24;

const DOCUMENT_LABELS: Record<MeetingDocumentType, string> = {
  TRANSCRIPT_EXPORT: "Transcript",
  SUMMARY_EXPORT: "AI summary",
  RECORDING: "Recording",
  MINUTES: "Minutes",
};

export function meetingDocumentLabel(type: MeetingDocumentType): string {
  return DOCUMENT_LABELS[type];
}

/**
 * What to tell the reader instead of offering the button.
 *
 * `NOTHING_TO_RECORD` gets a sentence about the MEETING, not about the feature: nothing failed,
 * there was simply nothing said, and phrasing it as an error would send somebody looking for a
 * bug that does not exist.
 */
const MINUTES_UNAVAILABLE_COPY: Record<MinutesUnavailableReason, string> = {
  MEETING_NOT_ENDED: "Minutes can be drawn up once this meeting has ended.",
  ALREADY_DRAFTED: "Minutes have already been drawn up for this meeting.",
  NOT_THE_CHAIR: "Only the meeting's chair can draw up its minutes.",
  NOTHING_TO_RECORD: "No one spoke in this meeting, so there are no proceedings to record.",
};

export function minutesUnavailableCopy(
  reason: MinutesUnavailableReason | null | undefined,
): string | null {
  return reason ? MINUTES_UNAVAILABLE_COPY[reason] : null;
}

/**
 * The format the reader will actually receive.
 *
 * Mirrors `artifactDownloadFormat` in lib/meeting/meeting-artifacts.ts and for the same reason:
 * `fileFormat` describes the STORED bytes (markdown for a transcript, json for a summary) while
 * the server hands both over as plain text. Minutes carry no stored format at all — they export
 * as a DOCX built on demand.
 */
export function meetingDocumentFormat(document: MeetingDocumentDto): string {
  if (document.type === "MINUTES") return "DOCX";
  if (document.type === "TRANSCRIPT_EXPORT" || document.type === "SUMMARY_EXPORT") return "TXT";
  return document.fileFormat?.toUpperCase() || "—";
}
