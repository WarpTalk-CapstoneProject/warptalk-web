/**
 * Marks on the recording's own scrubber: the moments the summary says are worth going back to.
 *
 * WHY NOT ONE PER TURN
 *   The first version drew one mark per transcript row (`groupSavedTranscriptSegments`, a new row
 *   after 2.5 s of silence). A 37-minute meeting got several hundred dots, none of which said why
 *   that spot mattered, and they piled on top of each other until nothing could be clicked. One per
 *   speaker turn is not much better: three to five people trade the floor every 10–40 s, which is
 *   still 60–200 dots an hour. No meeting-recording product we looked at (Gong, Fathom, Teams,
 *   Grain, Avoma, Loom) marks turns as points; turns become speaker lanes, and points are kept for
 *   a few typed moments.
 *
 * WHAT A MARK IS
 *   One per summary point that carries a moment: a decision, an action item, an open question, a
 *   template's own section (blockers, objections…), or a narrative sentence of the traceable
 *   template. Built from the same points the reading rail draws, so the scrubber and the rail never
 *   describe two different summaries — including a reader's own ready rendering. A meeting is
 *   typically 3–20 marks. A point with no moment gets no mark, and a meeting with no summary gets
 *   none: falling back to per-turn marks would bring back exactly the noise this replaces.
 *
 * WHERE IT SITS
 *   On the transcript row a click would land on, not on the raw `atMs`. The jump
 *   (`jumpToTranscriptMoment`) resolves every moment of a point through `findSegmentAtMs` and seeks
 *   to the EARLIEST of those segments' starts; the mark is placed by the same rule, so a dot and the
 *   place it seeks to cannot disagree. That also absorbs the end-of-meeting summary's coarser time
 *   axis (chunk-granular, measured from the first spoken chunk), which can sit a few seconds off the
 *   stored `startTimeMs`.
 */

import { findSegmentAtMs } from "./meeting-summary.ts";
import { seekTargetSeconds, type SeekSources } from "./recording-seek.ts";

/** What kind of point a mark stands for — decides its colour and the word in its tooltip. */
export type RecordingMarkKind = "decision" | "action" | "question" | "narrative" | "point";

/** One summary point, placed on the recording. */
export interface RecordingMark {
  /** The rail's own key for the point, so a mark and the rail row it came from can be matched. */
  key: string;
  kind: RecordingMarkKind;
  /** The section title as the summary names it ("Decisions", "Blockers"…). */
  section: string;
  /** The point itself, for the tooltip. */
  text: string;
  /** The point's moments on the meeting axis, handed to the jump unchanged — the same call a click
   *  on the rail row makes, so the rail highlight and the transcript scroll match it. */
  atMs: number;
  alsoAtMs: readonly number[];
  /** Where the click will land in the recording FILE, in seconds — the axis `video.currentTime`
   *  and `duration` are on, and the only one a marker on the scrubber may use. */
  seconds: number;
}

/** A summary point as the rail holds it. Only the fields this needs. */
export interface MarkablePoint {
  key: string;
  sectionKey: string;
  section: string;
  text: string;
  atMs: number | null;
  alsoAtMs?: readonly number[];
}

const KIND_BY_SECTION: Record<string, RecordingMarkKind> = {
  decisions: "decision",
  actionItems: "action",
  action_items: "action",
  nextSteps: "action",
  plans: "action",
  openQuestions: "question",
  open_questions: "question",
  questions: "question",
  blockers: "question",
  concerns: "question",
  objections: "question",
  narrative: "narrative",
};

export function markKindForSection(sectionKey: string): RecordingMarkKind {
  return KIND_BY_SECTION[sectionKey] ?? "point";
}

/**
 * One mark per summary point that can actually be found in this recording, in file order.
 *
 * A point is dropped, not clamped to 0 or to the end, when it has no moment, when none of its
 * moments resolves to a transcript row, or when `seekTargetSeconds` cannot place that row — spoken
 * before the host pressed record, after the file stopped, or on a meeting whose two clocks were
 * never aligned (recording-seek.ts). A dot that seeks to the wrong place is worse than no dot.
 */
export function buildSummaryMarks(
  points: readonly MarkablePoint[],
  segments: readonly { startTimeMs?: number | null }[],
  seekSources: SeekSources,
): RecordingMark[] {
  const marks: RecordingMark[] = [];
  for (const point of points) {
    if (point.atMs === null) continue;
    const alsoAtMs = point.alsoAtMs ?? [];

    // The earliest row any of the point's moments lands on — the same rule the jump seeks by.
    let landsAtMs: number | null = null;
    for (const moment of [point.atMs, ...alsoAtMs]) {
      const start = findSegmentAtMs(segments, moment)?.startTimeMs;
      if (typeof start !== "number") continue;
      if (landsAtMs === null || start < landsAtMs) landsAtMs = start;
    }
    if (landsAtMs === null) continue;

    const seconds = seekTargetSeconds(seekSources, landsAtMs);
    if (seconds === null) continue;

    marks.push({
      key: point.key,
      kind: markKindForSection(point.sectionKey),
      section: point.section,
      text: point.text,
      atMs: point.atMs,
      alsoAtMs,
      seconds,
    });
  }
  // Stable: two points on the same row keep the summary's own order inside their cluster.
  return marks.sort((left, right) => left.seconds - right.seconds);
}

/** Marks drawn as one dot because they are too close to tell apart on the bar. */
export interface MarkCluster {
  /** Where the dot sits: the first mark's position, which is where clicking it seeks to. */
  seconds: number;
  marks: RecordingMark[];
}

/** Two marks closer than this share of the recording are drawn as one dot (1.5%: about 8 px on a
 *  550 px bar, and 33 s of a 37-minute meeting). */
export const CLUSTER_FRACTION = 0.015;

/**
 * Folds marks that would overlap into one dot with a count. Nothing is dropped: every point stays
 * reachable from the cluster's tooltip, and from the rail. Greedy from the left, measured from each
 * cluster's FIRST mark so a long run of evenly spaced points cannot chain into one giant cluster.
 * `marks` must be sorted by `seconds` — buildSummaryMarks returns them that way.
 */
export function clusterMarks(
  marks: readonly RecordingMark[],
  durationSeconds: number,
  fraction: number = CLUSTER_FRACTION,
): MarkCluster[] {
  if (!(durationSeconds > 0)) return [];
  const window = durationSeconds * fraction;
  const clusters: MarkCluster[] = [];
  for (const mark of marks) {
    const current = clusters[clusters.length - 1];
    if (current && mark.seconds - current.seconds <= window) {
      current.marks.push(mark);
    } else {
      clusters.push({ seconds: mark.seconds, marks: [mark] });
    }
  }
  return clusters;
}
