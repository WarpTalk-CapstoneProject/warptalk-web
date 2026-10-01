/**
 * Bridge claim and the capturer lease: the pure half (W4b part 1, WT-868).
 *
 * THE MODEL (backend BridgeRoomsController / TranslationRoomService.Bridge)
 *   One EXTERNAL_BRIDGE room per Google Meet code per workspace. Every WarpTalk desktop in that
 *   call CLAIMS the code (`POST /translation-rooms/bridge/claim`) and lands in the same room as its
 *   own participant with its own mic. Exactly one of them is the CAPTURER: its desktop publishes
 *   the far side (the "External Meeting" stand-in), everyone else is a MEMBER and publishes only
 *   their own mic. Two capturers would play the far side twice.
 *
 *   The capturer holds a lease it renews by heartbeat every `capturerHeartbeatIntervalSeconds`
 *   (15 s). After `capturerLeaseSeconds` (45 s) without one, any participant may take over
 *   (`POST /{id}/bridge/capturer/takeover`, 409 while a live capturer holds it). Nothing ends when
 *   the capturer leaves — the lease just goes stale.
 *
 * WHO MAY CONTROL THE BRIDGE IN THE POPUP (PO, 2026-10-01)
 *   Start/Stop translation, Pause/Resume transcript and "They speak" are for the room host OR the
 *   capturer; members get none of them. `canControlBridge` is that rule, in one place.
 *
 *   The servers are narrower than the PO rule, and differently so (kept here so the gap is seen):
 *     - /resume, /stop-translation and the transcript pause endpoints check the room HOST
 *       (IsHostedBy) — a capturer who is not the host is refused there;
 *     - SetExternalMeetingLanguage and the bridge token check the AUDIO OWNER (capturer, or the
 *       host for a legacy room with no capturer) — a host who is not the capturer is refused there.
 *   In a claimed room the creator is both host and first capturer, so the two only part after a
 *   takeover. Reported as an open question; the UI follows the PO rule.
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

export type BridgeRole = "capturer" | "member";

export const BRIDGE_ROLE_CAPTURER: BridgeRole = "capturer";
export const BRIDGE_ROLE_MEMBER: BridgeRole = "member";

/** The server's defaults (BridgeRoomConstants), for a response that does not carry them. */
export const DEFAULT_CAPTURER_HEARTBEAT_INTERVAL_SECONDS = 15;
export const DEFAULT_CAPTURER_LEASE_SECONDS = 45;
/** Never heartbeat faster than this, whatever a response says: a 0 must not become a busy loop. */
const MIN_HEARTBEAT_INTERVAL_SECONDS = 5;

export function isBridgeRole(value: unknown): value is BridgeRole {
  return value === "capturer" || value === "member";
}

/** PO rule: the room host or the capturer may drive translation and "They speak"; members may not. */
export function canControlBridge(input: {
  isRoomHost: boolean;
  bridgeRole: BridgeRole | null | undefined;
}): boolean {
  return input.isRoomHost || input.bridgeRole === "capturer";
}

/**
 * This user's role in a bridge room, from what this window knows, best source first:
 *
 *   1. `known` — what the server said to THIS window: the claim, a heartbeat that lost the lease,
 *      a takeover. Newest truth for this desktop.
 *   2. the room's `bridgeCapturerUserId` — a room opened by hand, or a window that never claimed.
 *   3. a legacy room (no capturer at all): the host holds the far side, as the servers do it
 *      (`IsBridgeAudioOwner` falls back to the HOST, never to "anyone").
 *
 * `undefined` capturer means "this server does not send the field" and reads as legacy too.
 */
export function resolveBridgeRole(input: {
  userId: string | null | undefined;
  known?: BridgeRole | null;
  bridgeCapturerUserId?: string | null;
  isLegacyOwner: boolean;
}): BridgeRole {
  if (input.known) return input.known;
  const capturer = input.bridgeCapturerUserId;
  if (typeof capturer === "string" && capturer.length > 0) {
    return input.userId && sameId(capturer, input.userId) ? "capturer" : "member";
  }
  return input.isLegacyOwner ? "capturer" : "member";
}

/**
 * Whether this window should keep renewing the lease: only when the SERVER made it the capturer
 * (claim / takeover / the room record names it). A legacy room has no lease — a heartbeat there is
 * refused with 409, which would wrongly demote the host to member.
 */
export function holdsCapturerLease(input: {
  userId: string | null | undefined;
  known?: BridgeRole | null;
  bridgeCapturerUserId?: string | null;
}): boolean {
  if (input.known) return input.known === "capturer";
  const capturer = input.bridgeCapturerUserId;
  return Boolean(input.userId && typeof capturer === "string" && capturer && sameId(capturer, input.userId));
}

function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// ── claim ───────────────────────────────────────────────────────────────────

