/**
 * The workspace's written record, as one list.
 *
 * WHY THIS EXISTS
 *   Everything WarpTalk writes down about a meeting — the transcript, the AI summary, the biên
 *   bản — has only ever been reachable THROUGH that meeting. To read a transcript you first had
 *   to remember which meeting produced it, find that meeting in the archive, open it, and scroll
 *   to the right panel. The sidebar even records the decision: "No Transcripts entry: a meeting's
 *   transcript, summary and files live on that meeting's own page."
 *
 *   That is the right answer for "what happened in Tuesday's standup?" and the wrong one for
 *   every question a record is actually kept to answer: what did we decide about the budget,
 *   which meetings have a signed minutes, what is there of this quarter, who can read it. Those
 *   are questions about the DOCUMENTS, and a document you can only reach through its meeting is a
 *   filing cabinet with no index.
 *
 * WHAT IS AND IS NOT IN HERE
 *   Only what WarpTalk WROTE: transcript, AI summary, minutes. Not the recording, and not the
 *   debug log or audio sample — a video is not read, searched or cited, and the two diagnostics
 *   are engineering output that happens to be stored beside the record. They stay on the meeting
 *   page, where somebody looking for a file will look.
 *
 * PURE ON PURPOSE
 *   The node test runner strips types but cannot parse JSX, so the decisions with edge cases —
 *   what counts as readable, what a search matches, what a card says when there is nothing to
 *   show — live here rather than in the page that renders them.
 */

import { readableArtifactBody } from "./artifact-content.ts";
import { foldSearchText } from "../ui/search-text.ts";
import { parseMinutesContent } from "../../types/meetingMinutes.ts";
import { sectionTitle } from "./meeting-summary.ts";

import type { EndedRoomHistoryItem, RoomHistoryArtifact } from "@/types/roomHistory";
import type { MeetingMinutesDto } from "@/types/meetingMinutes";
import type { WorkspaceMinutesItem } from "@/types/workspaceMinutes";

export type ArtifactKind = "transcript" | "summary" | "minutes";

/**
 * Why an entry has no body to show. Never collapsed into one "unavailable": the three need
 * different sentences because they need different next actions — wait, ask the host, or accept
 * that the meeting produced nothing.
 */
export type ArtifactAbsence =
  /** The row exists and somebody can read it. Not this viewer. */
  | "withheld"
  /** Still being produced. The summary lands roughly 40s after a meeting ends. */
  | "generating"
  /** It ran, and there was nothing to write down. */
  | "empty"
  /** It failed, expired, or the file behind it is gone. */
  | "unavailable";

export type LibraryEntry = {
  /** The artifact or minutes row id — unique across kinds because both are uuids. */
  id: string;
  kind: ArtifactKind;
  /** What the card calls it: "Transcript", "AI summary", or the minutes number. */
  title: string;
  /** One word for the state the document is in, already capitalised for display. */
  statusLabel: string;
  roomId: string;
  roomTitle: string;
  roomCode: string;
  hostId: string;
  hostName: string;
  /** When the meeting ended. What the library sorts and groups by. */
  meetingEndedAt: string;
  durationSeconds: number;
  participantCount: number;
  sourceLanguage: string;
  targetLanguages: string[];
  /** Readable text, or null when there is nothing to read — see `absence`. */
  body: string | null;
  absence: ArtifactAbsence | null;
  /** When the document itself last changed, falling back to when it was created. */
  changedAt: string | null;
  /** Minutes only: who signed it and who approved it, for a reader checking the paper trail. */
  secretaryName?: string | null;
  chairName?: string | null;
  /** The number of edits a person made to the drafted minutes before signing. */
  editCountVsDraft?: number;
};

const KIND_BY_ARTIFACT_TYPE: Partial<Record<RoomHistoryArtifact["type"], ArtifactKind>> = {
  transcript_export: "transcript",
  summary_export: "summary",
};

export const KIND_LABELS: Record<ArtifactKind, string> = {
  transcript: "Transcript",
  summary: "AI summary",
  minutes: "Minutes",
};

/**
 * Why an artifact row has no readable body.
 *
 * `content` absent while the row is `ready` is the withheld case, and it is the COMMON one: room
 * artifacts default to HOST_ONLY, so a participant reading the archive of a meeting they attended
 * gets rows with no bodies. Reporting that as "nothing here" is the same defect summary-absence.ts
 * was written for — "you may not see this" rendered as "this does not exist".
 */
function artifactAbsence(artifact: RoomHistoryArtifact): ArtifactAbsence {
  if (artifact.status === "processing") return "generating";
  if (artifact.status === "ready") return "withheld";
  return "unavailable";
}

function artifactStatusLabel(artifact: RoomHistoryArtifact): string {
  if (artifact.status === "processing") return "Generating";
  if (artifact.status === "ready") return "Ready";
  return artifact.status.charAt(0).toUpperCase() + artifact.status.slice(1);
}

