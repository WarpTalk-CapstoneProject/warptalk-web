/**
 * WT-716 — the Clean view of a transcript, as data. No React in here.
 *
 * WHAT "CLEAN" IS
 *   The recogniser writes down everything that was said, including everything nobody meant: "ừm",
 *   "um", "えーと", a word said three times while somebody found the next one, a sentence cut into
 *   four STT chunks at four breaths. The backend now cleans that in two tiers:
 *
 *     tier 1, per SEGMENT   — `cleanText` on every segment: fillers and stutters removed,
 *                             punctuation repaired (including "?" / "？"). `""` means the whole
 *                             segment was filler.
 *     tier 2, per SENTENCE  — `clean-sentences`: whole sentences merged across the segments they
 *                             were spoken in, one per line, with a self-repair ("thứ hai, à không,
 *                             thứ ba") resolved to what the speaker ended up meaning.
 *
 *   Verbatim is the stored record exactly as it is today. Clean is the default reading; Verbatim is
 *   a per-reader switch away and changes nothing for anybody else in the room.
 *
 * THE ONE RULE EVERYTHING HERE FOLLOWS: CLEANING NEVER TOUCHES THE RECORD
 *   `originalText` is what corrections diff against, what the correction history stores, and what
 *   Verbatim shows. The Clean view is built BESIDE it: a sentence replaces the segments it covers
 *   on screen, and every one of those segment ids stays reachable — through `mergedSegmentIds` for
 *   translations, suggestions and citations, and through anchor ids in the DOM for anything that
 *   scrolls to a segment. Nothing downstream should be able to tell a line was cleaned except by
 *   reading it.
 *
 * WHY A SENTENCE CAN BE REFUSED (staleness)
 *   A correction clears the corrected segment's `cleanText` on the server, but the merged sentence
 *   that covered it is NOT invalidated — it still holds the wording from before the correction.
 *   Showing it would undo the host's fix on screen. So a sentence is only used while every segment
 *   it covers is present, uncorrected, and not changed since the sentence was written; otherwise
 *   those segments render one by one, as tier 1 (or raw) text. Falling back is always safe — the
 *   worst it costs is a line broken where a chunk ended rather than where the sentence did.
 *
 * Pure so the rules can be tested without a meeting. Relative `.ts` imports for the same reason
 * the rest of lib/transcript uses them: the node test runner does not resolve "@/".
 */

import { appendParagraph, joinTranscriptText, splitIntoSentences, startsNewParagraph } from "./sentence-flow.ts";

import type { TranscriptCleanSentenceDto } from "@/types/transcript";

// ── view mode ─────────────────────────────────────────────────────────────────────────────────

/** How the reader has chosen to read the transcript. Per reader, never per room. */
export type TranscriptViewMode = "clean" | "verbatim";

/** Clean unless the reader asked otherwise — the product decision for WT-716. */
export const DEFAULT_TRANSCRIPT_VIEW_MODE: TranscriptViewMode = "clean";

/**
 * Where the choice is kept. One key for every surface — the live side panel, the room record, the
 * caption lane and the Meet widget — so switching in one of them switches the transcript the
 * reader sees everywhere, including a widget window open beside the meeting (same origin, so it
 * hears the `storage` event).
 */
export const TRANSCRIPT_VIEW_MODE_STORAGE_KEY = "warptalk.transcript.view-mode";

/**
 * Anything that is not exactly "verbatim" reads as Clean: a missing key, a value from some older
 * build, a hand-edited one. Failing towards the default is the only answer that cannot strand a
 * reader in a mode they never picked.
 */
export function parseTranscriptViewMode(raw: string | null | undefined): TranscriptViewMode {
  return raw === "verbatim" ? "verbatim" : DEFAULT_TRANSCRIPT_VIEW_MODE;
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Blocked site data throws on ACCESS, not only on write.
    return null;
  }
}

