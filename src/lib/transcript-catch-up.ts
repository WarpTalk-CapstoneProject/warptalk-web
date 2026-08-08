import type { TranscriptSegmentDto as LiveSegment } from "@/types/realtime";
import type { TranscriptSegmentDto as SavedSegment } from "@/types/transcript";

/**
 * What someone who joined late should be able to read.
 *
 * The live transcript panel renders whatever has arrived over SignalR since this browser
 * connected, so a person who joins twenty minutes in sees an empty panel and no indication
 * that twenty minutes happened. The segments are not lost — TranscriptService has them, and
 * the room detail page already reads them — they were simply never handed to the live panel.
 *
 * The two sources describe the same thing in different shapes, which is the part worth being
 * careful about: saved segments key on `id` and carry `sequenceOrder`, live ones key on
 * `segmentId` and carry the translation inline. Merging them by the wrong key silently
 * duplicates every line that is in both.
 */

/** Saved segments in the shape the live panel renders. */
export function toLiveSegment(saved: SavedSegment): LiveSegment {
  return {
    segmentId: saved.id,
    speakerId: saved.speakerParticipantId ?? "",
    speakerName: saved.speakerName,
    originalText: saved.originalText,
    originalLanguage: saved.originalLanguage,
    // Deliberately absent. Translations for saved segments live behind their own endpoint, and
    // inventing an empty string here would render a blank translation line under every
    // backfilled utterance rather than none at all.
    confidence: saved.confidence ?? 1,
    startTimeMs: saved.startTimeMs,
    endTimeMs: saved.endTimeMs,
  };
}

export type CatchUpTranscript = {
  /** Everything to render, oldest first: what was missed, then what has arrived live. */
  segments: LiveSegment[];
  /** How many lines predate this browser's connection — 0 for someone who was here already. */
  missedCount: number;
  /** segmentId of the first live line, so the UI can mark where this person came in. */
  joinedAtSegmentId: string | null;
};

/**
 * Saved history in front of the live stream, without duplicating the overlap.
 *
 * The live copy wins on conflict: it is the one that may already carry a translation, and for
 * a segment corrected mid-meeting it is the more recent text.
 */
export function buildCatchUpTranscript(
  saved: SavedSegment[],
  live: LiveSegment[],
): CatchUpTranscript {
  const liveIds = new Set(live.map((segment) => segment.segmentId));

  const missed = [...saved]
    .sort((left, right) => left.sequenceOrder - right.sequenceOrder)
    .filter((segment) => !liveIds.has(segment.id))
    .map(toLiveSegment);

  return {
    segments: [...missed, ...live],
    missedCount: missed.length,
    joinedAtSegmentId: live[0]?.segmentId ?? null,
  };
}

/**
 * The transcript a catch-up summary should be written from.
 *
 * Only what the person missed: asking for a summary of the whole meeting would repeat back
 * the part they have been present for, which is the part they least need told.
 */
export function catchUpSourceText(catchUp: CatchUpTranscript): string {
  return catchUp.segments
    .slice(0, catchUp.missedCount)
    .map((segment) => `${segment.speakerName}: ${segment.originalText}`)
    .join("\n");
}
