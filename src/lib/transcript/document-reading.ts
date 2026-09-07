/**
 * The arithmetic behind reading a meeting as a document, with its summary beside it.
 *
 * WHY THESE ARE HERE AND NOT IN THE PANEL
 *   Every one of them is a rule that is either right or wrong on a number, and every one of them
 *   only ever runs with a scroll container and a live meeting in front of it. "Which summary claim
 *   covers the paragraph the reader is looking at" is the kind of thing that is off by one turn for
 *   a month before anybody notices, because being off by one turn still highlights *something* and
 *   still looks like it works. Pulled out here they can be pinned by a test that needs neither a
 *   browser nor a transcript.
 *
 *   The panel keeps what genuinely needs the DOM — measuring where a block sits — and hands the
 *   measurements in. Nothing in this file imports React, and nothing in it touches an element.
 */

/**
 * One block of the document, as the reading column laid it out.
 *
 * `offsetTop` is measured from the top of the SCROLLED CONTENT, not from the viewport: it has to
 * survive the reader scrolling, and a viewport-relative number does not.
 */
export type ReadingAnchor = {
  /** Stable across renders — the speaker turn's key, which is its first line's id. */
  key: string;
  /** Milliseconds from the start of the meeting: the span of speech this block holds. */
  startMs: number;
  endMs: number;
  offsetTop: number;
};

/** A summary claim and the moment it says it came from. Claims with no moment never get here. */
export type ReadingCitation = {
  key: string;
  atMs: number;
};

/**
 * How far below the top edge the "line being read" sits.
 *
 * A reader's eye is not on the first visible pixel — it is a couple of lines down, on the first
 * thing they can comfortably see whole. Ninety-six pixels is about three lines at this measure,
 * and it is what stops the rail's highlight jumping to the next claim while the paragraph that
 * claim came from is still filling most of the screen.
 */
export const READING_LINE_OFFSET_PX = 96;

/**
 * The block the reader is actually reading.
 *
 * `readingLinePx` is a scroll position plus a little headroom, not the very top pixel of the
 * viewport: the block whose first line has just scrolled off the top edge is still the one being
 * read, and taking scrollTop alone made the highlight flip to the next claim a fraction of a second
 * before the reader got to it.
 *
 * Anchors must be in document order. The last one starting at or above the line wins; when the
 * reader is above the first block — the top of a document with padding over it — the first block is
 * the answer rather than nothing, because "no block" would blank the rail on arrival.
 */
export function readingAnchorAt(
  anchors: readonly ReadingAnchor[],
  readingLinePx: number,
): ReadingAnchor | null {
  if (anchors.length === 0) return null;

  let current = anchors[0];
  for (const anchor of anchors) {
    if (anchor.offsetTop > readingLinePx) break;
    current = anchor;
  }
  return current;
}

/**
 * Which block a cited moment lands in.
 *
 * A citation is a millisecond offset the assistant recorded while reading the transcript, and it
 * does not have to fall inside a block: a claim can be anchored to a pause between two turns, or to
 * a line that was later corrected and re-timed. So the rule is "the block containing it, otherwise
 * the last block that had started by then" — the same shape as findSegmentAtMs, and for the same
 * reason. Guessing forwards would send a reader to a paragraph nobody had spoken yet.
 *
 * Null only for a moment before the meeting's first recorded word, which is a claim about something
 * that is not in the transcript at all.
 */
export function anchorForMs(
  anchors: readonly ReadingAnchor[],
  atMs: number,
): ReadingAnchor | null {
  let fallback: ReadingAnchor | null = null;
  for (const anchor of anchors) {
    if (atMs >= anchor.startMs && atMs <= anchor.endMs) return anchor;
    if (anchor.startMs <= atMs) fallback = anchor;
  }
  return fallback;
}

/**
 * Every claim, filed under the block it came from.
 *
 * Built once per (citations, anchors) pair rather than asked per scroll frame: the reverse lookup
 * runs on every animation frame while somebody is scrolling a transcript that can be a thousand
 * blocks long, and doing an O(claims x blocks) sweep in there is how a reading surface starts
 * dropping frames on exactly the meetings worth reading.
 */
export function groupCitationsByAnchor(
  citations: readonly ReadingCitation[],
  anchors: readonly ReadingAnchor[],
): Record<string, string[]> {
  const byAnchor: Record<string, string[]> = {};
  for (const citation of citations) {
    const anchor = anchorForMs(anchors, citation.atMs);
    if (!anchor) continue;
    (byAnchor[anchor.key] ??= []).push(citation.key);
  }
  return byAnchor;
}

