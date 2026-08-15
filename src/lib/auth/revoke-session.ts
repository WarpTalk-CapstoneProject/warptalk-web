/**
 * Re-sending a sign-out the server refused.
 *
 * WT-405. `POST /auth/logout` carries no identity the gateway can partition on — the access
 * token being handed over is the one the browser is in the middle of discarding — so it lands
 * in the shared per-address budget alongside every other tokenless request. On 15 Aug a
 * sign-out was answered 429 there. The request never reached the auth service, so the session
 * cookies were never cleared and the refresh-token family was never revoked, while this side
 * had already torn its own session down and reported success. Signed out in the tab, signed in
 * on the server, for the refresh token's remaining seven days.
 *
 * The gateway fix gives those two endpoints their own budget. This is the other half: a
 * sign-out that gets refused anyway should try again rather than evaporate.
 *
 * Deliberately not a general-purpose retry helper. The caller does not await this — a sign-out
 * must never wait on the network — so the only thing the schedule can cost is a little
 * background time on a page that is on its way to /login.
 */

/**
 * Two retries, front-loaded. The gateway's window is 60s and its Retry-After says so, but
 * waiting a full minute is worse than useless here: the page will have navigated. These cover
 * the case that actually recovers — a momentary spill that drains in a few seconds — and give
 * up honestly rather than pretending.
 */
export const REVOKE_RETRY_DELAYS_MS = [1_500, 5_000];

/**
 * Whether re-sending this sign-out could plausibly succeed.
 *
 * 429 is the whole reason this exists. 5xx is our own fault and says nothing about the
 * session. A missing response means the request may never have left the browser.
 *
 * Every other 4xx is the server having looked at this and refused — an access token that has
 * already expired, a family already revoked, a request it will not accept. Re-sending those
 * spends permits from the very budget whose exhaustion is the problem, so they stop here.
 */
export function isRetryableRevokeFailure(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null | undefined)
    ?.response?.status;
  if (typeof status !== "number") return true;
  return status === 429 || status >= 500;
}

/** The HTTP status a failed revoke came back with, for the teardown breadcrumb. */
export function describeRevokeFailure(error: unknown): string {
  const status = (error as { response?: { status?: unknown } } | null | undefined)
    ?.response?.status;
  return typeof status === "number" ? String(status) : "no-response";
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Send a sign-out, re-sending it if the refusal was the kind that passes.
 *
 * Resolves true when the server accepted it, false when it did not — the caller records that,
 * so "the server still thinks this session is alive" becomes a readable fact afterwards rather
 * than something that has to be reconstructed from gateway logs.
 *
 * `delays` and `wait` are seams for the tests: real timers would make this suite take seven
 * seconds to assert something that has nothing to do with wall-clock time.
 */
export async function revokeWithRetry(
  send: () => Promise<unknown>,
  {
    delays = REVOKE_RETRY_DELAYS_MS,
    wait = sleep,
  }: { delays?: readonly number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<{ revoked: boolean; attempts: number; lastFailure?: string }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await send();
      return { revoked: true, attempts: attempt + 1 };
    } catch (error) {
      if (attempt >= delays.length || !isRetryableRevokeFailure(error)) {
        return {
          revoked: false,
          attempts: attempt + 1,
          lastFailure: describeRevokeFailure(error),
        };
      }
      await wait(delays[attempt]);
    }
  }
}
