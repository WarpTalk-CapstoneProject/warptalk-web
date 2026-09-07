// Relative, with the extension, because this module's own unit tests run under the plain node
// test runner (`--experimental-strip-types`), which does not resolve the "@/" alias. The other
// imports here get away with it only because they are `import type` and erase before runtime —
// this one is a real value.
import { normalizeLanguageCode } from "../language/languages.ts";
import type { TranscriptSegmentDto } from "@/types/realtime";
import type { TranscriptSegmentDto as SavedTranscriptSegmentDto, TranscriptPauseWindowDto } from "@/types/transcript";
import type { TranslationRoomSessionDto } from "@/types/translationRoom";

type SpeakerParticipant = {
  userId: string;
  displayName: string;
};

export type AnimatedWordToken = {
  key: string;
  word: string;
  index: number;
};

const MAX_UTTERANCE_GAP_MS = 2_500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The translation of a line INTO A PARTICULAR READER'S LANGUAGE, or null when there is none.
 *
 * WT-371 Bug 4. The panel used to print `segment.translatedText` and `segment.targetLanguage` —
 * whichever translation had most recently been merged into the bubble — which meant the direction
 * shown depended on arrival order and on when the reader's own listen language finished resolving.
 * Two lines side by side could read "English → Vietnamese" and "Vietnamese → English".
 *
 * Asking with the reader's language instead makes the answer a property of who is looking. Every
 * bubble in the panel resolves against the same language, so the transcript reads consistently
 * from that seat and re-reads consistently the moment the seat's language changes.
 *
 * Returns null — not the original text — when the speaker was already speaking the reader's
 * language. There is nothing to translate, and echoing the same sentence twice under itself is
 * how "→ Vietnamese" ended up under a Vietnamese line.
 */
export function resolveSegmentTranslation(
  segment: Pick<TranscriptSegmentDto, "translations" | "translatedText" | "targetLanguage" | "originalLanguage">,
  readerLanguage: string | null | undefined,
): string | null {
  const language = normalizeLanguageCode(readerLanguage ?? "");
  if (!language) return null;
  if (normalizeLanguageCode(segment.originalLanguage) === language) return null;

  const translations = segment.translations;
  if (translations && Object.keys(translations).length > 0) {
    // The map is authoritative once it exists. Falling through to the legacy field when the
    // reader's language is simply not among the translations would hand them SOMEBODY ELSE's
    // language — the precise defect this function exists to remove — because that field holds
    // whichever translation happened to be merged last.
    return translations[language]?.trim() || null;
  }

  // Only for segments captured before `translations` existed, and only when the language
  // actually matches. The old code read this field without asking who it was translated for.
  if (
    segment.translatedText?.trim()
    && normalizeLanguageCode(segment.targetLanguage ?? "") === language
  ) {
    return segment.translatedText.trim();
  }

  return null;
}

/**
 * The one line the CAPTION LANE should show this reader for this utterance, or null to hold it.
 *
 * The lane used to render `originalText` unconditionally, so a reader listening in English
 * watched Vietnamese captions scroll past while their English sat one tab away. The product
 * decision (2026-08-20, owner) is that the caption lane is a TRANSLATION surface: the original
 * has the transcript panel, which shows it beside the translation with timestamps.
 *
 * WHY THIS IS NOT JUST resolveSegmentTranslation
 *   That function returns null for two OPPOSITE situations, and the lane must render them
 *   differently:
 *
 *     nothing to translate — the speaker was already speaking the reader's language, so the
 *                            original IS the reader's language and must be shown as-is. Filter
 *                            it out and a room where everyone shares a language has no captions
 *                            at all, and nobody ever sees their own words.
 *     not translated YET   — the transcript segment arrives before its translation. Showing the
 *                            original here is what the decision above rejects: the line would
 *                            appear in the wrong language and then change under the reader.
 *
 *   Null therefore means only the second: hold this line until its translation lands.
 *
 * WHY `translationActive` IS A PARAMETER AND NOT AN ASSUMPTION
 *   Holding a line only makes sense while a translation is actually coming. Transcription runs
 *   for any live meeting — livekit_ingress_worker joins on the first published mic and
 *   translation_worker is the stage gated behind Start Translation — so before anybody presses
 *   it there ARE captions and there is no translation, ever, for those lines. Holding them left
 *   the lane permanently empty for the whole pre-Start half of every meeting, which is the exact
 *   failure WT-387 spent a release fixing one layer down. Off means show the original: it is not
 *   the wrong language when no other language is on the way.
 *
 * A reader with no resolved language yet gets the original rather than an empty lane — that
 * state lasts for the first moments of a cold join, and a blank caption surface reads as broken.
 */
