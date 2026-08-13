import { useQuery } from "@tanstack/react-query";

import { myMeetingsService } from "@/services/my-meetings.service";

/**
 * WT-333 — one month of the caller's personal timeline.
 *
 * Keyed by month, not by page. The agenda scrolls both ways from today, so a page number cannot
 * describe what is on screen; a month can, and it keeps every window the user has already scrolled
 * through cached under its own key instead of being refetched on the way back.
 *
 * `monthAnchor` is normalised to the first of its month before it reaches the key, so two dates in
 * the same month share one cache entry rather than one per day the user happens to click.
 */
export function useMyMeetings(
  workspaceId: string | null,
  monthAnchor: Date,
  search?: string,
) {
  const from = startOfMonth(monthAnchor);
  const to = endOfMonth(monthAnchor);
  const normalizedSearch = search?.trim() ?? "";

  return useQuery({
    // workspaceId first, matching the room-history key: one workspace's meetings can never be
    // served out of another's cache entry.
    queryKey: ["my-meetings", workspaceId, monthKey(from), normalizedSearch] as const,
    queryFn: () =>
      myMeetingsService.listMyMeetings({
        workspaceId: workspaceId!,
        from,
        to,
        search: normalizedSearch || undefined,
      }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Local-time month bounds, deliberately. The server filters on an instant, but the user is asking
 * about a month on their own wall clock — deriving these in UTC would push a meeting late on the
 * 31st into the next month for anyone east of Greenwich.
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
