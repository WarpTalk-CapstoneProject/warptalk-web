/**
 * How long a failed lookup waits before the same ids may be asked for again.
 *
 * Without it a failure un-marked the ids and the very next render asked again. The members list
 * re-renders constantly, so one failed call became a loop: on 2026-09-24 a release's 500s started
 * it, it spent the account's 180-requests-a-minute budget on POST /presence/query alone, and from
 * then on every 429 was itself a failure that fed the loop - every other API returned 429 too.
 *
 * The lookup has since moved onto the notification hub (QueryPresence), which the HTTP limiter
 * never sees; the Gateway gives it a per-connection budget instead, and a refusal from that is a
 * failure like any other and waits out the same back-off.
 */
export const PRESENCE_RETRY_AFTER_MS = 60_000;

/** Ids that may be requested now: not already requested, and not inside a failure back-off. */
export function presenceIdsToRequest(
  ids: readonly string[],
  requested: ReadonlySet<string>,
  failures: ReadonlyMap<string, number>,
  now: number,
): string[] {
  return ids.filter((id) => {
    if (requested.has(id)) return false;
    const failed = failures.get(id);
    return failed === undefined || now - failed >= PRESENCE_RETRY_AFTER_MS;
  });
}