/**
 * The minutes document as flowing text — what the card previews and what a search reads.
 *
 * Sections are rendered under their own headings rather than concatenated, so a preview shows
 * "Decisions" above the decisions rather than a paragraph that runs into a list. The heading
 * comes from the same `sectionTitle` the summary uses, because a minutes section and a summary
 * section carry the same keys and must not be titled two different ways in one library.
 */
export function minutesBodyText(minutes: MeetingMinutesDto): string {
  const content = parseMinutesContent(minutes.content);
  const lines: string[] = [];

  if (content.agenda?.trim()) lines.push(content.agenda.trim());

  for (const section of content.sections) {
    const items = (section.items ?? [])
      .map((item) => `• ${item.owner ? `${item.owner}: ` : ""}${item.text}`.trim())
      .filter((line) => line.length > 2);
    const text = section.text?.trim();

    if (!text && items.length === 0) continue;

    if (lines.length) lines.push("");
    lines.push(sectionTitle(section.key));
    if (text) lines.push(text);
    lines.push(...items);
  }

  for (const vote of content.votes) {
    if (lines.length) lines.push("");
    lines.push(
      `${vote.topic}: ${vote.forCount} for, ${vote.againstCount} against, ${vote.abstainCount} abstained`,
    );
  }

  if (content.notes?.trim()) {
    if (lines.length) lines.push("");
    lines.push(content.notes.trim());
  }

  return lines.join("\n").trim();
}

const MINUTES_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "Signed",
  APPROVED: "Approved",
};

/**
 * IN_REVIEW reads as "Signed", not as "In review".
 *
 * The stored word describes the workflow's opinion of the row; the reader wants to know what
 * happened to the document. A biên bản reaches IN_REVIEW at the moment the secretary signs it, so
 * "Signed" is both what occurred and what distinguishes it from a draft nobody has taken
 * responsibility for.
 */
export function minutesStatusLabel(status: string): string {
  return MINUTES_STATUS_LABELS[status] ?? status;
}

/**
 * Every written record in the workspace, newest meeting first.
 *
 * Minutes arrive from their own endpoint and carry their own room facts, so a minutes document
 * for a meeting that is not on the loaded history page still lists correctly rather than being
 * silently dropped for want of a room to hang it on.
 */
export function buildArtifactLibrary({
  rooms,
  minutes = [],
}: {
  rooms: EndedRoomHistoryItem[];
  minutes?: WorkspaceMinutesItem[];
}): LibraryEntry[] {
  const entries: LibraryEntry[] = [];

  for (const room of rooms) {
    for (const artifact of room.artifacts) {
      const kind = KIND_BY_ARTIFACT_TYPE[artifact.type];
      if (!kind) continue;

      const raw = artifact.content?.trim() ? readableArtifactBody(artifact.content) : "";
      const hasBody = raw.trim().length > 0;

      entries.push({
        id: artifact.id,
        kind,
        title: KIND_LABELS[kind],
        statusLabel: artifactStatusLabel(artifact),
        roomId: room.id,
        roomTitle: room.title,
        roomCode: room.translationRoomCode,
        hostId: room.hostId,
        hostName: room.hostName,
        meetingEndedAt: room.endedAt,
        durationSeconds: room.durationSeconds,
        participantCount: room.participantCount,
        sourceLanguage: room.sourceLanguage,
        targetLanguages: room.targetLanguages,
        body: hasBody ? raw : null,
        absence: hasBody ? null : artifactAbsence(artifact),
        changedAt: artifact.updatedAt ?? artifact.createdAt ?? room.endedAt,
      });
    }
  }

  for (const item of minutes) {
    const body = minutesBodyText(item.minutes);

    entries.push({
      id: item.minutes.id,
      kind: "minutes",
      // The number, not "Minutes". It is what the document is filed under and referred to in
      // writing, and a wall of cards all reading "Minutes" tells the reader nothing.
      title: item.minutes.minutesNo,
      statusLabel: minutesStatusLabel(item.minutes.status),
      roomId: item.minutes.translationRoomId,
      roomTitle: item.roomTitle,
      roomCode: item.roomCode,
      hostId: item.roomHostId,
      // The minutes endpoint answers with the room, not its roster — the host's NAME is only
      // known when the same meeting is on the loaded history page.
      hostName:
        rooms.find((room) => room.id === item.minutes.translationRoomId)?.hostName ?? "Host",
      meetingEndedAt: item.roomEndedAt ?? item.minutes.createdAt,
      durationSeconds:
        rooms.find((room) => room.id === item.minutes.translationRoomId)?.durationSeconds ?? 0,
      participantCount: parseMinutesContent(item.minutes.content).attendance.presentCount,
      sourceLanguage:
        rooms.find((room) => room.id === item.minutes.translationRoomId)?.sourceLanguage ?? "",
      targetLanguages:
        rooms.find((room) => room.id === item.minutes.translationRoomId)?.targetLanguages ?? [],
      body: body.length > 0 ? body : null,
      // A biên bản is never withheld and never generated in the background: the server would not
      // have listed it, and a secretary opens the draft by hand. An empty one is a draft nobody
      // has written yet.
      absence: body.length > 0 ? null : "empty",
      changedAt: item.minutes.updatedAt ?? item.minutes.createdAt,
      secretaryName: item.minutes.secretaryName,
      chairName: item.minutes.chairName,
      editCountVsDraft: item.minutes.editCountVsDraft,
    });
  }

  return entries.sort(byMeetingThenKind);
}