export function captionTextForReader(
  segment: Pick<
    TranscriptSegmentDto,
    "translations" | "translatedText" | "targetLanguage" | "originalLanguage" | "originalText"
  >,
  readerLanguage: string | null | undefined,
  translationActive = true,
): string | null {
  const language = normalizeLanguageCode(readerLanguage ?? "");
  if (!language) return segment.originalText?.trim() || null;

  if (normalizeLanguageCode(segment.originalLanguage) === language) {
    return segment.originalText?.trim() || null;
  }

  const translated = resolveSegmentTranslation(segment, readerLanguage);
  if (translated) return translated;

  return translationActive ? null : segment.originalText?.trim() || null;
}

/** Union of two bubbles' per-language translations, appending where both hold the same language. */
function mergeTranslations(
  previous: Record<string, string> | undefined,
  next: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!previous) return next;
  if (!next) return previous;

  const merged = { ...previous };
  for (const [language, text] of Object.entries(next)) {
    merged[language] = appendText(merged[language], text);
  }
  return merged;
}

export function dedupeTranscriptSegments(
  segments: TranscriptSegmentDto[],
): TranscriptSegmentDto[] {
  const byId = new Map<string, TranscriptSegmentDto>();
  for (const segment of segments) {
    byId.set(segment.segmentId, segment);
  }
  // Map preserves the first insertion position when an existing value is replaced.
  // Arrival order stays valid when a reconnected ingress track resets startTimeMs.
  return Array.from(byId.values());
}

/**
 * A rendered utterance bubble. `segmentId` is the FIRST segment folded into it, so it is
 * not a complete identity: anything keyed by the segment ids the backend emitted (AI
 * suggestions, for one) has to look at `mergedSegmentIds` instead, which lists every
 * segment this bubble absorbed — including that first one.
 */
export type GroupedTranscriptSegment = TranscriptSegmentDto & {
  mergedSegmentIds: string[];
};

export function groupTranscriptSegments(
  segments: TranscriptSegmentDto[],
): GroupedTranscriptSegment[] {
  const utterances: GroupedTranscriptSegment[] = [];

  for (const segment of segments) {
    // Control markers are dropped here, not only in the saved-transcript path. The filter used
    // to live solely in groupSavedTranscriptSegments, so `__MEETING_END__` was invisible on the
    // room detail page and perfectly visible in the LIVE panel during the meeting — attributed
    // to "System", timestamped 0:00, with a 100% confidence badge beside it.
    //
    // Dropping before the merge matters as much as dropping at all: a marker absorbed into a
    // neighbouring utterance stops being a segment of its own and becomes part of a real line's
    // text, where no later filter can find it.
    if (isTranscriptControlMarker(segment.originalText)) continue;

    const previous = utterances[utterances.length - 1];
    if (!previous || !belongsToSameUtterance(previous, segment)) {
      utterances.push({ ...segment, mergedSegmentIds: [segment.segmentId] });
      continue;
    }

    utterances[utterances.length - 1] = {
      ...previous,
      originalText: appendText(previous.originalText, segment.originalText),
      translatedText: appendText(previous.translatedText, segment.translatedText) || undefined,
      // Merged per language. Concatenating into one slot the way translatedText does would
      // splice a Vietnamese sentence onto an English one whenever the two bubbles carried
      // different languages, which is exactly the confusion WT-371 Bug 4 was about.
      translations: mergeTranslations(previous.translations, segment.translations),
      confidence: Math.min(previous.confidence, segment.confidence),
      endTimeMs: Math.max(previous.endTimeMs, segment.endTimeMs),
      // Merging drops the absorbed segment's id from `segmentId` forever. Without this
      // list, a suggestion anchored to the 2nd or 3rd segment of an utterance matches no
      // bubble at all and silently never renders.
      mergedSegmentIds: [...previous.mergedSegmentIds, segment.segmentId],
    };
  }

  return utterances;
}

