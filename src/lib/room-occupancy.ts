/**
 * WT-274 — the ONE frontend definition of "who is in this room".
 *
 * This mirrors the backend's ratified rule, `TranslationRoomParticipantStatuses.SeatHolding`
 * (WT-262/263): a seat is held by CONNECTED participants only. Somebody sitting in the lobby
 * (WAITING) does NOT hold a seat, and INVITED / DISCONNECTED / LEFT / KICKED / REJECTED never
 * did. Do not widen `SEAT_HOLDING_STATUSES` without changing the backend constant first — the
 * two are one product rule, not two coincidences.
 *
 * Every surface that shows "N in this room" must go through `roomOccupancy`, or through the
 * `useRoomOccupancy` hook that wraps it. Three surfaces used to derive it privately and
 * disagreed on screen at the same instant: the room-detail header chip said `1/100`, the
 * Tracking panel said `Attendees: 0`, and the meetings-list row said `0/100`. Each of those
 * used a different status set (`["joined","connected"]`, "everyone the page could name minus
 * the organizer", and the server's `participantCount`), so they could not agree even in
 * principle. Deriving it once is the fix; three components agreeing to derive it the same way
 * is how they drifted in the first place.
 *
 * Deliberately free of runtime imports so it stays a pure, node --test-able module.
 */

/** Statuses that occupy one of the room's `maxParticipants` seats. CONNECTED only. */
export const SEAT_HOLDING_STATUSES = ["connected"] as const;

/** Statuses that mean "present, but waiting to be let in". Never counted against capacity. */
export const LOBBY_STATUSES = ["waiting"] as const;

/** The least a record has to carry for the seat rule to apply to it. */
export type ParticipantLike = { status?: string | null };

function normalizeStatus(status?: string | null): string {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

/** True when this participant currently occupies a seat. */
export function holdsSeat(status?: string | null): boolean {
  const normalized = normalizeStatus(status);
  return SEAT_HOLDING_STATUSES.some((seat) => seat === normalized);
}

/** True when this participant is in the lobby awaiting admission. */
export function isInLobby(status?: string | null): boolean {
  const normalized = normalizeStatus(status);
  return LOBBY_STATUSES.some((lobby) => lobby === normalized);
}

export interface RoomOccupancy<T extends ParticipantLike = ParticipantLike> {
  /** Participants holding a seat right now, in roster order. */
  seated: T[];
  /** Participants in the lobby. Present, but not against capacity. */
  lobby: T[];
  /** The single number every "in this room" surface renders. */
  seatCount: number;
  capacity: number;
  /** The one formatting of the pair, e.g. `"1/100"`. */
  label: string;
  isFull: boolean;
  /**
   * False when no roster was available and `seatCount` came from the server's aggregate
   * instead. Surfaces that want to be strict about live presence can check this; it exists
   * because the meetings list has no per-row roster to read.
   */
  fromRoster: boolean;
}

/**
 * Resolve a room's occupancy from whatever the caller actually has.
 *
 * `participants` is authoritative when supplied — including when it is empty, which means
 * "nobody is seated", not "unknown". `fallbackCount` is consulted only when there is no
 * roster at all.
 */
export function roomOccupancy<T extends ParticipantLike>(input: {
  capacity?: number | null;
  participants?: readonly T[] | null;
  fallbackCount?: number | null;
}): RoomOccupancy<T> {
  const capacity = Math.max(0, Math.trunc(input.capacity ?? 0));
  const roster = input.participants ?? null;

  if (!roster) {
    const seatCount = Math.max(0, Math.trunc(input.fallbackCount ?? 0));
    return {
      seated: [],
      lobby: [],
      seatCount,
      capacity,
      label: `${seatCount}/${capacity}`,
      isFull: capacity > 0 && seatCount >= capacity,
      fromRoster: false,
    };
  }

  const seated = roster.filter((participant) => holdsSeat(participant.status));
  const lobby = roster.filter((participant) => isInLobby(participant.status));

  return {
    seated,
    lobby,
    seatCount: seated.length,
    capacity,
    label: `${seated.length}/${capacity}`,
    isFull: capacity > 0 && seated.length >= capacity,
    fromRoster: true,
  };
}
