// Relative, with the extension, because this module's own unit tests run under the plain node
// test runner (`--experimental-strip-types`), which does not resolve the "@/" alias. The other
// imports here get away with it only because they are `import type` and erase before runtime —
// this one is a real value.
import { normalizeLanguageCode } from "../language/languages.ts";
import { appendParagraph, joinTranscriptText, startsNewParagraph } from "./sentence-flow.ts";
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

/**
 * How long one person has to stop talking before the next thing they say is a NEW bubble.
 *
 * WHAT THIS NUMBER IS MEASURED AGAINST
 *   A chunk boundary is not the end of a sentence. The ingress worker closes a chunk after
 *   `vad_silence_hangover_ms` (576) or `vad_short_turn_hangover_ms` (864) of silence, and a
 *   Vietnamese speaker draws breath mid-sentence at 300–700ms — so almost every chunk boundary
 *   falls INSIDE a sentence, and a bubble per chunk is a bubble per breath.
 *
 *   This threshold therefore has to sit well clear of the hangover. 2.5s is a pause somebody
 *   notices in a conversation: long enough that a breath, a "ừm", or a sentence cut by the 6s
 *   `chunk_duration_ms` cap all stay in one bubble, short enough that genuinely finishing a
 *   thought and starting another one reads as two.
 */
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
  /**
   * The turn's text broken where the SPEAKER stopped, not where a chunk ended.
   *
   * `originalText` stays the whole thing — search, copy and corrections all read it, and a
   * correction has to be diffed against what was said, not against how it was laid out. This is
   * the same text, split at the silences long enough to be an end of thought
   * (`SENTENCE_PAUSE_MS`), which is the only sentence signal available for free: Vietnamese STT
   * routinely returns no terminal punctuation, and the pause was measured either way.
   */
  paragraphs: string[];
};