/**
 * Newest meeting first, and within a meeting always transcript, summary, minutes.
 *
 * The kind order is fixed rather than derived from a timestamp because it is the order the
 * documents are produced in and the order a reader expects to find them — the transcript is the
 * evidence, the summary reads it, the minutes are signed off it. Sorting those three by their own
 * `changedAt` would shuffle one meeting's row every time somebody edited its minutes.
 */
const KIND_ORDER: Record<ArtifactKind, number> = { transcript: 0, summary: 1, minutes: 2 };

function byMeetingThenKind(a: LibraryEntry, b: LibraryEntry): number {
  const newer = Date.parse(b.meetingEndedAt) || 0;
  const older = Date.parse(a.meetingEndedAt) || 0;
  if (newer !== older) return newer - older;
  if (a.roomId !== b.roomId) return a.roomId < b.roomId ? -1 : 1;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

export type LibraryFilters = {
  /** null means every kind. */
  kind?: ArtifactKind | null;
  /** Only meetings this viewer hosted. */
  hostedBy?: string | null;
  query?: string;
};

/**
 * What a search term matches.
 *
 * The BODY is searched, not only the title — that is the whole point of the page. "Which meeting
 * was the budget decided in?" is a question about what a document says, and every other surface
 * in the product could only answer it one meeting at a time.
 *
 * Folded on both sides, so "bien ban" finds "Biên bản" and "manh" finds "Mạnh" (WT-231). The
 * server searches the same term unfolded across the whole archive; this narrows the page that
 * came back. The two agree on everything a person actually types.
 */
export function entryMatches(entry: LibraryEntry, query: string): boolean {
  const term = foldSearchText(query);
  if (!term) return true;

  return [
    entry.title,
    entry.roomTitle,
    entry.roomCode,
    entry.hostName,
    entry.secretaryName ?? "",
    entry.chairName ?? "",
    entry.body ?? "",
  ].some((value) => foldSearchText(value).includes(term));
}

export function narrowLibrary(entries: LibraryEntry[], filters: LibraryFilters): LibraryEntry[] {
  return entries.filter((entry) => {
    if (filters.kind && entry.kind !== filters.kind) return false;
    if (filters.hostedBy && entry.hostId !== filters.hostedBy) return false;
    return entryMatches(entry, filters.query ?? "");
  });
}

/**
 * The first lines of a document, for the preview on a card.
 *
 * Cut at a word boundary and never mid-word: a preview ending "the quarterly bud" reads as
 * corrupted text rather than as a document that continues. Blank lines collapse, because the
 * card is centimetres tall and a paragraph break spends a third of it saying nothing.
 */
export function entryExcerpt(entry: LibraryEntry, maxChars = 320): string {
  if (!entry.body) return "";

  const flat = entry.body.replace(/\n{2,}/g, "\n").trim();
  if (flat.length <= maxChars) return flat;

  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The sentence a card shows in place of a preview.
 *
 * Written for the person reading it, not for the system: a withheld document is somebody's
 * decision and names who can change it, which is the difference between "ask the host" and
 * "this product is broken".
 */
export function describeAbsence(absence: ArtifactAbsence, kind: ArtifactKind): string {
  switch (absence) {
    case "withheld":
      return "Only the host can read this until they share the meeting's record.";
    case "generating":
      return kind === "summary"
        ? "The assistant is still writing this summary."
        : "This is still being produced.";
    case "empty":
      return kind === "minutes"
        ? "Drawn up but not written yet."
        : "Nobody spoke, so there was nothing to write down.";
    case "unavailable":
      return "The file behind this is no longer available.";
  }
}

/**
 * "6h ago", "Aug 28" — how the card dates a document.
 *
 * Relative only inside a week. Past that, a weekday-less "36 days ago" is arithmetic the reader
 * has to do in their head to get back to a date, and a date is what they were looking for.
 */
export function relativeTime(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "—";
  const at = Date.parse(value);
  if (Number.isNaN(at)) return "—";

  const seconds = Math.round((now - at) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

/** How many of each kind are in a list, for the counts beside the filter chips. */
export function countByKind(entries: LibraryEntry[]): Record<ArtifactKind, number> {
  const counts: Record<ArtifactKind, number> = { transcript: 0, summary: 0, minutes: 0 };
  for (const entry of entries) counts[entry.kind] += 1;
  return counts;
}
