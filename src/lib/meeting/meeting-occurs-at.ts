/**
 * The moment a meeting belongs to on the timeline: its booked slot, else when it actually started,
 * else when its row was created.
 *
 * It has to be the same chain the server FILTERS the calendar's from/to range by
 * (`ScheduledAt ?? StartedAt ?? CreatedAt` in TranslationRoomService), not merely one it sorts by.
 * GMCAL1001: this used to fall back to `endedAt` before `createdAt`. For a room that never started
 * but has ended — a cancelled booking, an expired one, a bridge room closed before anyone spoke —
 * the server picked the room by its creation date and the client then filed it under the day it
 * ended, so a meeting fetched for one week could be drawn in another, or off the visible range
 * entirely.
 */
export function resolveOccursAt(room: {
  scheduledAt?: string | null;
  startedAt?: string | null;
  createdAt: string;
}): string {
  return room.scheduledAt ?? room.startedAt ?? room.createdAt;
}