/** The suggestion (if any) anchored to any segment this bubble absorbed. */
export function findSuggestionForUtterance<T>(
  utterance: GroupedTranscriptSegment,
  suggestions: Record<string, T>,
): T | undefined {
  for (const segmentId of utterance.mergedSegmentIds) {
    const match = suggestions[segmentId];
    if (match) return match;
  }
  return undefined;
}

/**
 * Whether a segment is a control marker rather than something somebody said.
 *
 * The meeting service publishes `__MEETING_END__` onto the STT stream so the AI assistant
 * worker knows to generate the summary (MeetingRoomService.EndMeeting →
 * AIAssistantWorker.process). It is a signal between two services, and it was landing in the
 * transcript as a line of dialogue — attributed to "System", timestamped 00:00, and offered to
 * the host with a pencil icon to correct it.
 *
 * Matched on the shape rather than that one literal: any `__ALL_CAPS__` token is a sentinel by
 * construction, and nobody speaks one. A later marker will be filtered without needing to be
 * discovered on screen first.
 *
 * Anchored only at the START, because production holds a `__MEETING_END__a` — the sentinel with
 * one stray character welded onto it, from 156 clean ones. A `$` anchor let that single row
 * through as a line of dialogue attributed to "System", and it would now also offer "system" as
 * a language this meeting can be read in. A line that BEGINS with a sentinel is a sentinel
 * however it ends; the "the __MEETING_END__ marker" case stays speech because the token is not
 * where the line starts.
 */
export function isTranscriptControlMarker(text: string | null | undefined): boolean {
  return /^__[A-Z0-9_]+__/.test((text ?? "").trim());
}

/**
 * A saved utterance. `id` is the FIRST segment folded into it — the same partial identity
 * `GroupedTranscriptSegment` carries on the live side, and for the same reason: anything keyed
 * by the segment ids the backend emitted has to read `mergedSegmentIds` instead.
 *
 * The translations are what made this necessary here. They are stored per segment, so a bubble
 * that absorbed three chunks of one continuous sentence has three translations to reassemble,
 * and reading them off `id` alone would have shown the first third of every long utterance.
 */
export type GroupedSavedTranscriptSegment = SavedTranscriptSegmentDto & {
  mergedSegmentIds: string[];
};

/**
 * Groups a saved/paginated transcript (from the REST API, not the live SignalR
 * stream) so consecutive segments from the same speaker render as one continuous
 * block instead of a new line per finalized STT chunk.
 *
 * Control markers are dropped first, so they can never be merged into a neighbouring
 * utterance and become part of a real line's text.
 */
export function groupSavedTranscriptSegments(
  segments: SavedTranscriptSegmentDto[],
): GroupedSavedTranscriptSegment[] {
  const utterances: GroupedSavedTranscriptSegment[] = [];

  for (const segment of segments) {
    if (isTranscriptControlMarker(segment.originalText)) continue;

    const previous = utterances[utterances.length - 1];
    if (!previous || !belongsToSameSavedUtterance(previous, segment)) {
      utterances.push({ ...segment, mergedSegmentIds: [segment.id] });
      continue;
    }

    utterances[utterances.length - 1] = {
      ...previous,
      originalText: appendText(previous.originalText, segment.originalText),
      endTimeMs: Math.max(previous.endTimeMs, segment.endTimeMs),
      mergedSegmentIds: [...previous.mergedSegmentIds, segment.id],
    };
  }

  return utterances;
}

