/**
 * How an announcement's delivery status is drawn on the admin pages.
 *
 * WT-699 TC4101: the list painted every non-draft row green, so a Failed announcement looked
 * exactly like a delivered one. Status is written by the notification service (backend#406):
 * `Pending` until every chunk is counted, then `Sent`, or `Failed` if any chunk dead-lettered —
 * Failed wins, so a partial delivery is Failed. Only `Sent` is a success.
 *
 * Pure and relative-import-only so the node test runner covers it; the list and the detail page
 * share it so the two cannot disagree about a colour again.
 */

export type AnnouncementStatusTone = "sent" | "failed" | "pending" | "draft" | "unknown";

export function announcementStatusTone(status: string | null | undefined): AnnouncementStatusTone {
  switch ((status ?? "").trim().toLowerCase()) {
    case "sent":
    case "delivered":
      return "sent";
    case "failed":
    case "error":
      return "failed";
    case "pending":
    case "sending":
    case "queued":
    case "processing":
      return "pending";
    case "draft":
      return "draft";
    default:
      return "unknown";
  }
}

/** Badge classes per tone. `destructive` is a registered @theme token, so its utilities exist. */
export const ANNOUNCEMENT_STATUS_CLASSES: Record<AnnouncementStatusTone, string> = {
  sent: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  draft: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  unknown: "border-border bg-surface-2 text-ink-muted",
};

export function announcementStatusClasses(status: string | null | undefined): string {
  return ANNOUNCEMENT_STATUS_CLASSES[announcementStatusTone(status)];
}

/**
 * The delivered count when the server reported one. Older notification builds omit both fields,
 * and "0 delivered" there would be a claim nobody made — so absent stays absent.
 */
export function announcementDeliveredCount(
  announcement: { deliveredCount?: number | null },
): number | null {
  const count = announcement.deliveredCount;
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : null;
}
