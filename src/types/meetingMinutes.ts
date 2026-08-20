/**
 * Biên bản họp — the signed meeting record.
 *
 * Distinct from the AI summary in `meetingSummary.ts`, and deliberately so: the summary is what
 * a model wrote and nobody owns, while this has a number, a date of record, an attendance list,
 * a named secretary and a chair, and a state after which it does not change.
 *
 * Mirrors MeetingMinutesDto and MeetingMinutesContent in
 * warptalk-backend/translation-room. `content` arrives as a JSON string and is parsed here, then
 * sent back as a string — the server stores it verbatim, so a field this client does not know
 * about survives a round trip through an older web instead of being silently dropped.
 */

export type MinutesStatus = "DRAFT" | "IN_REVIEW" | "APPROVED";

export interface MinutesAttendee {
  participantId: string;
  name: string;
  role?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
  /** Not a member of this workspace when they joined — a guest, on the record as one. */
  isExternal: boolean;
  /** What language this person spoke. On a bilingual record, which half is the original. */
  speakLanguage?: string | null;
}

export interface MinutesAbsentee {
  participantId: string;
  name: string;
  /** Vắng có phép / không phép. The secretary's to state; the system cannot know it. */
  reason?: string | null;
}

export interface MinutesAttendance {
  present: MinutesAttendee[];
  absent: MinutesAbsentee[];
  invitedCount: number;
  presentCount: number;
  /** The bar being applied, in words — a bare boolean would not say what it means. */
  quorumRule?: string | null;
  /** Null when nobody was formally invited: an ad-hoc room has no roll to be a majority of. */
  quorumMet?: boolean | null;
}

export interface MinutesItem {
  text: string;
  owner?: string | null;
  /** Where in the meeting this came from — what lets a reader check a signed line. */
  atMs?: number | null;
}

export interface MinutesSection {
  /** The summary template's key. The title is rendered from it; see meeting-summary.ts. */
  key: string;
  kind: "paragraph" | "items";
  text?: string | null;
  items?: MinutesItem[] | null;
}

export interface MinutesVote {
  topic: string;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  atMs?: number | null;
}

export interface MeetingMinutesContent {
  meetingTitle?: string | null;
  location?: string | null;
  /** When the meeting was called to order — the first participant's join. */
  openedAt?: string | null;
  closedAt?: string | null;
  /** Kept beside the real opening time, because "started late" is itself a fact. */
  scheduledAt?: string | null;
  agenda?: string | null;
  attendance: MinutesAttendance;
  sections: MinutesSection[];
  votes: MinutesVote[];
  notes?: string | null;
}

export interface MeetingMinutesDto {
  id: string;
  translationRoomId: string;
  minutesNo: string;
  status: MinutesStatus;
  version: number;
  isCurrent: boolean;
  previousMinutesId?: string | null;
  /** Which transcript version the draft was drawn from; a newer one means a revision is due. */
  basedOnTranscriptVersion?: number | null;
  /** The program that produced the draft. NEVER the answerable party — see secretaryName. */
  draftedByEngine?: string | null;
  draftedAt?: string | null;
  secretaryParticipantId?: string | null;
  secretaryName?: string | null;
  secretarySignedAt?: string | null;
  chairParticipantId?: string | null;
  chairName?: string | null;
  chairApprovedAt?: string | null;
  /** How much the secretary changed before signing — the reader's evidence a person read it. */
  editCountVsDraft: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_ATTENDANCE: MinutesAttendance = {
  present: [],
  absent: [],
  invitedCount: 0,
  presentCount: 0,
};

/**
 * The stored JSON as an object, or an empty document when it cannot be read.
 *
 * Never throws. A minutes row whose content failed to parse should still render its number, its
 * status and its signatures — those live in columns, and hiding the whole document because one
 * field is malformed would lose the part that is definitely correct.
 */
export function parseMinutesContent(raw: string | null | undefined): MeetingMinutesContent {
  if (!raw) return { attendance: { ...EMPTY_ATTENDANCE }, sections: [], votes: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<MeetingMinutesContent>;
    return {
      ...parsed,
      attendance: {
        ...EMPTY_ATTENDANCE,
        ...(parsed.attendance ?? {}),
        present: parsed.attendance?.present ?? [],
        absent: parsed.attendance?.absent ?? [],
      },
      sections: parsed.sections ?? [],
      votes: parsed.votes ?? [],
    };
  } catch {
    return { attendance: { ...EMPTY_ATTENDANCE }, sections: [], votes: [] };
  }
}

/** Whether the document is still open to editing. Approved minutes are never edited in place. */
export function isEditable(minutes: MeetingMinutesDto | undefined): boolean {
  return minutes != null && minutes.status !== "APPROVED";
}