/**
 * A stretch of the meeting one person held, as the timeline draws it: one dot on the rail, the
 * speaker's name once, and everything they said under it.
 */
export type TranscriptSpeakerTurn<T> = {
  /** Stable across a render — the first line's id, which is unique within a transcript. */
  key: string;
  speakerName: string;
  /** Who spoke, when the transcript knows. Null when only a display name was ever recorded. */
  speakerId: string | null;
  startTimeMs: number;
  lines: T[];
};

/**
 * A turn ends when somebody else speaks — or when the same person stops for this long.
 *
 * Without the second rule a monologue is one dot: a 40-minute presentation would draw a single
 * marker on a rail whose entire job is to show the shape of the meeting. 30 seconds is well past
 * a breath (finalized STT chunks arrive every ~6s while somebody is talking) and short enough
 * that a real pause becomes a place the eye can land.
 */
const MAX_TURN_SILENCE_MS = 30_000;

/**
 * Groups a transcript into speaker turns for the timeline layout.
 *
 * Speaker identity follows the same rule the utterance merge uses — the participant id when
 * there is one, the display name otherwise — so the two groupings cannot disagree about who was
 * talking. Input must already be in chronological order.
 */
export function groupIntoSpeakerTurns<
  T extends {
    id: string;
    speakerName?: string | null;
    speakerParticipantId?: string | null;
    startTimeMs: number;
    endTimeMs: number;
  },
>(segments: readonly T[]): TranscriptSpeakerTurn<T>[] {
  const turns: TranscriptSpeakerTurn<T>[] = [];

  for (const segment of segments) {
    const identity = segment.speakerParticipantId ?? segment.speakerName ?? "";
    const previous = turns[turns.length - 1];
    const previousLine = previous?.lines[previous.lines.length - 1];
    const previousIdentity = previousLine
      ? (previousLine.speakerParticipantId ?? previousLine.speakerName ?? "")
      : null;
    // A NEGATIVE gap is not silence: startTimeMs is an offset into the audio ingress track and
    // resets when that track reconnects (see formatTranscriptClockTime). Splitting on it would
    // put a turn boundary wherever the meeting dropped and rejoined.
    const gapMs = previousLine ? segment.startTimeMs - previousLine.endTimeMs : 0;
    const sameTurn =
      previous !== undefined
      && previousIdentity === identity
      && gapMs <= MAX_TURN_SILENCE_MS;

    if (sameTurn) {
      previous.lines.push(segment);
      continue;
    }

    turns.push({
      key: segment.id,
      speakerName: segment.speakerName?.trim() || "Unknown speaker",
      speakerId: segment.speakerParticipantId ?? null,
      startTimeMs: segment.startTimeMs,
      lines: [segment],
    });
  }

  return turns;
}

export type TranslationSessionBlock<T> = {
  /** 1-based, oldest session first — this is the "N" in "Translation N". */
  sessionNumber: number;
  /** null when there's no session data to attribute this block to (old data, or the
   * segments fall before the first known session). */
  session: TranslationRoomSessionDto | null;
  segments: T[];
};

/**
 * Splits a transcript into one block per Start/Resume→Pause/End translation session, so
 * the UI can label each with "Translation N" — see TranslationRoomService's
 * Start/Pause/Resume/EndTranslationRoomAsync, which open/close a TranslationRoomSession
 * per toggle. `segments` must already be in chronological order.
 *
 * With fewer than 2 known sessions (the overwhelmingly common case — translation was
 * started once and never paused) this is a no-op: everything comes back as a single
 * unlabeled block so the caller can skip rendering session dividers entirely.
 */
