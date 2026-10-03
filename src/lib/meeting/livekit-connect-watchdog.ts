/**
 * What the meeting does when its LiveKit connection does not arrive, and what it tells the server.
 *
 * Room 01a100d8, 3 Oct 2026. Tuấn held a valid token for 43 seconds and LiveKit never saw him join;
 * Kỳ, joining 24 seconds later, was in within two. Every cause the server owns was ruled out, and
 * the one that remained — the browser's own `room.connect` — was unreadable, because a failed
 * connect only ever reached his screen. He reloaded, which is what fixed it, and the evidence went
 * with the tab. Two things follow, and this file holds the rules for both:
 *
 *   1. REPORT. connect errors, a connect still pending after CONNECT_SLOW_MS, every automatic
 *      retry, the connect that finally lands (with how long it took), and unexpected disconnects
 *      go to meeting-service's log (POST .../client-events).
 *
 *   2. RECOVER, the way the reload did: drop the session, take a fresh token, connect again —
 *      automatically, instead of leaving somebody talking into a meeting that cannot hear them.
 *
 * BOUNDED, BECAUSE RETRIES IN THIS PRODUCT HAVE STORMED BEFORE. Retrying a 429 tripled the storm it
 * was meant to ride out, and a page-reload loop logged a whole team out. So: at most
 * MAX_AUTO_CONNECT_RETRIES per mounted meeting, never a page reload, and never for a session that
 * was displaced by the same account on another device — reconnecting there evicts the other one.
 */

export const CONNECT_SLOW_MS = 10_000;
/** A connect that FAILED (rather than hanging) is retried sooner than one that is merely slow. */
export const CONNECT_RETRY_AFTER_ERROR_MS = 1_500;
export const MAX_AUTO_CONNECT_RETRIES = 2;
const MAX_TEXT = 300;

/** LiveKit's DisconnectReason.CLIENT_INITIATED — we left on purpose; nothing to report. */
const CLIENT_INITIATED = 1;

export type MeetingClientEventKind =
  | "connect_error"
  | "connect_slow"
  | "connect_retry"
  | "connected"
  | "disconnected";

export type MeetingClientEvent = {
  kind: MeetingClientEventKind;
  code?: string | null;
  message?: string | null;
  elapsedMs?: number | null;
  attempt?: number | null;
  userAgent?: string | null;
};

export function canAutoRetryConnect({
  autoRetries,
  displaced,
}: {
  autoRetries: number;
  displaced: boolean;
}): boolean {
  return !displaced && autoRetries < MAX_AUTO_CONNECT_RETRIES;
}

/** A short machine-readable name for a LiveKit connect failure, or null. */
export function connectFailureCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { reasonName?: unknown; reason?: unknown; name?: unknown };
  if (typeof candidate.reasonName === "string" && candidate.reasonName) return candidate.reasonName;
  if (typeof candidate.reason === "number") return `reason_${candidate.reason}`;
  if (typeof candidate.name === "string" && candidate.name) return candidate.name;
  return null;
}

export function boundedText(value: unknown): string | null {
  const text =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : value == null
          ? ""
          : String(value);
  if (!text) return null;
  return text.length <= MAX_TEXT ? text : text.slice(0, MAX_TEXT);
}

export function shouldReportDisconnect(reason: unknown): boolean {
  return reason !== CLIENT_INITIATED;
}
