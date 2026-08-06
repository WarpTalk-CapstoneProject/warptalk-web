/**
 * What is worth trying again, and how long to wait before doing so.
 *
 * The rule that matters in production: a 4xx is the server stating the request is wrong, and
 * repeating it verbatim cannot change the answer. An expired session turns every query on the
 * page into a 401, and retrying those is what turned one dead token into a request storm large
 * enough to trip the gateway's 100 req/min/IP limiter — which then returned 429 and 503 to
 * everyone, including users whose sessions were perfectly fine.
 */

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

/** HTTP status of a failed request, or null for a transport/network failure that never got one. */
export function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const response = (error as { response?: { status?: unknown } }).response;
  const status = response?.status;

  return typeof status === "number" ? status : null;
}

/**
 * A client error (4xx) is never retried — including 429, where retrying is precisely the
 * behaviour the server is asking us to stop. Backing off entirely is the only response that
 * cannot make throttling worse.
 */
export function isNonRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === null) return false;

  return status >= 400 && status < 500;
}

/** Exponential backoff, capped, for failures that genuinely may succeed later (network, 5xx). */
export function getRetryDelayMs(attemptIndex: number): number {
  const exponential = BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptIndex);
  return Math.min(exponential, MAX_RETRY_DELAY_MS);
}

/** Bounded retry: transient failures get a couple of attempts, 4xx gets none. */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (isNonRetryableError(error)) return false;
  return failureCount < MAX_RETRIES;
}