export type BridgeClaimRequest = {
  workspaceId: string;
  meetCode: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  externalMeetingLanguage?: string;
  displayName?: string;
};

export type BridgeClaimLease = {
  bridgeRole: BridgeRole;
  created: boolean;
  heartbeatIntervalSeconds: number;
  leaseSeconds: number;
};

/**
 * The lease half of a claim response, validated. The room and participant halves are normalized by
 * the service like every other room read.
 *
 * An unknown `bridgeRole` reads as MEMBER: a member that should have captured leaves the far side
 * silent until someone takes over (visible, recoverable); a capturer that should not have doubles
 * the far side for everyone in the call.
 */
export function parseBridgeClaimLease(raw: unknown): BridgeClaimLease {
  const record = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const role = typeof record.bridgeRole === "string" ? record.bridgeRole.toLowerCase() : "";
  return {
    bridgeRole: isBridgeRole(role) ? role : "member",
    created: record.created === true,
    heartbeatIntervalSeconds: boundedSeconds(
      record.capturerHeartbeatIntervalSeconds,
      DEFAULT_CAPTURER_HEARTBEAT_INTERVAL_SECONDS,
    ),
    leaseSeconds: boundedSeconds(record.capturerLeaseSeconds, DEFAULT_CAPTURER_LEASE_SECONDS),
  };
}

function boundedSeconds(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

// ── heartbeat ───────────────────────────────────────────────────────────────

/**
 * Milliseconds to the next heartbeat. The interval the server named, floored at 5 s, and never more
 * than a third of the lease — three tries before the lease lapses, so one lost request is not the
 * capture handed to somebody else.
 */
export function capturerHeartbeatDelayMs(
  intervalSeconds: number | null | undefined,
  leaseSeconds: number | null | undefined = DEFAULT_CAPTURER_LEASE_SECONDS,
): number {
  const interval = boundedSeconds(intervalSeconds, DEFAULT_CAPTURER_HEARTBEAT_INTERVAL_SECONDS);
  const lease = boundedSeconds(leaseSeconds, DEFAULT_CAPTURER_LEASE_SECONDS);
  const seconds = Math.max(MIN_HEARTBEAT_INTERVAL_SECONDS, Math.min(interval, lease / 3));
  return Math.round(seconds * 1000);
}

/**
 * What one heartbeat's answer means.
 *
 *   renewed  2xx — keep going.
 *   lost     409 CONFLICT — someone else took the capture over. Stop capturing; this desktop is a
 *            member now.
 *   stop     409 INVALID_STATE (the room ended / is not a bridge), 404, 403 — nothing to renew.
 *   retry    anything else (network, 5xx, 503 rate limit) — try again on the next beat; the lease
 *            gives three of them before it lapses.
 */
export type CapturerHeartbeatOutcome = "renewed" | "lost" | "stop" | "retry";

export function capturerHeartbeatOutcome(result: {
  ok: boolean;
  status?: number | null;
  code?: string | number | null;
}): CapturerHeartbeatOutcome {
  if (result.ok) return "renewed";
  const code = typeof result.code === "string" ? result.code.toUpperCase() : null;
  if (result.status === 409) return code === "INVALID_STATE" ? "stop" : "lost";
  if (result.status === 404 || result.status === 403 || result.status === 401) return "stop";
  return "retry";
}

/**
 * What a takeover's answer means: `capturer` on success; `still-live` on 409 CONFLICT (the
 * capturer is still renewing — the server's sentence says so); `refused` otherwise.
 */
export type CapturerTakeoverOutcome = "capturer" | "still-live" | "refused";

export function capturerTakeoverOutcome(result: {
  ok: boolean;
  status?: number | null;
  code?: string | number | null;
}): CapturerTakeoverOutcome {
  if (result.ok) return "capturer";
  const code = typeof result.code === "string" ? result.code.toUpperCase() : null;
  if (result.status === 409 && code !== "INVALID_STATE") return "still-live";
  return "refused";
}

/**
 * Whether the capturer looks gone from where a member sits: the room names a capturer that is
 * somebody else, and that person is not CONNECTED in the participants list. Only a hint for
 * OFFERING the takeover — the server decides, and answers 409 while the lease is still live.
 * Null while either read has not answered: "not known" is not "away".
 */
export function bridgeCapturerAway(input: {
  userId: string | null | undefined;
  bridgeCapturerUserId: string | null | undefined;
  participants: ReadonlyArray<{ userId: string; status: string }> | null | undefined;
}): boolean | null {
  const capturer = input.bridgeCapturerUserId;
  if (!capturer || !input.participants) return null;
  if (input.userId && sameId(capturer, input.userId)) return false;
  const row = input.participants.find((participant) => sameId(participant.userId, capturer));
  return row?.status?.toLowerCase() !== "connected";
}
