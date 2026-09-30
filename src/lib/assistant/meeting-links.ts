/**
 * The meetings a WarpBot answer created, read from the markers the worker appends to it.
 *
 * WHY A MARKER
 *   When a tool creates a meeting, the worker appends `<!-- warpbot:meeting {json} -->` to the
 *   answer (see ai_assistant_worker/meeting_links.py). Markdown renders nothing for a comment, so
 *   the reader sees the prose and the card drawn from it: link, code, time, Calendar event. It is
 *   stored with the message, so the card comes back when a conversation is reopened.
 *
 * ONLY MARKERS, NEVER LINKS IN PROSE
 *   A link in an answer about yesterday's meetings is not a meeting WarpBot just created, and a
 *   card for it would say otherwise. Cards also carry a Join button, so every URL is checked: a
 *   Google Meet link must be on meet.google.com, a room link must be this app's own /rooms/{id},
 *   and a Calendar link must be on Google's calendar host.
 *
 * TWO KINDS, NEVER CONFUSED
 *   A Google Meet meeting is hosted by Google; a WarpTalk room is hosted here. A room of type
 *   EXTERNAL_BRIDGE is the WarpTalk side that translates a Google Meet meeting.
 */

export type MeetingLinkKind = "google_meet" | "warptalk_room";

export type MeetingLinkRef = {
  kind: MeetingLinkKind;
  url: string;
  /** Google Meet code (abc-defg-hij) or the room id: what makes two markers the same meeting. */
  id: string;
  title?: string;
  /** Google Meet: the meeting code. Room: the room code people type to join. */
  code?: string;
  start?: string;
  end?: string;
  calendarUrl?: string;
  roomType?: string;
};

const MARKER = /<!-- warpbot:meeting (\{[^\n]*?\}) -->/g;
const MEET_URL = /^https:\/\/meet\.google\.com\/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})(?:\?[^\s#]*)?$/;
const ROOM_URL =
  /^\/(?:[\w-]+\/)?rooms\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
const CALENDAR_URL = /^https:\/\/(?:www\.google\.com\/calendar|calendar\.google\.com)\//;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toRef(raw: unknown): MeetingLinkRef | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const url = text(record.url);
  if (!url) return null;

  const base = {
    url,
    title: text(record.title),
    start: text(record.start),
    end: text(record.end),
  };

  if (record.kind === "google_meet") {
    const meet = MEET_URL.exec(url);
    if (!meet) return null;
    const calendarUrl = text(record.calendarUrl);
    return {
      ...base,
      kind: "google_meet",
      id: meet[1],
      code: meet[1],
      calendarUrl: calendarUrl && CALENDAR_URL.test(calendarUrl) ? calendarUrl : undefined,
    };
  }

  if (record.kind === "warptalk_room") {
    const room = ROOM_URL.exec(url);
    if (!room) return null;
    return {
      ...base,
      kind: "warptalk_room",
      id: room[1].toLowerCase(),
      code: text(record.code),
      roomType: text(record.roomType),
    };
  }
  return null;
}

export function extractMeetingLinks(markdown: string): MeetingLinkRef[] {
  if (!markdown || !markdown.includes("warpbot:meeting")) return [];
  const found: MeetingLinkRef[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(MARKER)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const ref = toRef(parsed);
    if (!ref) continue;
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(ref);
  }
  return found;
}

/** The answer without its markers, for surfaces that print text rather than render markdown. */
export function stripMeetingMarkers(markdown: string): string {
  return markdown.replace(MARKER, "").replace(/\n{3,}/g, "\n\n").trimEnd();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localDay(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / DAY_MS);
}

function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * "Today 15:40 – 16:10", "Tomorrow 15:00", "Mon 22 Sep 09:00 – 10:00", in the viewer's time zone.
 * Empty when there is no usable start.
 */
export function formatMeetingWhen(start?: string, end?: string, now: Date = new Date()): string {
  if (!start) return "";
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return "";
  const to = end ? new Date(end) : null;

  const days = localDay(from) - localDay(now);
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : from.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  if (!to || Number.isNaN(to.getTime())) return `${day} ${clock(from)}`;
  return `${day} ${clock(from)} – ${clock(to)}`;
}
