import type { ResolvedInsightsPeriod } from "@/lib/admin/insights-period";

/**
 * One data source of the workspace Insights page. A tab never sees a rejected promise: a source
 * that cannot be read is `unavailable` (drawn as "not available", never as a 0) and one that is
 * still being fetched is `loading`. `refreshing` marks a re-read behind data already on screen.
 */
export type InsightsSourceState<T> =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; data: T; refreshing?: boolean };

export type InsightsTab = "overview" | "usage" | "tools";

/** What the page hands every tab, so the tabs read the same period in the same time zone. */
export interface InsightsTabProps {
  workspaceId: string;
  workspaceSlug: string;
  period: ResolvedInsightsPeriod;
  timeZone: string;
  /** Epoch ms of the newest successful read; 0 before the first. */
  updatedAt: number;
}