export function groupSegmentsByTranslationSession<T extends { startTimeMs: number }>(
  segments: T[],
  sessions: readonly TranslationRoomSessionDto[],
  baseTime?: string,
): TranslationSessionBlock<T>[] {
  if (!segments.length) return [];

  const timedSessions = sessions.filter((session) => session.startedAt);
  const baseMs = baseTime ? new Date(baseTime).getTime() : NaN;

  if (timedSessions.length < 2 || Number.isNaN(baseMs)) {
    return [{ sessionNumber: 1, session: timedSessions[0] ?? null, segments }];
  }

  const ordered = [...timedSessions].sort(
    (left, right) => new Date(left.startedAt!).getTime() - new Date(right.startedAt!).getTime(),
  );

  function resolveSessionIndex(segment: T): number {
    const absoluteMs = baseMs + segment.startTimeMs;
    let fallback = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const startedMs = new Date(ordered[index].startedAt!).getTime();
      const endedMs = ordered[index].endedAt ? new Date(ordered[index].endedAt!).getTime() : Infinity;
      if (absoluteMs >= startedMs) fallback = index;
      if (absoluteMs >= startedMs && absoluteMs < endedMs) return index;
    }
    // Falls in a gap between sessions (or after the last EndedAt, e.g. clock skew) —
    // attribute to the most recent session that had already started rather than
    // silently dropping it from every block.
    return fallback;
  }

  const blocks: TranslationSessionBlock<T>[] = [];
  for (const segment of segments) {
    const index = resolveSessionIndex(segment);
    const last = blocks[blocks.length - 1];
    if (last && last.sessionNumber === index + 1) {
      last.segments.push(segment);
    } else {
      blocks.push({ sessionNumber: index + 1, session: ordered[index], segments: [segment] });
    }
  }
  return blocks;
}

/**
 * WT-605. Where one [Pause Transcript, Resume Transcript] window falls in MEETING-RELATIVE time
 * (the same units as `segment.startTimeMs`), so the panel can draw a "Transcript paused ·
 * HH:MM–HH:MM" divider between the segments on either side of it — the transcript-pause
 * counterpart to `groupSegmentsByTranslationSession`'s "Translation N" dividers.
 */
export type TranscriptPauseGap = {
  window: TranscriptPauseWindowDto;
  startMs: number;
  /** null while the transcript is CURRENTLY paused for this room. */
  endMs: number | null;
};

/**
 * Converts each window's wall-clock StartedAt/EndedAt into meeting-relative ms. Returns []
 * without a `baseTime` to anchor against — old data, or a room with no timeline anchor yet —
 * same "nothing to compute a position with" fallback `groupSegmentsByTranslationSession` takes.
 */
export function resolveTranscriptPauseGaps(
  windows: readonly TranscriptPauseWindowDto[],
  baseTime?: string,
): TranscriptPauseGap[] {
  const baseMs = baseTime ? new Date(baseTime).getTime() : NaN;
  if (Number.isNaN(baseMs) || !windows.length) return [];

  return windows
    .filter((window) => window.startedAt)
    .map((window) => ({
      window,
      startMs: new Date(window.startedAt).getTime() - baseMs,
      endMs: window.endedAt ? new Date(window.endedAt).getTime() - baseMs : null,
    }))
    .sort((left, right) => left.startMs - right.startMs);
}

/**
 * Splits an already-chronological list of segments into blocks around each pause gap. No
 * segment is ever expected to fall INSIDE a gap — that is the entire point of Pause Transcript,
 * the segments spoken during it were never persisted — so each gap lands cleanly on the boundary
 * between the segment before it and the segment after.
 *
 * Independent of, and applied on top of, `groupSegmentsByTranslationSession`: a room can pause
 * translation and pause transcript at different, unrelated moments, so callers run this within
 * each translation-session block rather than instead of that grouping.
 */
