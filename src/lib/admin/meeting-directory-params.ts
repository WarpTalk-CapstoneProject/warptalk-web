import type { AdminMeetingDirectoryQuery } from "../../types/admin-meeting.ts";

/**
 * The query string `GET /admin/meetings` is sent.
 *
 * WT-693: the page's default tab is "all" and was sent through verbatim as `?status=all`. The
 * service only knew the real statuses plus "live", answered 400 "Unknown status", and the page
 * showed "Meetings could not be loaded" on every visit. "all" is the absence of a filter, so it is
 * sent as no status at all — the backend now also accepts it, but the client must not depend on
 * that to open its own landing view.
 */
export function meetingDirectoryParams(
  query: AdminMeetingDirectoryQuery,
): Omit<AdminMeetingDirectoryQuery, "status"> & { status?: Exclude<AdminMeetingDirectoryQuery["status"], "all"> } {
  const { status, ...rest } = query;
  return status && status !== "all" ? { ...rest, status } : rest;
}