/**
 * Whether two measurements describe the same document in the same place.
 *
 * The reading column re-measures itself after every layout pass and hands the result to the state
 * the rail reads. Without this the handoff is an infinite loop: a new array is a new value, a new
 * value is a render, a render is another measurement. Compared on the fields the rail actually
 * uses — a sub-pixel wobble in `offsetTop` from a font swapping in is not a document change, so
 * offsets are compared as whole pixels.
 */
export function anchorsEqual(
  left: readonly ReadingAnchor[],
  right: readonly ReadingAnchor[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((anchor, index) => {
    const other = right[index];
    return (
      anchor.key === other.key
      && anchor.startMs === other.startMs
      && anchor.endMs === other.endMs
      && Math.round(anchor.offsetTop) === Math.round(other.offsetTop)
    );
  });
}

/**
 * Where J and K land.
 *
 * CLAMPED, NEVER WRAPPED. Reading is a direction, and a reader holding J at the end of a meeting
 * expects to stop at the end of the meeting — a wrap puts them back at the opening pleasantries
 * with no indication that anything unusual happened, which reads as the transcript having jumped
 * rather than as the list having ended.
 *
 * An unknown `currentKey` — nothing has been read yet, or the block under the eye was just removed
 * by a correction — starts from the top going forwards and the bottom going backwards, so the very
 * first press always moves somewhere rather than doing nothing.
 */
export function stepAnchorKey(
  anchors: readonly ReadingAnchor[],
  currentKey: string | null,
  delta: number,
): string | null {
  if (anchors.length === 0) return null;

  const current = anchors.findIndex((anchor) => anchor.key === currentKey);
  if (current === -1) return anchors[delta < 0 ? anchors.length - 1 : 0].key;

  const next = Math.min(anchors.length - 1, Math.max(0, current + delta));
  return anchors[next].key;
}

/** What a keypress asked the reading surface to do. */
export type ReadingShortcut =
  | "next-turn"
  | "previous-turn"
  | "toggle-playback"
  | "open-search";

/**
 * The reading keymap, as a decision rather than as a switch buried in an event handler.
 *
 * J/K/Space// are single unmodified characters, which is precisely why this needs a rule rather
 * than an `if`: those are also the characters somebody types into a correction field, into the
 * find box this very map opens, and onto a focused button — where Space is the button's own
 * activation and stealing it breaks the control. `isBusyTarget` is that question, answered by the
 * caller because only the caller can see the DOM.
 *
 * Any modifier means the browser or the OS asked for something else: Ctrl+J is the download list,
 * Cmd+Space is a system launcher, and a shortcut that swallows those is a shortcut a user cannot
 * escape. Shift is deliberately NOT in that set — Shift+J is still J with the shift key resting.
 */
export function readingShortcut(
  event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  isBusyTarget: boolean,
): ReadingShortcut | null {
  if (isBusyTarget) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  switch (event.key.toLowerCase()) {
    case "j":
      return "next-turn";
    case "k":
      return "previous-turn";
    case " ":
      return "toggle-playback";
    case "/":
      return "open-search";
    default:
      return null;
  }
}

/**
 * What a line's language chip is claiming, reduced to the two things that make one chip differ
 * from another: which language, and what kind of statement it is.
 */
export type LanguageMark = {
  language: string;
  state: "spoken" | "translated" | "untranslated" | "partial";
};

/**
 * Whether this line's language chip is worth printing.
 *
 * A document that repeats "VI" beside all four hundred lines of a Vietnamese meeting has spent its
 * right margin saying nothing. The chip earns its place when the answer CHANGES — that is the
 * moment a reader needs telling, and it is also the only moment the chip carries information.
 *
 * The two warning states are exempt and always print. `untranslated` and `partial` are not
 * statements about which language a line is in; they are statements that the line in front of the
 * reader is not all of what was said. Suppressing the second one in a run of them would quietly
 * hide the fact that the gap continues, and a transcript that hides a gap is worse than one that
 * repeats itself.
 */
export function shouldShowLanguageChip(
  current: LanguageMark,
  previous: LanguageMark | null,
): boolean {
  if (current.state === "untranslated" || current.state === "partial") return true;
  if (!previous) return true;
  return current.language !== previous.language || current.state !== previous.state;
}

/** One person's share of the talking, as the attendees rail draws it. */
export type SpeakingShare = {
  /** Participant id when the transcript recorded one, the display name otherwise. */
  key: string;
  name: string;
  speakingMs: number;
  /** 0–100, rounded. Shares can sum to slightly more or less than 100 because of that. */
  percent: number;
};

/**
 * Who held the floor, and for how long, from the transcript itself.
 *
 * There is no participants endpoint that answers this — attendance says who was in the room, which
 * is a different question from who spoke, and the meeting where one person talked for forty minutes
 * looks identical to the one where five people shared it in every roster the product has.
 *
 * A NEGATIVE duration is discarded rather than clamped and counted. startTimeMs is an offset into
 * the audio ingress track and resets when that track reconnects (see formatTranscriptClockTime), so
 * a line whose end precedes its start is a reconnect artefact, not a measurement. Counting it as
 * zero would be the same as discarding it; the reason it is written down is that clamping the
 * SUBTRACTION the other way round — abs() — would silently hand somebody the whole meeting.
 */
export function speakingShares(
  lines: readonly {
    speakerParticipantId?: string | null;
    speakerName?: string | null;
    startTimeMs: number;
    endTimeMs: number;
  }[],
): SpeakingShare[] {
  const byKey = new Map<string, SpeakingShare>();

  for (const line of lines) {
    const key = line.speakerParticipantId ?? line.speakerName ?? "";
    if (!key) continue;
    const durationMs = line.endTimeMs - line.startTimeMs;
    if (!Number.isFinite(durationMs) || durationMs < 0) continue;

    const existing = byKey.get(key);
    if (existing) {
      existing.speakingMs += durationMs;
      // A later line can carry a name the earlier one lacked — the ingress worker learns who is
      // on a track after the first chunks are already transcribed.
      if (existing.name === "Unknown speaker" && line.speakerName?.trim()) {
        existing.name = line.speakerName.trim();
      }
      continue;
    }
    byKey.set(key, {
      key,
      name: line.speakerName?.trim() || "Unknown speaker",
      speakingMs: durationMs,
      percent: 0,
    });
  }

  const shares = Array.from(byKey.values());
  const total = shares.reduce((sum, share) => sum + share.speakingMs, 0);
  for (const share of shares) {
    share.percent = total > 0 ? Math.round((share.speakingMs / total) * 100) : 0;
  }

  // Loudest first. The rail's job is to show the shape of the meeting at a glance, and alphabetical
  // order hides exactly the thing worth seeing.
  return shares.sort((left, right) => right.speakingMs - left.speakingMs);
}

/**
 * Diacritic folding that does NOT change the length of the string.
 *
 * lib/ui/search-text.ts folds for comparison, and normalizing to NFD there is correct: it only ever
 * asks "does this contain that". Here the answer has to be turned back into an offset into the
 * ORIGINAL text so the matched words can be marked in place, and NFD moves every offset after the
 * first accented letter. So this folds one code point at a time and keeps the original character
 * whenever folding it would not produce exactly one — which for the Latin and Vietnamese letters
 * this is for never happens, and for anything else means the search is merely case-insensitive
 * rather than wrong.
 */
export function foldPreservingLength(text: string): string {
  let out = "";
  for (const character of text) {
    const folded = character
      .replace(/Đ/g, "D")
      .replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    out += folded.length === character.length ? folded : character.toLowerCase();
  }
  return out;
}

/** A run of a line, and whether the reader's search term put it there. */
export type QuerySlice = { text: string; isMatch: boolean };

/**
 * Splits one line around every occurrence of the search term.
 *
 * Marking in place rather than filtering the document down to the hits: a transcript read as a
 * document is read for its flow, and a find that deletes the sentences around the answer has taken
 * away the thing the reader came to check. This is Ctrl+F over a page, not a filter over a list.
 *
 * Folded on both sides, so "manh" finds "Mạnh" — the same rule the rest of the product's search
 * follows (WT-231), and the reason it cannot simply be `indexOf`.
 */
export function splitOnQuery(text: string, query: string): QuerySlice[] {
  const term = query.trim();
  if (!term) return [{ text, isMatch: false }];

  const haystack = foldPreservingLength(text);
  const needle = foldPreservingLength(term);
  if (!needle) return [{ text, isMatch: false }];

  const slices: QuerySlice[] = [];
  let cursor = 0;
  for (;;) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) break;
    if (found > cursor) slices.push({ text: text.slice(cursor, found), isMatch: false });
    slices.push({ text: text.slice(found, found + needle.length), isMatch: true });
    cursor = found + needle.length;
  }
  if (cursor < text.length) slices.push({ text: text.slice(cursor), isMatch: false });

  return slices.length > 0 ? slices : [{ text, isMatch: false }];
}

/** How many times the term appears in a line. Counted through the same split, never a second rule. */
export function countMatches(text: string, query: string): number {
  return splitOnQuery(text, query).filter((slice) => slice.isMatch).length;
}