export function splitSegmentsAroundPauseGaps<T extends { startTimeMs: number }>(
  segments: readonly T[],
  gaps: readonly TranscriptPauseGap[],
): Array<{ gapBefore: TranscriptPauseGap | null; segments: T[] }> {
  if (!gaps.length) return [{ gapBefore: null, segments: [...segments] }];

  const blocks: Array<{ gapBefore: TranscriptPauseGap | null; segments: T[] }> = [
    { gapBefore: null, segments: [] },
  ];
  let gapIndex = 0;

  for (const segment of segments) {
    while (gapIndex < gaps.length && segment.startTimeMs >= gaps[gapIndex].startMs) {
      blocks.push({ gapBefore: gaps[gapIndex], segments: [] });
      gapIndex += 1;
    }
    blocks[blocks.length - 1].segments.push(segment);
  }

  // A gap with no segment after it — the room is still paused, or nobody has spoken since
  // resuming — would otherwise vanish here instead of rendering its divider. Trailing blocks
  // stay empty; the divider itself is drawn from `gapBefore`, not from having lines to hold.
  while (gapIndex < gaps.length) {
    blocks.push({ gapBefore: gaps[gapIndex], segments: [] });
    gapIndex += 1;
  }

  return blocks;
}

export function resolveTranscriptSpeakerName(
  segment: TranscriptSegmentDto,
  participants: readonly SpeakerParticipant[],
): string {
  // The same UUID guard the supplied-name branch below already applies. This branch trusted
  // the participant's displayName absolutely, and after a sign-out and sign-in the roster can
  // come back holding the user's id as their display name — which is how a transcript ended
  // up attributing lines to "019f0d00-0de0-7000-9000-000000000003".
  //
  // A name that IS the id is not a name. Better to say "Speaker" than to print a UUID at
  // someone and call it their name.
  const participantName = participants
    .find((participant) => participant.userId === segment.speakerId)
    ?.displayName.trim();
  if (
    participantName
    && participantName !== segment.speakerId
    && !UUID_PATTERN.test(participantName)
  ) {
    return participantName;
  }

  const suppliedName = segment.speakerName?.trim();
  if (suppliedName && suppliedName !== segment.speakerId && !UUID_PATTERN.test(suppliedName)) {
    return suppliedName;
  }

  return "Speaker";
}

export function getLiveCaptionText(text: string, maxCharacters = 96): string {
  const normalized = text.trim();
  if (normalized.length <= maxCharacters) return normalized;

  const tail = normalized.slice(-maxCharacters);
  const firstWordBoundary = tail.indexOf(" ");
  return firstWordBoundary === -1 ? tail : tail.slice(firstWordBoundary + 1);
}

export function getAnimatedWordTokens(text: string, maxCharacters?: number): AnimatedWordToken[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean).map((word, index) => ({
    key: `${index}:${word}`,
    word,
    index,
  }));

  if (!maxCharacters || tokens.length === 0) return tokens;

  let visibleLength = 0;
  let startIndex = tokens.length;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const nextLength = tokens[index].word.length + (visibleLength > 0 ? 1 : 0);
    if (visibleLength > 0 && visibleLength + nextLength > maxCharacters) break;
    visibleLength += nextLength;
    startIndex = index;
  }

  return tokens.slice(startIndex);
}

/**
 * The recogniser's confidence in a line, as a percentage — or null when it did not say.
 *
 * WT-371 Bug 3: the panel printed `Math.round(confidence * 100)%` on a value that is NOT a
 * probability. `stt_worker/model.py` publishes `confidence=round(avg_logprob, 4)`, an average
 * token LOG-probability, which is at most 0 and usually negative. Multiplied by 100 it rendered
 * as "-23%" — a number with no meaning, in a unit it does not have.
 *
 * exp() is the actual inverse: a mean log-probability of -0.23 is a mean per-token probability
 * of 0.79, i.e. 79%. That is a real score and the one the model actually reported.
 *
 * Values already in (0, 1] are passed through, so a producer that starts publishing a plain
 * probability does not have to be exponentiated twice to be read correctly.
 */
export function confidencePercent(raw: number | null | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  // The backend's ModelConfidence already collapses its -1.0 "no logprobs" sentinel to null,
  // so anything arriving here is a measurement — but a 0 tells us nothing either way and a
  // "100%" built from it would be the confident lie WT-277 was about.
  if (raw === 0) return null;

  const probability = raw < 0 ? Math.exp(raw) : raw;
  if (probability <= 0 || probability > 1) return null;

  return Math.round(probability * 100);
}

