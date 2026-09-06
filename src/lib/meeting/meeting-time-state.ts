/**
 * WT-538 — the ONE rule for where a meeting sits on the viewer's timeline.
 *
 * This replaces a `resolveTimeState(status)` that read the room's status and nothing else:
 *
 *     if (status === "scheduled") return "upcoming";
 *
 * A room booked for last Tuesday that nobody ever opened keeps `status: SCHEDULED` forever, so it
 * stayed `upcoming` forever — the Upcoming filter counted meetings that had already failed to
 * happen, and went on counting them next month.
 *
 * The reasoning that put it there is still right and is kept: a room booked for 09:00 that nobody
 * has opened IS still upcoming at 09:05. It has not started, and painting it as over — or offering
 * a Join button the status contradicts — would be the opposite lie. What the old rule lacked was a
 * THRESHOLD. "Not started yet" decays into "never happened" at some point; it just does not happen
 * at 09:05. So the clock is consulted, but only once the grace window below has run out.
 *
 * Deliberately free of runtime imports so it stays a pure, `node --test`-able module, in the same
 * spirit as `room-occupancy` next door.
 */

import type { MeetingTimeState } from "@/types/myMeetings";
import type { RoomHistoryParticipant } from "@/types/roomHistory";
import type { TranslationRoomStatus } from "@/types/translationRoom";

/**
 * How long after its slot a booked room may sit unopened before it counts as missed.
 *
 * Two hours, and the number is chosen from what it has to survive rather than from taste:
 *
 *  - It must be LONGER than a plausible late start. Hosts open rooms late — the 09:00 that starts
 *    at 09:25 because the previous call overran is ordinary, not exceptional. Anything under an
 *    hour would flip such a meeting to "missed" and then back to "live" the moment the host
 *    arrived, and a state that flickers is worse than a state that is late.
 *  - It must be SHORTER than the rest of the day. The bug being fixed is a meeting sitting in
 *    Upcoming for a week; a threshold of "when today ends" would still leave a 09:00 no-show
 *    counted as upcoming at 18:00, which is the same bug with a smaller number on it.
 *
 * Two hours clears the longest normal slot (60 min) plus a generous late start, and still means a
 * morning no-show reads honestly by the afternoon. It is not a product-configurable value: nothing
 * downstream branches on the exact figure, only on which side of it the clock is.
 */
export const MISSED_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Room statuses that mean the room is reachable RIGHT NOW.
 *
 * `waiting` is here because the lobby being open is the point at which a participant can act on
 * the row: the room can be entered, which is the only distinction this state drives in the UI.
 */
const LIVE_ROOM_STATUSES: readonly string[] = ["in_progress", "waiting", "paused"];

/**
 * Participant statuses that prove the person was ACTUALLY IN THE ROOM at some point.
 *
 * `kicked` (and `removed`, the client's alias for it — see `TranslationRoomParticipantDto`) counts
 * as attended on purpose: you cannot be thrown out of somewhere you were never in. Being removed is
 * a thing that happened TO someone who turned up, and filing it under "never showed" would tell the
 * person they missed a meeting they were sitting in.
 *
 * If the backend ever gains a path that kicks somebody straight out of the LOBBY, this set stops
 * being true and `kicked` has to move — that is the one assumption here worth re-checking against
 * the server before trusting it.
 */
const ATTENDED_PARTICIPANT_STATUSES: readonly string[] = [
  "connected",
  "disconnected",
  "left",
  "kicked",
  "removed",
];

/**
 * Participant statuses that prove the person NEVER got into the room.
 *
 * Stated as its own explicit set rather than as "not attended", because the third answer —
 * "we cannot tell" — has to stay distinct from both. An unrecognised status is not evidence of
 * absence, and telling someone they missed a meeting is a claim we need standing to make.
 */
const ABSENT_PARTICIPANT_STATUSES: readonly string[] = ["invited", "waiting", "rejected"];

/** What the resolver needs from a meeting. A structural subset of `MyMeetingItem`. */
export interface MeetingTimeStateInput {
  status: TranslationRoomStatus;
  /** The instant the row is filed under — same fallback chain the server sorts by. */
  occursAt: string;
  participants: readonly Pick<RoomHistoryParticipant, "userId" | "status">[];
}

