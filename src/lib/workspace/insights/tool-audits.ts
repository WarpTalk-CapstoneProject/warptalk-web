/**
 * WarpBot tool calls, counted over a period from the workspace plugin audit log. WT-878.
 *
 * THE LOG HAS NO TOTAL AND NO DATE FILTER
 *   `GET /assistant/workspaces/plugin-tool-audits` answers a plain list, newest first, by skip and
 *   take. So "calls this month" is not something the server can be asked; it is something the page
 *   reads its way to — page after page until a row older than the window turns up (or the log ends)
 *   — and then counts. The old plugin-activity dashboard counted `rows.length` of ONE 50-row page
 *   and labelled it "this month", so the figure changed when the reader pressed Next.
 *
 * A CAP IS A FLOOR, NOT A TOTAL
 *   Reading is capped (a busy workspace must not cost the gateway forty requests a minute). When the
 *   cap stops the reading before the window's start, what was read is the NEWEST part of the window,
 *   and every count here says so: `complete: false`, shown as "at least N". Nothing is scaled up to
 *   guess the rest.
 *
 * Pure and free of `@/` imports so `node --test` loads it. Shared by the Overview and Tools tabs.
 */

import type { WorkspacePluginToolAuditDto } from "../../../types/assistant.ts";
import { describePluginActivityOutcome } from "../../assistant/plugin-activity.ts";

export type ToolOutcomeKind =
  | "succeeded"
  | "blocked"
  | "needsSetup"
  | "awaitingConfirmation"
  | "failed";

/** What an Owner does about a call, from its result status. Provider errors count as failed. */
export function toolOutcomeKind(resultStatus: string | null | undefined): ToolOutcomeKind {
  const outcome = describePluginActivityOutcome(resultStatus ?? "");
  switch (outcome.tone) {
    case "success":
      return "succeeded";
    case "blocked":
      return "blocked";
    case "attention":
      return outcome.code === "confirmation_required" ? "awaitingConfirmation" : "needsSetup";
    default:
      return "failed";
  }
}

/** Rows per request while reading the log. The plugin-activity page's page size. */
export const AUDIT_PAGE_SIZE = 50;

/** Requests per read at most: 2,000 rows. Past it, counts are floors. */
export const AUDIT_MAX_PAGES = 40;

function timeOf(iso: string | null | undefined): number {
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * Whether to read another page. The log is newest first, so once a page holds a row older than
 * `stopBeforeMs` everything the window needs has been read; a short page means the log ended.
 */
export function shouldReadNextAuditPage(
  page: readonly Pick<WorkspacePluginToolAuditDto, "createdAt">[],
  take: number,
  stopBeforeMs: number,
): boolean {
  if (page.length < take || page.length === 0) return false;
  const oldest = timeOf(page[page.length - 1].createdAt);
  // An unparseable timestamp cannot prove the window is covered; keep reading (the cap still holds).
  return !(oldest < stopBeforeMs);
}

export interface AuditRead {
  /** Newest first, as the server sent them. */
  rows: WorkspacePluginToolAuditDto[];
  /** True when the log ran out: every row that exists was read. */
  reachedEnd: boolean;
}

/**
 * The earliest instant from which the read is known to hold EVERY call. The whole log when it ran
 * out; otherwise the oldest row read (older calls may exist beyond the cap).
 */
export function auditCoveredSince(read: AuditRead): number {
  if (read.reachedEnd) return Number.NEGATIVE_INFINITY;
  const times = read.rows.map((row) => timeOf(row.createdAt)).filter((ms) => Number.isFinite(ms));
  return times.length ? Math.min(...times) : Number.POSITIVE_INFINITY;
}

export interface ToolRange {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

export interface ToolPluginCount {
  pluginKey: string;
  calls: number;
}

export interface ToolCallSummary {
  /** Calls read inside the window. A floor when `complete` is false. */
  calls: number;
  succeeded: number;
  blocked: number;
  needsSetup: number;
  awaitingConfirmation: number;
  failed: number;
  /** Percent of the calls read that succeeded; null with no calls. */
  successRate: number | null;
  /** False when the read stopped before the window's start. */
  complete: boolean;
  byPlugin: ToolPluginCount[];
  /** Plugins with at least one needs-setup call in the window, most affected first. */
  needsSetupPlugins: string[];
}

/** Counts the calls of `range` from a read of the log. */
export function summariseToolCalls(read: AuditRead, range: ToolRange): ToolCallSummary {
  const from = range.from.getTime();
  const to = range.to.getTime();
  const coveredSince = auditCoveredSince(read);

  const summary: ToolCallSummary = {
    calls: 0,
    succeeded: 0,
    blocked: 0,
    needsSetup: 0,
    awaitingConfirmation: 0,
    failed: 0,
    successRate: null,
    complete: coveredSince <= from,
    byPlugin: [],
    needsSetupPlugins: [],
  };

  const plugins = new Map<string, number>();
  const setup = new Map<string, number>();
  for (const row of read.rows) {
    const at = timeOf(row.createdAt);
    if (!(at >= from && at < to)) continue;
    summary.calls += 1;
    plugins.set(row.pluginKey, (plugins.get(row.pluginKey) ?? 0) + 1);
    const kind = toolOutcomeKind(row.resultStatus);
    summary[kind] += 1;
    if (kind === "needsSetup") setup.set(row.pluginKey, (setup.get(row.pluginKey) ?? 0) + 1);
  }

  summary.successRate = summary.calls > 0 ? (summary.succeeded / summary.calls) * 100 : null;
  summary.byPlugin = [...plugins.entries()]
    .map(([pluginKey, calls]) => ({ pluginKey, calls }))
    .sort((a, b) => b.calls - a.calls || a.pluginKey.localeCompare(b.pluginKey));
  summary.needsSetupPlugins = [...setup.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
  return summary;
}

/** The newest call in the whole read, whatever the window: "last call 4 min ago". */
export function lastToolCallAt(read: AuditRead): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const row of read.rows) {
    const at = timeOf(row.createdAt);
    if (at > bestMs) {
      bestMs = at;
      best = row.createdAt;
    }
  }
  return best;
}

export type ToolLineStatus = "needsAttention" | "healthy" | "noCalls";

/**
 * The one word in front of the WarpBot tools line. Amber when anything needs setup — that is the
 * one outcome an Owner fixes (reconnect, grant a scope); policy blocks are the workspace's own rule
 * working as intended and do not colour the line.
 */
export function toolLineStatus(summary: Pick<ToolCallSummary, "calls" | "needsSetup">): ToolLineStatus {
  if (summary.needsSetup > 0) return "needsAttention";
  return summary.calls > 0 ? "healthy" : "noCalls";
}