/** The stored choice, or the default when there is no storage or nothing in it. Never throws. */
export function readTranscriptViewMode(storage: ReadableStorage | null = defaultStorage()): TranscriptViewMode {
  try {
    return parseTranscriptViewMode(storage?.getItem(TRANSCRIPT_VIEW_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_TRANSCRIPT_VIEW_MODE;
  }
}

/**
 * Remember the choice. Never throws: a private window or a full quota loses the memory, not the
 * switch — the caller keeps the mode in memory for the rest of the session either way.
 */
export function writeTranscriptViewMode(
  mode: TranscriptViewMode,
  storage: WritableStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(TRANSCRIPT_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Nothing useful to do; see above.
  }
}

// ── flags ─────────────────────────────────────────────────────────────────────────────────────

export const CLEAN_SEGMENT_FILLER_ONLY = "filler_only";
export const CLEAN_SENTENCE_SELF_REPAIR = "self_repair";

// ── clean sentences: the revision rule ───────────────────────────────────────────────────────

/** What this module needs of a sentence — the REST DTO and the realtime event both satisfy it. */
export type CleanSentence = Pick<TranscriptCleanSentenceDto, "id" | "segmentIds" | "cleanText" | "flags" | "revision"> & {
  updatedAt?: string | null;
  speakerId?: string | null;
  language?: string;
  source?: string;
};

/**
 * Put one sentence into a list, keeping the HIGHEST revision per id.
 *
 * Revisions of a sentence are broadcast as the model sees more of the conversation, and the REST
 * read and the realtime stream both carry them — so the same revision can arrive twice and an old
 * one can arrive after a new one (a slow refetch landing after the event). Lower loses outright.
 * Equal replaces, which makes redelivery idempotent, but keeps the `updatedAt` the REST copy had:
 * the event carries none, and that timestamp is the only thing that lets a correction mark the
 * sentence stale.
 *
 * Returns the SAME array when nothing changed, so a store can skip the update.
 */
export function upsertCleanSentence<T extends CleanSentence>(list: readonly T[], incoming: T): T[] {
  if (!incoming?.id) return list as T[];
  const index = list.findIndex((sentence) => sentence.id === incoming.id);
  if (index === -1) return [...list, incoming];

  const existing = list[index];
  if ((incoming.revision ?? 0) < (existing.revision ?? 0)) return list as T[];

  const next = [...list];
  next[index] = { ...incoming, updatedAt: incoming.updatedAt ?? existing.updatedAt ?? null };
  return next;
}

/** Several sources of sentences (the saved read, then live events) as one list. */
export function mergeCleanSentences<T extends CleanSentence>(...lists: ReadonlyArray<readonly T[] | null | undefined>): T[] {
  let merged: T[] = [];
  for (const list of lists) {
    for (const sentence of list ?? []) merged = upsertCleanSentence(merged, sentence);
  }
  return merged;
}

// ── segments ──────────────────────────────────────────────────────────────────────────────────

/** The fields of a segment (saved or live) the Clean view reads. Both DTOs carry these. */
export type CleanableSegmentFields = {
  originalText: string;
  cleanText?: string | null;
  cleanFlags?: readonly string[] | null;
  isCorrected?: boolean | null;
  updatedAt?: string | null;
  startTimeMs: number;
  endTimeMs: number;
};

/**
 * Whether cleaning found nothing but filler in this segment. Read off `cleanText === ""`, NOT off
 * the flag alone: a correction clears `cleanText` to null server-side and the flag describes the
 * wording that was just replaced, so trusting the flag would hide a line the host had just written.
 */
export function isFillerOnlySegment(segment: Pick<CleanableSegmentFields, "cleanText">): boolean {
  return typeof segment.cleanText === "string" && segment.cleanText.trim() === "";
}

/**
 * What one segment says in the Clean view: its clean text, or its original when it was never
 * cleaned (null/absent — old meetings, and a line a correction just rewrote). "" for filler-only.
 */
export function segmentCleanText(segment: Pick<CleanableSegmentFields, "originalText" | "cleanText">): string {
  if (typeof segment.cleanText === "string") return segment.cleanText.trim();
  return segment.originalText ?? "";
}

function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

/**
 * Whether a merged sentence no longer describes the segments it covers, so they must render on
 * their own. See the header: a correction does not invalidate a sentence server-side.
 *
 * Stale when ANY covered segment:
 *   - is missing from what is being rendered (not arrived yet, withheld by a pause, filtered out) —
 *     showing the sentence would put words on screen from a line the panel does not have;
 *   - has been corrected (`isCorrected`) — the sentence predates the host's wording by definition,
 *     since sentences are never rewritten from corrected text;
 *   - changed after the sentence was written (`updatedAt` later than the sentence's). Only
 *     compared when both sides carry a time; the realtime event carries none.
 */
export function isCleanSentenceStale(
  sentence: Pick<CleanSentence, "segmentIds" | "updatedAt">,
  segmentsById: ReadonlyMap<string, Pick<CleanableSegmentFields, "isCorrected" | "updatedAt">>,
): boolean {
  if (!sentence.segmentIds?.length) return true;
  const writtenAt = parseInstant(sentence.updatedAt);

  for (const segmentId of sentence.segmentIds) {
    const segment = segmentsById.get(segmentId);
    if (!segment) return true;
    if (segment.isCorrected) return true;
    const changedAt = parseInstant(segment.updatedAt);
    if (writtenAt !== null && changedAt !== null && changedAt > writtenAt) return true;
  }
  return false;
}

// ── the view ──────────────────────────────────────────────────────────────────────────────────

/** A merged sentence as one rendered line carries it. */
export type CleanSentenceLine = {
  sentenceId: string;
  text: string;
  flags: readonly string[];
  /** "thứ hai, à không, thứ ba" → "thứ ba": shown with a marker whose hover gives `rawText`. */
  selfRepair: boolean;
  /** The covered segments' ORIGINAL words, joined the way a verbatim bubble joins them. */
  rawText: string;
  /** Every segment this line stands for, in the order they were said. The first is the anchor. */
  segmentIds: readonly string[];
};

export type CleanTranscriptView<T> = {
  /** What to group and draw, in order. `originalText` on each is the CLEAN text. */
  segments: T[];
  /** Head segment id → the sentence it now stands for. Heads are the sentence's first segment. */
  sentenceByHead: ReadonlyMap<string, CleanSentenceLine>;
  /** Head segment id → the other segments its sentence swallowed, in spoken order. */
  absorbedByHead: ReadonlyMap<string, readonly string[]>;
  /**
   * Rendered segment id → hidden segment ids parked on it (filler-only lines, and the segments of
   * a sentence that cleaned down to nothing). Only for ANCHORING: a citation or a scroll aimed at a
   * hidden "ừm" lands on the line next to it instead of on nothing. Never used for translations —
   * a translation of "Um." under a clean line is exactly the noise this view removes.
   */
  hiddenByAnchor: ReadonlyMap<string, readonly string[]>;
  /** Every rendered segment's clean text and timing, for laying a bubble out line by line. */
  renderedById: ReadonlyMap<string, { text: string; startTimeMs: number; endTimeMs: number }>;
};

export type BuildCleanViewOptions<T> = {
  idOf: (segment: T) => string;
  /**
   * Fold an absorbed segment into its sentence's head. The live shape uses this to keep the
   * absorbed segment's translations, which it carries inline — dropping the segment would drop
   * them. Called after the head's text and times are already set.
   */
  absorb?: (head: T, absorbed: T) => T;
};

/**
 * The Clean view of an ordered list of segments.
 *
 *   1. Sentences are resolved: highest revision per id (callers already merge; repeated here so a
 *      raw list is safe), dropped when stale, and dropped when they claim a segment an earlier
 *      sentence in the list already claimed — the server should never produce that, and if it
 *      does, first-in-conversation-order is at least stable.
 *   2. Each sentence is drawn ONCE, at the position of its first segment in `segments`, carrying
 *      the sentence's text and the covered span's full time range. Its other segments are not
 *      drawn and are recorded as absorbed.
 *   3. Every other segment is drawn with `cleanText ?? originalText`, except a filler-only one,
 *      which is hidden (and parked on a neighbour for anchoring).
 *
 * The input order is kept; nothing is re-sorted.
 */
export function buildCleanTranscriptView<T extends CleanableSegmentFields>(
  segments: readonly T[],
  sentences: readonly CleanSentence[],
  { idOf, absorb }: BuildCleanViewOptions<T>,
): CleanTranscriptView<T> {
  const byId = new Map<string, T>();
  for (const segment of segments) byId.set(idOf(segment), segment);
  const order = new Map<string, number>();
  segments.forEach((segment, index) => {
    if (!order.has(idOf(segment))) order.set(idOf(segment), index);
  });

  // 1. Which sentence owns which segment.
  const owner = new Map<string, CleanSentence>();
  for (const sentence of mergeCleanSentences(sentences)) {
    if (isCleanSentenceStale(sentence, byId)) continue;
    if (sentence.segmentIds.some((segmentId) => owner.has(segmentId))) continue;
    for (const segmentId of sentence.segmentIds) owner.set(segmentId, sentence);
  }

  const sentenceByHead = new Map<string, CleanSentenceLine>();
  const absorbedByHead = new Map<string, string[]>();
  const hiddenByAnchor = new Map<string, string[]>();
  const renderedById = new Map<string, { text: string; startTimeMs: number; endTimeMs: number }>();
  const output: T[] = [];
  const emittedSentences = new Set<string>();
  /** Hidden ids seen before anything was drawn — parked on the first line that is. */
  let orphanedHidden: string[] = [];

  function hide(segmentId: string) {
    const anchor = output.length ? idOf(output[output.length - 1]) : null;
    if (!anchor) {
      orphanedHidden.push(segmentId);
      return;
    }
    hiddenByAnchor.set(anchor, [...(hiddenByAnchor.get(anchor) ?? []), segmentId]);
  }

  function emit(segment: T, text: string) {
    const id = idOf(segment);
    output.push(segment);
    renderedById.set(id, { text, startTimeMs: segment.startTimeMs, endTimeMs: segment.endTimeMs });
    if (orphanedHidden.length) {
      hiddenByAnchor.set(id, [...orphanedHidden, ...(hiddenByAnchor.get(id) ?? [])]);
      orphanedHidden = [];
    }
  }

  // 2 + 3.
  for (const segment of segments) {
    const id = idOf(segment);
    const sentence = owner.get(id);

    if (!sentence) {
      if (isFillerOnlySegment(segment)) {
        hide(id);
        continue;
      }
      const text = segmentCleanText(segment);
      emit({ ...segment, originalText: text }, text);
      continue;
    }

    if (emittedSentences.has(sentence.id)) continue;
    emittedSentences.add(sentence.id);

    // Spoken order, which is the input order — not necessarily the order the ids were listed in.
    const covered = [...sentence.segmentIds].sort(
      (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
    );
    const members = covered.map((segmentId) => byId.get(segmentId)!);
    const text = (sentence.cleanText ?? "").trim();

    if (!text) {
      // A sentence that cleaned down to nothing is filler spread over several chunks.
      for (const segmentId of covered) hide(segmentId);
      continue;
    }

    let head: T = {
      ...members[0],
      originalText: text,
      startTimeMs: Math.min(...members.map((member) => member.startTimeMs)),
      endTimeMs: Math.max(...members.map((member) => member.endTimeMs)),
    };
    if (absorb) {
      for (const member of members.slice(1)) head = absorb(head, member);
    }

    const headId = covered[0];
    sentenceByHead.set(headId, {
      sentenceId: sentence.id,
      text,
      flags: sentence.flags ?? [],
      selfRepair: (sentence.flags ?? []).includes(CLEAN_SENTENCE_SELF_REPAIR),
      rawText: members.reduce<string>((joined, member) => joinTranscriptText(joined, member.originalText), ""),
      segmentIds: covered,
    });
    if (covered.length > 1) absorbedByHead.set(headId, covered.slice(1));
    emit(head, text);
  }

  return { segments: output, sentenceByHead, absorbedByHead, hiddenByAnchor, renderedById };
}

/**
 * Put the segments a sentence absorbed back into each grouped row's `mergedSegmentIds`, right
 * after their head. After this, a row names every segment it stands for — which is what
 * translations (joined per language across the row's ids), AI suggestions and citation lookups
 * all read. Rows with nothing absorbed come back as they were.
 */
export function withAbsorbedSegmentIds<R extends { mergedSegmentIds: string[] }>(
  rows: readonly R[],
  view: Pick<CleanTranscriptView<unknown>, "absorbedByHead">,
): R[] {
  if (view.absorbedByHead.size === 0) return [...rows];
  return rows.map((row) => {
    if (!row.mergedSegmentIds.some((id) => view.absorbedByHead.has(id))) return row;
    return {
      ...row,
      mergedSegmentIds: row.mergedSegmentIds.flatMap((id) => [id, ...(view.absorbedByHead.get(id) ?? [])]),
    };
  });
}

/**
 * Every segment id a rendered row should answer to in the DOM: what it stands for, plus the hidden
 * lines parked on it. The row's own id comes first; it is the one its element is named after.
 */
export function anchorSegmentIds(
  row: { mergedSegmentIds?: readonly string[] | null },
  rowId: string,
  view: Pick<CleanTranscriptView<unknown>, "hiddenByAnchor"> | null,
): string[] {
  const ids = row.mergedSegmentIds?.length ? [...row.mergedSegmentIds] : [rowId];
  if (!view) return ids;
  return ids.flatMap((id) => [id, ...(view.hiddenByAnchor.get(id) ?? [])]);
}

// ── lines inside a bubble ─────────────────────────────────────────────────────────────────────

/** One line of a rendered bubble. `sentence` is set when the line is a tier-2 merged sentence. */
export type TranscriptBubbleLine = {
  key: string;
  text: string;
  sentence: CleanSentenceLine | null;
};

/**
 * The lines a VERBATIM bubble renders: split first where the speaker stopped (`paragraphs`,
 * measured by VAD), then on the punctuation the recogniser produced. This is the rule the live
 * panel and the Meet widget each used to carry a private copy of.
 */
export function verbatimBubbleLines(bubble: { paragraphs?: readonly string[] | null; originalText: string }): string[] {
  const paragraphs = bubble.paragraphs?.length ? bubble.paragraphs : [bubble.originalText];
  return paragraphs.flatMap((paragraph) => splitIntoSentences(paragraph));
}

/**
 * The lines a CLEAN bubble renders: every merged sentence on a line of its own — that is what
 * tier 2 is for, and splitting it again on punctuation would undo it — and every stretch of
 * segments no sentence covers laid out the verbatim way, from their tier-1 text.
 *
 * Walks the row's ids in order. Absorbed ids are not in `renderedById` and are skipped; the head
 * of their sentence already produced the line.
 */
export function cleanBubbleLines(
  bubble: { mergedSegmentIds: readonly string[] },
  view: Pick<CleanTranscriptView<unknown>, "sentenceByHead" | "renderedById">,
): TranscriptBubbleLine[] {
  const lines: TranscriptBubbleLine[] = [];
  let loose: string[] = [];
  let looseKey: string | null = null;
  let previousEndMs: number | null = null;

  function flush() {
    if (!looseKey) return;
    loose
      .flatMap((paragraph) => splitIntoSentences(paragraph))
      .forEach((text, index) => lines.push({ key: `${looseKey}-c${index}`, text, sentence: null }));
    loose = [];
    looseKey = null;
  }

  for (const id of bubble.mergedSegmentIds) {
    const sentence = view.sentenceByHead.get(id);
    const rendered = view.renderedById.get(id);
    if (sentence) {
      flush();
      lines.push({ key: `${id}-s`, text: sentence.text, sentence });
      previousEndMs = rendered?.endTimeMs ?? previousEndMs;
      continue;
    }
    if (!rendered || !rendered.text.trim()) continue;
    looseKey ??= id;
    loose = appendParagraph(
      loose,
      rendered.text,
      previousEndMs !== null && startsNewParagraph(previousEndMs, rendered.startTimeMs),
    );
    previousEndMs = rendered.endTimeMs;
  }
  flush();
  return lines;
}

/**
 * The lines of one bubble in either mode. A null view is Verbatim; keys are stable per mode.
 */
export function transcriptBubbleLines(
  bubble: { mergedSegmentIds: readonly string[]; paragraphs?: readonly string[] | null; originalText: string },
  view: Pick<CleanTranscriptView<unknown>, "sentenceByHead" | "renderedById"> | null,
  keyPrefix: string,
): TranscriptBubbleLine[] {
  if (view) return cleanBubbleLines(bubble, view);
  return verbatimBubbleLines(bubble).map((text, index) => ({ key: `${keyPrefix}-v${index}`, text, sentence: null }));
}

/**
 * The raw words behind a clean row — what the correction editor must open on. Corrections are made
 * to the RECORD (`originalText`), so an editor seeded with the clean text would post the clean text
 * as a correction and write the cleaning into the stored transcript.
 *
 * `rows` is the raw segment list; ids missing from it are skipped. Joined exactly as the verbatim
 * grouping joins, which is also what planLineCorrection splits back against.
 */
export function rawTextForSegmentIds(
  segmentIds: readonly string[],
  rows: ReadonlyMap<string, { originalText: string }>,
): string {
  return segmentIds.reduce<string>((joined, id) => {
    const row = rows.get(id);
    return row ? joinTranscriptText(joined, row.originalText) : joined;
  }, "");
}