/**
 * The wall-clock time a line was spoken, as HH:MM.
 *
 * The live panel used to print `startTimeMs` through formatTranscriptTimestamp and label it
 * "Meeting time". It is neither: it is an offset into the audio ingress track, which resets when
 * that track reconnects, so a line spoken at minute 18 of a meeting rendered as 6:00. The team
 * had already read the number as a clock ("is that the time?" — "yes"), so this makes it one.
 *
 * A clock also cannot drift: there is no origin to get wrong, and anyone can check it against
 * the clock on the wall.
 */
export function formatTranscriptClockTime(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(epochMs));
}

export function formatTranscriptTimestamp(timeMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, timeMs) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function belongsToSameUtterance(previous: TranscriptSegmentDto, next: TranscriptSegmentDto): boolean {
  if (previous.speakerId !== next.speakerId) return false;
  if (previous.originalLanguage !== next.originalLanguage) return false;
  // No target-language check any more. It existed to stop two bubbles with DIFFERENT
  // translations from being folded into one slot that could only hold a single language; the
  // translations are keyed by language now, so a merge unions them and nothing is lost.
  // Keeping the check would instead split one person's continuous sentence into two bubbles
  // whenever the room translated it into more than one language.

  const hasTimeline = previous.endTimeMs > 0 && next.startTimeMs > 0;
  if (!hasTimeline) return true;

  const gapMs = next.startTimeMs - previous.endTimeMs;
  return gapMs >= 0 && gapMs <= MAX_UTTERANCE_GAP_MS;
}

function belongsToSameSavedUtterance(
  previous: SavedTranscriptSegmentDto,
  next: SavedTranscriptSegmentDto,
): boolean {
  const previousSpeaker = previous.speakerParticipantId ?? previous.speakerName;
  const nextSpeaker = next.speakerParticipantId ?? next.speakerName;
  if (previousSpeaker !== nextSpeaker) return false;
  if (previous.originalLanguage !== next.originalLanguage) return false;

  const gapMs = next.startTimeMs - previous.endTimeMs;
  return gapMs >= 0 && gapMs <= MAX_UTTERANCE_GAP_MS;
}

/**
 * Exported for transcript-language.ts, which joins a merged utterance's per-language
 * translations back together and has to do it the same way the original text was joined —
 * two copies of "how do two halves of a sentence become one" is one copy too many.
 */
/**
 * WT-589: which of a batch edit's drafts are actually corrections worth posting.
 *
 * Each one that survives this filter becomes an immutable row in transcript_corrections AND a
 * re-translation of that line into every target language, so the two exclusions are not tidiness:
 *
 *   unchanged  — a line the user tabbed through without touching. Posting it files a revision
 *                that changed nothing and re-translates a sentence that already has its
 *                translations, for every line of the meeting at once.
 *   emptied    — there is no delete on this path. An empty draft is somebody mid-retype, or a
 *                line they cleared by accident; either way the honest answer is to leave the
 *                stored sentence alone rather than to write a blank one over it.
 *
 * Compared trimmed on both sides, because whitespace is what a caret leaves behind, not an edit.
 */
export function pendingCorrections<T extends { id: string; originalText: string }>(
  segments: readonly T[],
  drafts: Readonly<Record<string, string>>,
): T[] {
  return segments.filter((segment) => {
    const draft = drafts[segment.id];
    if (draft === undefined) return false;
    const trimmed = draft.trim();
    return trimmed.length > 0 && trimmed !== segment.originalText.trim();
  });
}

export function appendText(current?: string, incoming?: string): string {
  const left = current?.trim() || "";
  const right = incoming?.trim() || "";
  if (!left) return right;
  if (!right || left === right || left.endsWith(right)) return left;
  if (right.startsWith(left)) return right;
  return `${left} ${right}`;
}
