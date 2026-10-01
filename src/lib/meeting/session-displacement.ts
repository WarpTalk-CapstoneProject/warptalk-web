/**
 * "This account is already in this meeting somewhere else" — recognising it, so it is never
 * mistaken for a network failure.
 *
 * WHY THIS EXISTS
 *   Demo accounts are shared, so the same account regularly sits in one meeting from two devices or
 *   two tabs. Both servers allow exactly one of those:
 *
 *     - LiveKit allows one connection per identity. The newer join evicts the older one with
 *       `DisconnectReason.DUPLICATE_IDENTITY`.
 *     - TranslationRoomHub (gateway, BR-159-014) allows one connection per (room, user) and sends
 *       the older one `ForceDisconnected("You have joined from another device.")`.
 *
 *   The evicted tab never stopped. `useLiveKitRoom` re-runs `room.connect()` whenever one of its
 *   effect's dependencies changes, and `onError` is one of them, so the next render of the meeting
 *   reconnected — evicting the OTHER device, which re-rendered and reconnected in turn. Neither
 *   media connection ever settled, the stage said "Could not reach the media server", and nobody
 *   could tell the cause was a second login (prod, 1 Oct 2026, four rooms in a row).
 *
 *   So displacement is a terminal state of its own: stop connecting, say what happened, and offer
 *   one deliberate take-over.
 */

/**
 * `livekit.DisconnectReason.DUPLICATE_IDENTITY`. A protobuf enum value — part of the wire format,
 * so it cannot move — written out here so this module stays importable without livekit-client.
 */
export const LIVEKIT_DUPLICATE_IDENTITY = 2;

/** True for the reason LiveKit's `RoomEvent.Disconnected` carries when the same identity joined elsewhere. */
export function isDuplicateIdentityDisconnect(reason: unknown): boolean {
  return reason === LIVEKIT_DUPLICATE_IDENTITY;
}

/**
 * True when a failed `room.connect()` was refused because the same identity joined elsewhere while
 * this one was still connecting. livekit-client reports that as a `ConnectionError` whose reason is
 * `LeaveRequest` and whose `context` is the leave's DisconnectReason.
 */
export function isDisplacedConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { reasonName?: unknown; context?: unknown; message?: unknown };
  if (candidate.reasonName === "LeaveRequest" && isDuplicateIdentityDisconnect(candidate.context)) {
    return true;
  }
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return message.includes("duplicate_identity") || message.includes("duplicate identity");
}

/**
 * True for the hub's `ForceDisconnected` reason when it means "you joined from another device".
 *
 * The same event also closes a cancelled room ("This room has been cancelled."), which must keep
 * closing the meeting, so the reason text is the only thing that tells the two apart. Matched
 * loosely on purpose: if the gateway rewords it, this degrades to the old close-and-leave
 * behaviour, and LiveKit's DUPLICATE_IDENTITY still catches the displacement on its own.
 */
export function isDisplacedHubReason(reason: unknown): boolean {
  return typeof reason === "string" && /another device/i.test(reason);
}
