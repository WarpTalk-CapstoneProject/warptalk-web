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
 * Two retries, front-loaded — for the failures a retry can actually fix.
 *
 * ROUND 2. These delays were chosen against a 60s window, with the note that "waiting a full
 * minute is worse than useless here". That reasoning was right about the wait and wrong about
 * what follows from it: if the window is 60s and we will not wait 60s, then re-sending at 1.5s
 * and 5s cannot succeed either. It made every refused sign-out into three refused sign-outs.
 *
 * Production, 15 Aug, three hours: 289 refused logouts, zero accepted. Roughly a third of that
 * volume was this schedule re-sending into a window it had been told was closed.
 *
 * The delays stay, because they still fit a 503 or a dropped connection. 429 is what changed —
 * see isRetryableRevokeFailure.
 */
export const REVOKE_RETRY_DELAYS_MS = [1_500, 5_000];

/**
 * Whether re-sending this sign-out could plausibly succeed.
 *
 * 5xx is our own fault and says nothing about the session. A missing response means the request
 * may never have left the browser. Both are worth another attempt.
 *
 * 429 is NOT, and used to be. It was the original reason this file existed, which is what made
 * the mistake easy: a sign-out refused for rate is a sign-out that never revoked anything, so
 * re-sending felt like the fix. It is the opposite. The gateway answers 429 with Retry-After: 60
 * and we re-send at 1.5s and 5s — twice inside a window we have been told is shut, spending
 * nothing but log lines and the user's battery. The repo already had this written down, in
 * retry-policy.ts: "A client error (4xx) is never retried — including 429, where retrying is
 * precisely the behaviour the server is asking us to stop." This file was the exception, and
 * the exception was wrong.
 *
 * What actually keeps a sign-out from being refused is the gateway's session-recovery budget
 * (WT-405 round 1), not this. When that budget IS exhausted, the honest move is to record it —
 * revokeSessionOnServer writes sign-out-revoke-failed(429) — not to add two more refusals to
 * whatever is already exhausting it.
 *
 * Every other 4xx is the server having looked at this and refused: an expired access token, a
 * family already revoked, a request it will not accept.
 */
export function isRetryableRevokeFailure(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null | undefined)
    ?.response?.status;
  if (typeof status !== "number") return true;
  return status >= 500;
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

/**
 * How long the same session's revoke stays deduplicated.
 *
 * 60s because that is the gateway's own window: within it, a second attempt for the same
 * credential is refused anyway, so suppressing it costs nothing that was going to work.
 */
export const REVOKE_DEDUPE_WINDOW_MS = 60_000;

let lastRevokeKey: string | null = null;
let lastRevokeAt = 0;

/**
 * Whether this sign-out is a genuinely new one, or the same one arriving again.
 *
 * ROUND 2, and the part that bounds the storm rather than explaining it. Production showed
 * logout POSTs from one address 200–340ms apart, 117 in a single minute — far too fast to be
 * the retry schedule above and far too fast to be a person clicking. Something re-enters
 * logout() in a loop.
 *
 * endDeadSession() is latched against exactly this, but the latch only guards ITS door.
 * logout() has six other callers, and the store's own cross-tab guard already states the
 * principle the single-tab path was missing: "re-posting the same spent credential from every
 * open tab would achieve nothing but noise." A spent credential is spent whichever door it
 * arrives through.
 *
 * So this is keyed on the credential, not on a call count: a real second sign-out — sign in as
 * somebody else, sign out again — carries a different token and passes. Only the same session
 * asking twice is dropped. A caller looping 200ms apart therefore produces one POST, and the
 * loop itself stays visible in the breadcrumb rather than in the gateway's rate limiter.
 *
 * This is containment and not a diagnosis. The loop is still there; it now costs one request.
 * ResolvePartitionKey (gateway, same ticket) is what will name it next time.
 */
export function shouldSendRevoke(
  accessToken: string | null,
  now: number = Date.now(),
): boolean {
  // A tokenless sign-out relies on the cookie, and every one of them looks alike, so they
  // share a key deliberately — the looping caller is the case that key exists for.
  const key = accessToken ?? "cookie-only";

  if (key === lastRevokeKey && now - lastRevokeAt < REVOKE_DEDUPE_WINDOW_MS) {
    return false;
  }

  lastRevokeKey = key;
  lastRevokeAt = now;
  return true;
}

/**
 * Forget the last revoke, so the next session can always sign itself out.
 *
 * Called on sign-in. Without it, signing in and straight back out inside a minute on a
 * cookie-only session would be swallowed by the dedupe above — the failure mode this whole
 * ticket is about, reintroduced by its own fix.
 */
export function resetRevokeDedupe(): void {
  lastRevokeKey = null;
  lastRevokeAt = 0;
}