export function groupTranscriptSegments(
  segments: TranscriptSegmentDto[],
): GroupedTranscriptSegment[] {
  const utterances: GroupedTranscriptSegment[] = [];

  for (const segment of segments) {
    // Rows nobody said are dropped here, not only in the saved-transcript path. The filter used
    // to live solely in groupSavedTranscriptSegments, so `__MEETING_END__` was invisible on the
    // room detail page and perfectly visible in the LIVE panel during the meeting — attributed
    // to "System", timestamped 0:00, with a 100% confidence badge beside it.
    //
    // Dropping before the merge matters as much as dropping at all: a marker absorbed into a
    // neighbouring utterance stops being a segment of its own and becomes part of a real line's
    // text, where no later filter can find it.
    //
    // BOTH guards run, and they catch different things. isRenderableTranscriptSegment reads only
    // the TEXT — it adds the empty-row case and misses a marker whose text was mangled on the
    // way, and production holds a `__MEETING_END__a`. That one still arrives as speaker
    // `system`, which is the tell only isTranscriptSystemSegment reads.
    if (isTranscriptSystemSegment(segment)) continue;
    if (!isRenderableTranscriptSegment(segment.originalText)) continue;

    const previous = utterances[utterances.length - 1];
    if (!previous || !belongsToSameUtterance(previous, segment)) {
      utterances.push({
        ...segment,
        mergedSegmentIds: [segment.segmentId],
        paragraphs: segment.originalText?.trim() ? [segment.originalText.trim()] : [],
      });
      continue;
    }

    utterances[utterances.length - 1] = {
      ...previous,
      originalText: appendText(previous.originalText, segment.originalText),
      paragraphs: appendParagraph(
        previous.paragraphs,
        segment.originalText,
        startsNewParagraph(previous.endTimeMs, segment.startTimeMs),
      ),
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
 * Whether a segment came from the pipeline rather than from a person.
 *
 * `isTranscriptControlMarker` reads the text, and the text is not the only tell. When the meeting
 * service publishes a sentinel it does so as speaker `system`, and the transcript consumer
 * persists that as NO participant id, the display name "System" and the pseudo-language
 * "system" (TranscriptConsumerPollingPolicy.TryResolveSpeaker). A marker whose text was mangled
 * on the way — production holds a `__MEETING_END__a` — still carries every one of those, so a
 * line is dropped on ANY of them.
 *
 * WT-311: this is why the empty state was inconsistent. A transcript holding nothing but such a
 * row rendered as a list of one "System 00:00 …" line on some meetings and as "No transcript
 * recorded" on others, depending on which of the tells the row happened to carry. The saved
 * and live shapes name the speaker id differently (`speakerParticipantId` and `speakerId`);
 * both are read so the two paths cannot disagree.
 */
export function isTranscriptSystemSegment(segment: {
  originalText?: string | null;
  originalLanguage?: string | null;
  speakerName?: string | null;
  speakerParticipantId?: string | null;
  speakerId?: string | null;
}): boolean {
  if (isTranscriptControlMarker(segment.originalText)) return true;
  if ((segment.originalLanguage ?? "").trim().toLowerCase() === "system") return true;

  const speakerId = (segment.speakerParticipantId ?? segment.speakerId ?? "").trim();
  if (speakerId.toLowerCase() === "system") return true;
  // A person always speaks as a participant id. "System" with no id is the persisted sentinel;
  // a participant who happens to be called System has an id and is kept.
  return !speakerId && (segment.speakerName ?? "").trim().toLowerCase() === "system";
}

/**
 * WT-311: when translation FIRST started in a meeting — the earliest session with a start.
 *
 * Sessions arrive oldest-first, but that is a convention of the endpoint rather than a
 * guarantee, and the header line built from this must not move when a refetch reorders them.
 * Null when translation never ran, which is a real state and not a missing one.
 */
export function firstTranslationStart<T extends { startedAt?: string | null }>(
  sessions: readonly T[],
): string | null {
  let earliest: { at: number; iso: string } | null = null;
  for (const session of sessions) {
    if (!session.startedAt) continue;
    const at = Date.parse(session.startedAt);
    if (!Number.isFinite(at)) continue;
    if (!earliest || at < earliest.at) earliest = { at, iso: session.startedAt };
  }
  return earliest?.iso ?? null;
}

/**
 * Whether a stored row is a line of the meeting at all — the client's copy of the rule the
 * backend translates by (TranscriptTranslationBackfillService.IsTranslatableSegment).
 *
 * Two kinds of row get written into a transcript that nobody said. Control markers are one, and
 * they were already filtered here. The other is a row with NO TEXT: stt_worker publishes a
 * trailing `text=""` marker when an audio chunk finishes, and until the ingress consumer grew a
 * guard for it (TranscriptRedisConsumerService, "silently accumulating stray empty rows over a
 * long conversation") every chunk of every meeting left one behind. Those rows are still in every
 * transcript recorded before that guard.
 *
 * WHY THIS HAS TO BE THE SAME RULE ON BOTH SIDES (2026-09-09)
 *   The backend excludes an empty row from BOTH halves of its translation coverage: it is not
 *   counted in `totalSegments` and it is never queued into `missing`, because there is nothing to
 *   translate. This side kept it — as a blank bubble of its own, or, when it fell between two
 *   chunks of one person talking, absorbed into that utterance's `mergedSegmentIds`.
 *
 *   An id in that list is a promise that a translation exists for it. resolveTranscriptLine reads
 *   `covered < segmentIds.length` off it, so an utterance that swallowed one empty row was
 *   PERMANENTLY `isPartial`: the panel marked it incomplete, the language picker refused to say
 *   "The whole meeting", and the "N entries are not in English yet — Translate them" line could
 *   never reach zero, because the only thing standing between it and zero was a row the server
 *   will not translate and no reader can see.
 */
export function isRenderableTranscriptSegment(text: string | null | undefined): boolean {
  const trimmed = (text ?? "").trim();
  return trimmed.length > 0 && !isTranscriptControlMarker(trimmed);
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
  /** See GroupedTranscriptSegment.paragraphs — the same text, split at the speaker's own stops. */
  paragraphs: string[];
};

/**
 * Groups a saved/paginated transcript (from the REST API, not the live SignalR
 * stream) so consecutive segments from the same speaker render as one continuous
 * block instead of a new line per finalized STT chunk.
 *
 * Rows nobody said — control markers, and rows with no text at all — are dropped first, so they
 * can never be merged into a neighbouring utterance: as part of a real line's text in the first
 * case, and as an id in `mergedSegmentIds` that no translation will ever cover in the second.
 * See isRenderableTranscriptSegment.
 */
export function groupSavedTranscriptSegments(
  segments: SavedTranscriptSegmentDto[],
): GroupedSavedTranscriptSegment[] {
  const utterances: GroupedSavedTranscriptSegment[] = [];

  for (const segment of segments) {
    // Both guards. isRenderableTranscriptSegment reads only the text, and the text is not the
    // only tell: a marker mangled on the way — production holds a `__MEETING_END__a` — still
    // arrives as speaker `system`, which only isTranscriptSystemSegment catches.
    if (isTranscriptSystemSegment(segment)) continue;
    if (!isRenderableTranscriptSegment(segment.originalText)) continue;

    const previous = utterances[utterances.length - 1];
    if (!previous || !belongsToSameSavedUtterance(previous, segment)) {
      utterances.push({
        ...segment,
        mergedSegmentIds: [segment.id],
        paragraphs: segment.originalText?.trim() ? [segment.originalText.trim()] : [],
      });
      continue;
    }

    utterances[utterances.length - 1] = {
      ...previous,
      originalText: appendText(previous.originalText, segment.originalText),
      paragraphs: appendParagraph(
        previous.paragraphs,
        segment.originalText,
        startsNewParagraph(previous.endTimeMs, segment.startTimeMs),
      ),
      endTimeMs: Math.max(previous.endTimeMs, segment.endTimeMs),
      // A correction to ANY chunk of the sentence is a correction to the sentence. Read off the
      // first chunk alone, an edit to the second half of a long utterance left the line showing
      // no history at all.
      isCorrected: previous.isCorrected || segment.isCorrected,
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
 * (the same units as `segment.startTimeMs`), so the panel can draw a "Transcript paused at HH:MM
 * and resumed at HH:MM" divider between the segments on either side of it — the transcript-pause
 * counterpart to `groupSegmentsByTranslationSession`'s "Translation N" dividers.
 */
export type TranscriptPauseGap = {
  window: TranscriptPauseWindowDto;
  startMs: number;
  /** null while the transcript is CURRENTLY paused for this room. */
  endMs: number | null;
};

/**
 * Complaints about the pause machinery, in development only and once per distinct `key`.
 *
 * WHY DEV-ONLY, AND WHY NOT A THROW
 *   Everything this channel reports is a DATA condition — a room with no timeline anchor, a
 *   broadcast that has outrun its window list. A participant in a real meeting can do nothing
 *   about any of it, and taking their transcript down with an exception over it would turn a
 *   degraded panel into no panel at all. The people who can act on it are the ones running the
 *   app locally, so that is who is told.
 *
 * WHY IT IS DEDUPED BY KEY
 *   Both callers sit on render paths — inside `useMemo`s that recompute whenever a segment
 *   arrives, which during a busy meeting is several times a second, and twice per pass again
 *   under StrictMode. An un-deduped warn would bury the console in copies of one fact and be
 *   muted by the second developer who saw it. Once per condition per page load is the most it
 *   can be worth saying.
 *
 * The alternative considered and rejected was returning a richer result type from
 * `resolveTranscriptPauseGaps` and making every caller unpack it: that spreads the handling of a
 * rare fault across every divider on two panels, and the panel that actually depends on the answer
 * (the live one) already asks the sharper question below.
 */
const warnedPauseConditions = new Set<string>();

function warnAboutPauseGapsInDev(key: string, message: string): void {
  if (process.env.NODE_ENV === "production") return;
  if (warnedPauseConditions.has(key)) return;
  warnedPauseConditions.add(key);
  console.warn(`[transcript-pause] ${message}`);
}

/**
 * Whether the gap list is about to filter NOTHING while the transcript is known to be paused —
 * the one state in which `withoutSegmentsInOpenPauseGaps` is a no-op and says so to nobody.
 *
 * THIS IS THE DESIGN'S MOST DANGEROUS FAILURE, BECAUSE IT IS THE QUIET ONE
 *   Every gap in the list is anchored against `baseTime`, and `resolveTranscriptPauseGaps` returns
 *   [] when there is none to anchor against. No gaps means no OPEN gap; no open gap means the
 *   filter keeps every segment; and the panel then prints, underneath its own amber "nothing said
 *   from now on is written down" banner, the exact words the pause exists to withhold. Nothing
 *   errors, nothing is red, and every other assertion about the feature stays true.
 *
 *   A missing `baseTime` is not the only route in. A broadcast reaches this client a round trip
 *   before the window list catches up, and `resolveTranscriptPause` gives a broadcast-learned pause
 *   no `since` at all — so `withLivePauseGap` has no instant to synthesize from and the list stays
 *   empty for the length of that fetch. Asking about the OUTCOME ("is there an open gap to match?")
 *   rather than about either cause is what makes one check cover both.
 *
 * Answers and, in development, says so out loud once — see warnAboutPauseGapsInDev.
 */
export function pauseFilterHasNothingToMatch(
  pause: { paused: boolean } | null | undefined,
  gaps: readonly TranscriptPauseGap[],
): boolean {
  if (!pause?.paused) return false;
  if (gaps.some((gap) => gap.endMs === null)) return false;

  warnAboutPauseGapsInDev(
    "no-open-gap-while-paused",
    "The transcript is paused but the gap list holds no open window, so nothing is being "
      + "withheld. Check that the panel has a baseTime and that the pause-window refetch landed.",
  );
  return true;
}

/**
 * Converts each window's wall-clock StartedAt/EndedAt into meeting-relative ms. Returns []
 * without a `baseTime` to anchor against — old data, or a room with no timeline anchor yet —
 * same "nothing to compute a position with" fallback `groupSegmentsByTranslationSession` takes.
 *
 * Dropping windows for want of an anchor is not the same as having none, and the difference is
 * invisible from the return value: see pauseFilterHasNothingToMatch for what an empty list costs
 * the live panel. Said out loud here, in dev, because this is the only place that can tell the
 * two apart.
 */
export function resolveTranscriptPauseGaps(
  windows: readonly TranscriptPauseWindowDto[],
  baseTime?: string,
): TranscriptPauseGap[] {
  const baseMs = baseTime ? new Date(baseTime).getTime() : NaN;
  if (Number.isNaN(baseMs) || !windows.length) {
    if (Number.isNaN(baseMs) && windows.length) {
      warnAboutPauseGapsInDev(
        "no-base-time",
        `${windows.length} pause window(s) cannot be placed: baseTime is `
          + `${baseTime === undefined ? "missing" : `unusable (${baseTime})`}. No divider will be `
          + "drawn and, on the live panel, nothing said during a pause will be withheld.",
      );
    }
    return [];
  }

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
 * A run of transcript with the pause windows that sit immediately above it.
 *
 * `gapsBefore` is a LIST rather than one window because two pauses with nobody speaking between
 * them are one hole in the record, not two: drawn as two dividers they stack against each other
 * with nothing in between, which reads as a rendering fault rather than as two decisions the host
 * made. The renderer collapses a run into a single divider — see formatTranscriptPauseGapRun.
 */
export type TranscriptPauseBlock<T> = {
  gapsBefore: TranscriptPauseGap[];
  segments: T[];
};

/**
 * WT-657. The gap list, plus the pause the room is in RIGHT NOW if the window list does not
 * already know about it.
 *
 * THE WINDOW LIST IS NOT WRONG, IT IS LATE
 *   `applyTranscriptPause` in persistent-meeting-session fires `pauseWindowsQuery.refetch()` on
 *   BOTH broadcasts, on EVERY participant — the query key is room-scoped and shared, so the panel
 *   is reading the same cache that refetch fills. The list therefore does catch up on its own.
 *   What it cannot do is catch up instantly: between `TranscriptPaused` landing and that round
 *   trip resolving, this client holds `paused: true` next to a window list with no open window.
 *
 *   That interval is short and it is exactly when the words are arriving. Anything derived from
 *   the windows alone renders nothing during it — so a viewer would watch lines pile up under the
 *   paused notice for as long as the fetch takes, which is the reported bug in miniature. Folding
 *   the broadcast in closes the race rather than papering over a hole.
 *
 * `since` is a wall-clock instant and gaps are meeting-relative, hence `baseTime` — the same
 * anchor `resolveTranscriptPauseGaps` uses, and the same "nothing to anchor against" fallback.
 *
 * WT-605 consumes this beyond the divider it was written for: the gaps this returns are what
 * `withoutSegmentsInOpenPauseGaps` filters against, so the live pause suppresses lines from the
 * instant the broadcast lands rather than from whenever the refetch comes back.
 */
export function withLivePauseGap(
  gaps: readonly TranscriptPauseGap[],
  pause: { paused: boolean; since: string | null } | undefined,
  baseTime?: string,
): TranscriptPauseGap[] {
  if (!pause?.paused) return [...gaps];
  // Already known from the window list — the host's case. Adding a second open gap would split the
  // same pause in two and draw its divider twice.
  if (gaps.some((gap) => gap.endMs === null)) return [...gaps];

  const baseMs = baseTime ? new Date(baseTime).getTime() : NaN;
  const sinceMs = pause.since ? new Date(pause.since).getTime() : NaN;
  if (Number.isNaN(baseMs) || Number.isNaN(sinceMs)) return [...gaps];

  return [
    ...gaps,
    {
      // Synthetic: the real row exists server-side, but this viewer has not been sent it. Only
      // `startMs`/`endMs` are read for splitting; `id` keys the divider's React element.
      window: { id: `live-pause-${pause.since}`, startedAt: pause.since!, endedAt: null },
      startMs: sinceMs - baseMs,
      endMs: null,
    } as TranscriptPauseGap,
  ].sort((left, right) => left.startMs - right.startMs);
}

/**
 * Splits an already-chronological list of segments into blocks around each pause gap.
 *
 * A SEGMENT CAN FALL INSIDE A GAP, AND THE DOCSTRING HERE USED TO DENY IT (WT-605, WT-657)
 *   It claimed "no segment is ever expected to fall INSIDE a gap — the segments spoken during it
 *   were never persisted". That is true of the SAVED transcript and false of the live one, which
 *   is where the bug was found: pausing stops the record growing, it does not stop
 *   `TranscriptSegmentReceived`, because the caption lane and the transcript panel read the same
 *   store and captions deliberately keep running through a pause. WT-657 diagnosed that same lie
 *   independently, from the other end — the panel and the notice asserting opposite things.
 *
 *   So a gap's block opens at the moment the pause ENDED, not at the moment it began. Opening it
 *   at `startMs` put every line spoken during the pause BELOW the "Transcript paused" divider,
 *   where it reads as having been said after the host resumed: the record then asserts the
 *   opposite of what happened. Above the divider it reads as "and from here, nothing", which is
 *   what the mark is for.
 *
 *   A gap still open has no end to reach, so nothing can open its block from inside the loop; it
 *   is emitted by the trailing pass below, after every line already in hand. On the live panel
 *   those lines are gone before they get here (withoutSegmentsInOpenPauseGaps); on the saved one
 *   the case is a chunk finalized either side of the pause boundary, and this is where it lands.
 *
 *   No `recorded` flag rides along, because nothing downstream may render an unrecorded line —
 *   see withoutSegmentsInOpenPauseGaps for the product decision that settles it. A flag here
 *   would be an invitation to draw those lines dimmed instead of dropping them, which is the one
 *   outcome the panel must not produce.
 *
 * Independent of, and applied on top of, `groupSegmentsByTranslationSession`: a room can pause
 * translation and pause transcript at different, unrelated moments, so callers run this within
 * each translation-session block rather than instead of that grouping. The gaps handed in must be
 * the ones belonging to THAT block — see distributePauseGapsAcrossBlocks, without which the
 * trailing pass below redraws every late gap once per session.
 */
export function splitSegmentsAroundPauseGaps<T extends { startTimeMs: number }>(
  segments: readonly T[],
  gaps: readonly TranscriptPauseGap[],
): Array<TranscriptPauseBlock<T>> {
  if (!gaps.length) return [{ gapsBefore: [], segments: [...segments] }];

  const blocks: Array<TranscriptPauseBlock<T>> = [{ gapsBefore: [], segments: [] }];

  function openGap(gap: TranscriptPauseGap) {
    const last = blocks[blocks.length - 1];
    // Nothing was said between this pause and the one before it, so the two are one stretch of
    // missing record. Folding them into one block is what lets the divider say so once.
    if (last.gapsBefore.length > 0 && last.segments.length === 0) {
      last.gapsBefore.push(gap);
      return;
    }
    blocks.push({ gapsBefore: [gap], segments: [] });
  }

  let gapIndex = 0;
  for (const segment of segments) {
    while (
      gapIndex < gaps.length
      && gaps[gapIndex].endMs !== null
      && segment.startTimeMs >= gaps[gapIndex].endMs!
    ) {
      openGap(gaps[gapIndex]);
      gapIndex += 1;
    }
    blocks[blocks.length - 1].segments.push(segment);
  }

  // A gap with no segment after it — the room is still paused, or nobody has spoken since
  // resuming — would otherwise vanish here instead of rendering its divider. Trailing blocks
  // stay empty; the divider itself is drawn from `gapsBefore`, not from having lines to hold.
  while (gapIndex < gaps.length) {
    openGap(gaps[gapIndex]);
    gapIndex += 1;
  }

  return blocks;
}

/**
 * Which translation-session block each pause window should be drawn in — one entry per block,
 * in the same order.
 *
 * WHY THIS EXISTS (WT-605, the duplicate-divider bug)
 *   Both panels called `splitSegmentsAroundPauseGaps(block.segments, pauseGaps)` inside their
 *   `blocks.map` — every block handed the WHOLE gap list. The trailing pass in that function
 *   emits every gap that sits after the block's last segment, so with two or more translation
 *   sessions the same pause was drawn once in each block: "Transcript paused · 10:15–10:20"
 *   appearing three times down a transcript, which reads as three pauses.
 *
 *   The fix belongs here rather than in the renderer because it is the only place that can see
 *   all the blocks at once, which is exactly the knowledge the per-block call is missing.
 *
 * A gap goes to the block holding the first line spoken after it ENDED — the same boundary
 * splitSegmentsAroundPauseGaps opens its block on, so the two cannot disagree about where the
 * divider lands. A gap nothing follows (still open, or nobody spoke again) goes to the last
 * block, where the trailing pass will draw it.
 *
 * Takes start TIMES rather than the blocks themselves, which is a concession to the React
 * Compiler rather than a taste: handing it the segment arrays makes it treat every block as
 * possibly mutated here, and it then gives up memoizing the whole saved-transcript panel. Times
 * are all this decision has ever needed.
 */
export function distributePauseGapsAcrossBlocks(
  /** One entry per translation-session block, in order — the start times of its segments. */
  blockStartTimes: readonly (readonly number[])[],
  gaps: readonly TranscriptPauseGap[],
): TranscriptPauseGap[][] {
  const perBlock: TranscriptPauseGap[][] = blockStartTimes.map(() => []);
  if (!blockStartTimes.length) return perBlock;

  for (const gap of gaps) {
    let target = blockStartTimes.length - 1;
    if (gap.endMs !== null) {
      const endMs = gap.endMs;
      const found = blockStartTimes.findIndex((times) => times.some((time) => time >= endMs));
      if (found !== -1) target = found;
    }
    perBlock[target].push(gap);
  }

  return perBlock;
}

/** A pause this short prints the same clock time at both ends, so it prints its length instead. */
const SHORT_PAUSE_MS = 60_000;

function defaultPauseClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Whole seconds of a stretch shorter than a minute, or null when it is longer or unmeasurable.
 *
 * Never 0s: a pause the host lifted immediately still happened, and rounding it away would print
 * a divider saying nothing was missed for no measurable stretch of time.
 */
function secondsIfUnderAMinute(
  startedAt: string,
  endedAt: string | null | undefined,
): number | null {
  if (!endedAt) return null;
  const lengthMs = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(lengthMs) || lengthMs < 0 || lengthMs >= SHORT_PAUSE_MS) return null;
  return Math.max(1, Math.round(lengthMs / 1_000));
}

/**
 * The WHOLE text of one transcript-pause divider, for a run of one or more windows.
 *
 * TWO MARKS, NOT A RANGE (product owner, 2026-09-10)
 *   The label used to be a range with a prefix bolted on by each panel — "Transcript paused ·
 *   10:15 PM–10:18 PM". A range reads as a duration somebody has to subtract; the two moments the
 *   reader actually wants are when the record stopped and when it started again, said as moments.
 *   So the sentence names both: "Transcript paused at 10:15 PM and resumed at 10:18 PM".
 *
 *   The prefix moved in here with it. Split across the module and two JSX files, one panel could
 *   say "Transcript paused ·" while the other said something else, and the sentence would only be
 *   grammatical by coincidence — the second mark has to agree with the first in every branch below.
 *
 * FOUR CASES, AND EACH ONE IS A DIFFERENT SENTENCE BECAUSE EACH IS A DIFFERENT FACT
 *   still open, live  — there IS no second mark yet. "…and not resumed yet" says the pause is the
 *                       reader's present, without inventing a time for something that has not
 *                       happened.
 *   still open, ended — the record of a meeting that finished mid-pause. There is no "now" on that
 *                       page months later, and "not resumed yet" would promise a resume that can
 *                       never come; the meeting ending IS what closed the hole.
 *   under a minute    — both marks format to the same minute, so "paused at 10:15 PM and resumed
 *                       at 10:15 PM" reads as a broken clock rather than as a short pause. The
 *                       length replaces the second mark, which is the one honest thing left to say.
 *   a run of windows  — see TranscriptPauseBlock.gapsBefore. Consecutive pauses with nothing said
 *                       between them are one hole in the record and are named once, with the count,
 *                       so the two marks are the run's outer edges rather than one pause's.
 *
 * `formatTime` is injectable so the tests can assert the SHAPE of the sentence without depending on
 * the machine's locale and time zone, which is otherwise what decides whether this reads
 * "10:15 PM" or "22:15".
 */
export function formatTranscriptPauseGapRun(
  gaps: readonly TranscriptPauseGap[],
  options: {
    /** True on the saved record of a meeting that is over — see the ended case above. */
    meetingEnded?: boolean;
    formatTime?: (iso: string) => string;
  } = {},
): string {
  if (!gaps.length) return "";

  const formatTime = options.formatTime ?? defaultPauseClock;
  const first = gaps[0];
  const last = gaps[gaps.length - 1];
  const pausedAt = formatTime(first.window.startedAt);
  const resumedAt = last.window.endedAt ? formatTime(last.window.endedAt) : null;
  // Measured across the whole RUN, so two pauses inside one minute cannot print the same mark
  // twice either — the sub-minute case is about what the clock can resolve, not about how many
  // windows produced the hole.
  const seconds = secondsIfUnderAMinute(first.window.startedAt, last.window.endedAt);

  if (gaps.length > 1) {
    if (!resumedAt) {
      return options.meetingEnded
        ? `Transcript paused ${gaps.length} times since ${pausedAt}, still paused when the meeting ended`
        : `Transcript paused ${gaps.length} times since ${pausedAt}, not resumed yet`;
    }
    return seconds === null
      ? `Transcript paused ${gaps.length} times between ${pausedAt} and ${resumedAt}`
      : `Transcript paused ${gaps.length} times at ${pausedAt}, for ${seconds}s`;
  }

  if (!resumedAt) {
    return options.meetingEnded
      ? `Transcript paused at ${pausedAt} and still paused when the meeting ended`
      : `Transcript paused at ${pausedAt} and not resumed yet`;
  }

  return seconds === null
    ? `Transcript paused at ${pausedAt} and resumed at ${resumedAt}`
    : `Transcript paused at ${pausedAt} for ${seconds}s`;
}

/**
 * The lines that are actually being written down: everything except what was said while a pause
 * window is STILL OPEN. WT-605, and the defect the tester reported.
 *
 * DROPPED, NOT DIMMED — THE PRODUCT OWNER'S RULING OF 2026-09-10
 *   WT-657 fixed the same defect the other way: keep the lines, mark them unrecorded, render them
 *   at reduced opacity under a caption. Both designs are honest; only one of them is the product.
 *   The ruling, verbatim: "khi host chủ động pause transcript là sẵn sàng cho tinh thần chỉ dịch
 *   bằng audio dubbing và voice clone, không persist ở transcript và DB" — a host who pauses the
 *   transcript is opting into translation carried by audio dubbing and voice clone ALONE, with
 *   nothing persisted to the transcript or the database.
 *
 *   So the panel must not show what will not be kept. A dimmed line is still a line on screen: it
 *   gets read, quoted and screenshotted, and it is absent from the record the meeting is judged
 *   by — which makes the panel and the saved transcript disagree about what was said. The gap the
 *   divider draws is the honest artefact of that decision, and the placeholder below the list is
 *   where the absence explains itself.
 *
 * WHY THE FILTER IS HERE AND NOT AT THE STORE OR THE GATEWAY
 *   Pausing the transcript stops the RECORD growing and nothing else — the product decision of
 *   2026-09-09 is explicit that the caption lane keeps showing words through a pause. The overlay
 *   (live-subtitle-overlay) reads the very same `transcriptSegments` store the transcript panel
 *   reads, so a gate at the store or in `addTranscriptSegment` would take the captions down with
 *   the transcript — killing the exact promise the paused banner prints two inches above it.
 *
 *   A store gate would not even be sufficient. `addOrMergeTranslationText` in
 *   translationRoom-store CREATES a segment when a TranslationTextReceived arrives with no join
 *   key to merge into, so the translation lane rebuilds a bubble whatever the STT lane was
 *   allowed to do. Filtering at the point of render is immune to how a segment got into the
 *   store, which is the only property that makes this rule hold.
 *
 * WHY ONLY OPEN WINDOWS, WHEN A CLOSED ONE DESCRIBES A PAUSE JUST AS REAL
 *   `startTimeMs` is an offset into the audio INGRESS TRACK, and that track resets to zero when
 *   it reconnects (see formatTranscriptClockTime, which exists because of it). Against a CLOSED
 *   window — a bounded interval somewhere in the middle of the meeting — a post-reconnect line
 *   can land inside that interval by arithmetic alone and be deleted from the panel although it
 *   was recorded perfectly. That is the direction this rule must never fail in: hiding words that
 *   WERE written down is worse than the bug being fixed, and it is silent.
 *
 *   An open window has no upper bound, so the only lines it can match are the ones arriving now —
 *   and a line arriving now is, by definition, one that is not being recorded. `receivedAt` is
 *   read as a second, independent tell for the same reason: it is stamped on arrival in wall
 *   clock, so it survives the ingress reset that `startTimeMs` does not.
 *
 * THE GAPS HANDED IN MUST HAVE PASSED THROUGH withLivePauseGap
 *   This filter is only ever as current as the list it is given, and the window list lags the
 *   broadcast by one round trip (see withLivePauseGap). Fed from `resolveTranscriptPauseGaps`
 *   alone there is no open window to match during that interval, so this returns every segment
 *   untouched and the panel prints exactly the lines the pause exists to withhold — the reported
 *   bug, surviving its own fix for as long as the fetch takes.
 *
 *   That gap-closing is WT-657's, carried over from the design this one replaced. The rendering
 *   decision changed; the observation that the window list alone is not a live enough source did
 *   not, and it is load-bearing here.
 *
 * The count comes back with the lines because the panel says so on screen: a stretch where words
 * are visibly being spoken and nothing appears needs to explain itself, or the panel looks broken.
 */
export function withoutSegmentsInOpenPauseGaps<
  T extends { startTimeMs: number; receivedAt?: number | null },
>(
  segments: readonly T[],
  gaps: readonly TranscriptPauseGap[],
): { segments: T[]; hiddenCount: number } {
  const open = gaps.filter((gap) => gap.endMs === null);
  if (!open.length) return { segments: [...segments], hiddenCount: 0 };

  const kept: T[] = [];
  let hiddenCount = 0;

  for (const segment of segments) {
    if (open.some((gap) => fallsInsideOpenPauseGap(segment, gap))) {
      hiddenCount += 1;
      continue;
    }
    kept.push(segment);
  }

  return { segments: kept, hiddenCount };
}

function fallsInsideOpenPauseGap(
  segment: { startTimeMs: number; receivedAt?: number | null },
  gap: TranscriptPauseGap,
): boolean {
  if (segment.startTimeMs >= gap.startMs) return true;

  // The ingress clock reset while the pause was on, so this line's offset is small again and the
  // comparison above says it predates a pause it was actually spoken during. `receivedAt` is
  // wall-clock and cannot be rewound that way.
  const receivedAt = segment.receivedAt;
  if (typeof receivedAt !== "number") return false;
  const pausedAt = Date.parse(gap.window.startedAt);
  return Number.isFinite(pausedAt) && receivedAt >= pausedAt;
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

/**
 * Whether two consecutive segments from one speaker are still the same utterance, by time alone.
 *
 * OVERLAP IS NOT A NEW UTTERANCE
 *   The rule used to be `gapMs >= 0 && gapMs <= MAX`, and the lower bound is the bug. A NEGATIVE
 *   gap means the second segment starts before the first one ended — segments that overlap are
 *   the same person still talking, which is the strongest possible evidence for merging, and it
 *   was being read as the strongest possible evidence for splitting.
 *
 *   It was not a rare edge either. Until the STT worker was corrected, every segment was stamped
 *   late by the length of its own chunk, so a 6s chunk (the `chunk_duration_ms` cap) followed by
 *   the short chunk carrying the rest of the same sentence produced a gap of about MINUS 4.8
 *   seconds — reliably, on exactly the sentences that had been cut mid-word. That is why
 *   transcripts broke "ở mỗi chunk".
 *
 *   Both halves are fixed: the stamps are right at the source now, and a negative gap here can no
 *   longer split a sentence even if some other producer reintroduces one.
 */
function withinOneUtterance(previousEndMs: number, nextStartMs: number): boolean {
  return nextStartMs - previousEndMs <= MAX_UTTERANCE_GAP_MS;
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

  return withinOneUtterance(previous.endTimeMs, next.startTimeMs);
}

function belongsToSameSavedUtterance(
  previous: SavedTranscriptSegmentDto,
  next: SavedTranscriptSegmentDto,
): boolean {
  const previousSpeaker = previous.speakerParticipantId ?? previous.speakerName;
  const nextSpeaker = next.speakerParticipantId ?? next.speakerName;
  if (previousSpeaker !== nextSpeaker) return false;
  if (previous.originalLanguage !== next.originalLanguage) return false;

  return withinOneUtterance(previous.endTimeMs, next.startTimeMs);
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

/**
 * How two halves of one utterance become one line.
 *
 * The rule moved to `sentence-flow.ts` when it grew a partial-overlap case: this used to catch
 * only a TOTAL overlap and glue everything else with a space, so "chúng ta sẽ" followed by
 * "ta sẽ bắt đầu" rendered as "chúng ta sẽ ta sẽ bắt đầu". Kept exported here because
 * transcript-language.ts joins a merged utterance's per-language translations and has to do it
 * the same way — two copies of "how do two halves become one" is one copy too many.
 */
export function appendText(current?: string, incoming?: string): string {
  return joinTranscriptText(current, incoming);
}
