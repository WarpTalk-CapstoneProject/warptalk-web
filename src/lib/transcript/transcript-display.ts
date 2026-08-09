import type { TranscriptSegmentDto } from "@/types/realtime";
import type { TranscriptSegmentDto as SavedTranscriptSegmentDto } from "@/types/transcript";
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
    const previous = utterances[utterances.length - 1];
    if (!previous || !belongsToSameUtterance(previous, segment)) {
      utterances.push({ ...segment, mergedSegmentIds: [segment.segmentId] });
      continue;
    }

    utterances[utterances.length - 1] = {
      ...previous,
      originalText: appendText(previous.originalText, segment.originalText),
      translatedText: appendText(previous.translatedText, segment.translatedText) || undefined,
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
 */
export function isTranscriptControlMarker(text: string | null | undefined): boolean {
  return /^__[A-Z0-9_]+__$/.test((text ?? "").trim());
}

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
): SavedTranscriptSegmentDto[] {
  const utterances: SavedTranscriptSegmentDto[] = [];

  for (const segment of segments) {
    if (isTranscriptControlMarker(segment.originalText)) continue;

    const previous = utterances[utterances.length - 1];
    if (!previous || !belongsToSameSavedUtterance(previous, segment)) {
      utterances.push({ ...segment });
      continue;
    }

    utterances[utterances.length - 1] = {
      ...previous,
      originalText: appendText(previous.originalText, segment.originalText),
      endTimeMs: Math.max(previous.endTimeMs, segment.endTimeMs),
    };
  }

  return utterances;
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

export function resolveTranscriptSpeakerName(
  segment: TranscriptSegmentDto,
  participants: readonly SpeakerParticipant[],
): string {
  const participantName = participants
    .find((participant) => participant.userId === segment.speakerId)
    ?.displayName.trim();
  if (participantName) return participantName;

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
  if (previous.targetLanguage && next.targetLanguage && previous.targetLanguage !== next.targetLanguage) return false;

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

function appendText(current?: string, incoming?: string): string {
  const left = current?.trim() || "";
  const right = incoming?.trim() || "";
  if (!left) return right;
  if (!right || left === right || left.endsWith(right)) return left;
  if (right.startsWith(left)) return right;
  return `${left} ${right}`;
}
