import type { TranscriptSegmentDto } from "@/types/realtime";

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

export function groupTranscriptSegments(segments: TranscriptSegmentDto[]): TranscriptSegmentDto[] {
  const utterances: TranscriptSegmentDto[] = [];

  for (const segment of segments) {
    const previous = utterances[utterances.length - 1];
    if (!previous || !belongsToSameUtterance(previous, segment)) {
      utterances.push({ ...segment });
      continue;
    }

    utterances[utterances.length - 1] = {
      ...previous,
      originalText: appendText(previous.originalText, segment.originalText),
      translatedText: appendText(previous.translatedText, segment.translatedText) || undefined,
      confidence: Math.min(previous.confidence, segment.confidence),
      endTimeMs: Math.max(previous.endTimeMs, segment.endTimeMs),
    };
  }

  return utterances;
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

function appendText(current?: string, incoming?: string): string {
  const left = current?.trim() || "";
  const right = incoming?.trim() || "";
  if (!left) return right;
  if (!right || left === right || left.endsWith(right)) return left;
  if (right.startsWith(left)) return right;
  return `${left} ${right}`;
}
