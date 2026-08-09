/**
 * Reading an AI meeting summary, whatever shape it arrived in.
 *
 * The assistant now emits a summary whose shape comes from a template — a standup and an
 * interview no longer get the same sections — and every item carries `atMs`, the moment in
 * the meeting it came from, so the reader can jump to the transcript and check it.
 *
 * Old summaries are still in production storage in the previous shape: `decisions` as bare
 * strings, `actionItems` as `{owner, task}`, no citations, no template. Those must keep
 * rendering. A migration cannot fix them — the citation was never recorded, so there is
 * nothing to backfill — which means both shapes have to be readable indefinitely.
 *
 * Pure so the parsing can be tested without a meeting; the node test runner strips types but
 * cannot parse JSX, so this cannot live in the panel that renders it.
 */

export type MeetingSummaryItem = {
  text: string;
  /** Present on action items only. */
  owner?: string;
  /** Milliseconds from the start of the meeting, or null for a summary written before
   *  citations existed. A null renders as text with nothing to click. */
  atMs: number | null;
};

export type MeetingSummarySectionView = {
  key: string;
  title: string;
  items: MeetingSummaryItem[];
};

/** Titles for the sections the templates produce. */
const SECTION_TITLES: Record<string, string> = {
  decisions: "Decisions",
  actionItems: "Action items",
  openQuestions: "Open questions",
  progress: "Progress",
  plans: "Plans",
  blockers: "Blockers",
  background: "Background",
  strengths: "Strengths",
  concerns: "Concerns",
  shown: "What was shown",
  reactions: "Reactions",
  objections: "Objections",
  problems: "Problems raised",
  options: "Options considered",
};

/**
 * A key with no entry above still gets a readable heading rather than a raw camelCase
 * token. The templates live in the AI service, so this map WILL fall behind one day; when it
 * does, a new section should look slightly plain, not broken.
 */
export function sectionTitle(key: string): string {
  if (SECTION_TITLES[key]) return SECTION_TITLES[key];
  // Sentence case, matching the titles above ("Open questions", not "Open Questions").
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Keys that are not sections of the summary body. */
const NON_SECTION_KEYS = new Set([
  "summary",
  "citations",
  "templateKey",
  "insufficientData",
  "translations",
]);

function toMs(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function toItem(raw: unknown): MeetingSummaryItem | null {
  // The pre-template shape: a decision was just a string.
  if (typeof raw === "string") {
    const text = raw.trim();
    return text ? { text, atMs: null } : null;
  }
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  // `task` is the action-item spelling; `text` is every other section's.
  const text = String(row.text ?? row.task ?? "").trim();
  if (!text) return null;

  const owner = typeof row.owner === "string" ? row.owner.trim() : "";
  return { text, ...(owner ? { owner } : {}), atMs: toMs(row.atMs) };
}

export function parseSummarySections(
  parsed: Record<string, unknown>,
): MeetingSummarySectionView[] {
  const sections: MeetingSummarySectionView[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (NON_SECTION_KEYS.has(key) || !Array.isArray(value)) continue;
    const items = value.map(toItem).filter((item): item is MeetingSummaryItem => item !== null);
    // An empty section is dropped rather than rendered as a heading over nothing. The
    // template declares every section it could produce, so most meetings leave some empty.
    if (items.length > 0) sections.push({ key, title: sectionTitle(key), items });
  }

  return sections;
}

/**
 * The transcript segment a citation points at.
 *
 * Nearest-at-or-before, not nearest-overall: a citation marks where a point was made, and
 * the sentence that made it started at or before that moment. Jumping forward to a later
 * segment would land the reader after the evidence they came to check.
 *
 * Falls back to the first segment starting after the citation when every segment is later —
 * which happens when the summary cites a moment the stored transcript trimmed away.
 */
export function findSegmentAtMs<T extends { startTimeMs?: number | null }>(
  segments: readonly T[],
  atMs: number | null,
): T | null {
  if (atMs === null || segments.length === 0) return null;

  let best: T | null = null;
  let bestStart = -1;
  let firstAfter: T | null = null;
  let firstAfterStart = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const start = typeof segment.startTimeMs === "number" ? segment.startTimeMs : null;
    if (start === null) continue;

    if (start <= atMs && start > bestStart) {
      best = segment;
      bestStart = start;
    } else if (start > atMs && start < firstAfterStart) {
      firstAfter = segment;
      firstAfterStart = start;
    }
  }

  return best ?? firstAfter;
}

/** A citation's moment as mm:ss, for the label on the control that jumps to it. */
export function formatCitationTime(atMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(atMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
