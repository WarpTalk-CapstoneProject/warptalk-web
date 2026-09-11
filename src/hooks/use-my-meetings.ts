import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import {
  endOfMonth,
  monthKey,
  monthsSpanning,
  startOfMonth,
} from "@/lib/meeting/meeting-day";
import { myMeetingsService } from "@/services/my-meetings.service";

export { endOfMonth, monthsSpanning, startOfMonth };

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
 * The caller's meetings between two instants, however many months that crosses.
 *
 * NOT `useMyMeetingsInRange` any more, and the rename is about the hook's job, not about the data:
 * what sets it apart is that it takes a from/to range and stitches months together, where
 * `useMyMeetings` above serves exactly one month.
 *
 * The data behind it IS personal, and that is a real difference from the Meetings page — do not
 * read the two as the same list in different shapes. Both go through BuildListableRoomsQueryAsync,
 * but `GET /translation-rooms/my-meetings` pins RoomTimelineScope.Mine (WT-333, FR-333-005): the
 * caller's own rooms only — hosted, joined, or invited to. The Meetings page's
 * `GET /translation-rooms` runs at scope Workspace, where a workspace Owner/Admin is widened to
 * EVERY room in the workspace. The two lists agree only for a plain member, who falls through to
 * BuildAccessibleRoomsQuery either way.
 *
 * The query KEY still says "my-meetings", deliberately: it is shared with `useMyMeetings` so the
 * two views reuse one another's months, and renaming it would split that cache in half. Same for
 * the service and the endpoint behind it — those are the API's own name, not this hook's.
 *
 * Still fetched and cached BY MONTH — one request and one cache entry per month, exactly as
 * `useMyMeetings` does — and merged here. Switching to arbitrary from/to keys would have been
 * less code and worse: a week key and a month key covering the same days are two entries holding
 * the same rows, so every switch between the two views refetches data already in memory, and
 * scrolling back through weeks would re-request each one.
 *
 * Rows are de-duplicated by id, because a meeting near a boundary is returned by both of its
 * months' queries.
 */
export function useMeetingsInRange(
  workspaceId: string | null,
  from: Date,
  to: Date,
  search?: string,
) {
  const normalizedSearch = search?.trim() ?? "";
  const months = useMemo(() => monthsSpanning(from, to), [from, to]);

  const results = useQueries({
    queries: months.map((month) => ({
      queryKey: ["my-meetings", workspaceId, monthKey(month), normalizedSearch] as const,
      queryFn: () =>
        myMeetingsService.listMyMeetings({
          workspaceId: workspaceId!,
          from: startOfMonth(month),
          to: endOfMonth(month),
          search: normalizedSearch || undefined,
        }),
      enabled: Boolean(workspaceId),
    })),
  });

  return useMemo(() => {
    const seen = new Set<string>();
    const meetings = results
      .flatMap((result) => result.data?.meetings ?? [])
      .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));

    return {
      data: results.some((result) => result.data)
        ? {
            meetings,
            // Summed, not counted. Each month's total is how many that month HAS on the server,
            // which may exceed how many it returned — that difference is the only thing telling
            // the page its list is truncated. The windows are disjoint by construction, so adding
            // them is sound.
            total: results.reduce((sum, result) => sum + (result.data?.total ?? 0), 0),
          }
        : undefined,
      isLoading: results.some((result) => result.isLoading),
      isError: results.some((result) => result.isError),
      // One month failing must not present a half-range as if it were whole.
      isPartial: results.some((result) => result.isError) && meetings.length > 0,
      // Refetches every month the range touches, not just the one that failed: the caller asking
      // to retry is asking for the range it can see.
      refetch: () => Promise.all(results.map((result) => result.refetch())),
    };
  }, [results]);
}