/**
 * Whether the viewer was ever in this room.
 *
 * Three-valued on purpose. `null` is "no evidence either way" and is NOT a synonym for false:
 * a payload with no roster, a roster with no row for the viewer, a status nobody here recognises,
 * or a signed-out/unknown viewer all land there.
 *
 * A KNOWN LIMIT, so nobody rediscovers it as a bug. `RoomReadAccess.IsReadableBy` puts a room on
 * your timeline by three routes — you host it, you have a participant row, or an INVITATION carries
 * your email — and the third leaves no participant row at all. Such a meeting is genuinely missed
 * and this returns `null` for it, so it reads as `joined`. That is the deliberate direction to be
 * wrong in: telling someone they missed a meeting they attended is a false claim about their own
 * history, and the payload carries nothing that could distinguish "invited by email, never came"
 * from "the roster was not sent". Closing it needs the invitation on the DTO, not a guess here.
 */
export function viewerAttended(
  participants: readonly Pick<RoomHistoryParticipant, "userId" | "status">[],
  viewerUserId: string | null,
): boolean | null {
  if (!viewerUserId) return null;

  const row = participants.find((participant) => participant.userId === viewerUserId);
  if (!row) return null;

  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (ATTENDED_PARTICIPANT_STATUSES.includes(status)) return true;
  if (ABSENT_PARTICIPANT_STATUSES.includes(status)) return false;
  return null;
}

/**
 * Where one meeting sits, for this viewer, at this instant.
 *
 * Note "for this viewer": the answer is no longer a property of the room alone, which is exactly
 * why this is a function the render layer calls rather than a field the mapper freezes into the
 * cached row. Two people looking at the same finished meeting get different answers — the one who
 * was there sees `joined`, the one who never opened the invite sees `missed` — and the answer also
 * changes on its own while the page is open, as the clock crosses the grace window.
 *
 * The order of the branches is the rule:
 *
 *  1. The room is open now → `live`. Status outranks the clock here; a room that is running is
 *     running whatever its booked slot said.
 *  2. Still merely booked → `upcoming` until the grace window runs out, then `missed`. This is the
 *     never-happened case, and it needs no viewer: nobody attended, because there was nothing to
 *     attend.
 *  3. Otherwise the meeting is over → `joined` if the viewer was in it, `missed` if the roster says
 *     they never were, and `joined` when there is nothing to say either way. That last fallback is
 *     the conservative one and is deliberate: with no evidence, this keeps the behaviour the page
 *     has always had rather than accusing a user of missing something on the strength of a field
 *     that happened to be absent.
 *
 * A CANCELLED room lands in branch 3 and, since nobody was ever in it, comes out `missed`. That is
 * the honest bucket — a called-off meeting is not one you attended — and it changes nothing on
 * screen, because every tone and label on the schedules page tests `status === "cancelled"` before
 * it ever looks at this value.
 *
 * `now` is passed in and never read from the environment, which is what keeps this callable from
 * inside a `useMemo` without breaking React's purity rule. `null` is a real case, not a shortcut:
 * it means the caller has no trustworthy clock yet (React has not hydrated, so reading one would
 * make the first paint depend on when it happened). With no clock, branch 2 cannot decay and
 * everything booked stays `upcoming` — the pre-WT-538 answer, which is the right conservative one
 * for a pass that has no rows to paint yet.
 */
export function resolveMeetingTimeState(
  meeting: MeetingTimeStateInput,
  options: { viewerUserId: string | null; now: number | null },
): MeetingTimeState {
  if (LIVE_ROOM_STATUSES.includes(meeting.status)) return "live";

  if (meeting.status === "scheduled") {
    if (options.now === null) return "upcoming";
    const occursAt = Date.parse(meeting.occursAt);
    // An unparseable timestamp is not proof the slot has passed. Leave it upcoming.
    if (!Number.isFinite(occursAt)) return "upcoming";
    return options.now - occursAt > MISSED_GRACE_MS ? "missed" : "upcoming";
  }

  return viewerAttended(meeting.participants, options.viewerUserId) === false ? "missed" : "joined";
}
