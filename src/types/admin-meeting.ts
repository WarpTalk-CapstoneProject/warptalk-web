/**
 * Contracts for the system-admin meeting counts (`~/api/v1/admin/meetings/counts`), read by the
 * Insights page's "Live meetings" card.
 *
 * The platform meeting directory that used to share this file (`/admin/meetings`) was taken out of
 * the portal on 2026-09-24; its backend endpoint is untouched, only the web page and its client
 * went.
 */

/** Read at one instant server-side, so the two cannot disagree the way two requests would. */
export interface AdminMeetingCountsDto {
  liveNow: number;
  startedToday: number;
}
