/**
 * One request in flight per key; every caller that arrives while it runs gets the SAME promise.
 *
 * Ending a meeting is the case this exists for. Production, 30 Sep: one "End for Everyone" became
 * six `POST /meetings/rooms/{id}/end` requests in under a second — the button stayed live while
 * the first request waited on LiveKit, and each press went out. The backend now ends a meeting
 * once however many requests race, but six requests still meant six LiveKit deletes, six toasts
 * and six redirects racing each other. So the client asks once.
 *
 * The key is released when the request settles — success OR failure — so a failed end can be
 * retried with the next press. Nothing runs on import; the map is only touched by calls.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const request = (async () => {
    try {
      return await run();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}

/** Whether a request for `key` is running right now. */
export function isInFlight(key: string): boolean {
  return inFlight.has(key);
}

/** The keys the two end calls share, so every entry point dedupes against every other. */
export const endMeetingFlightKey = (roomId: string) => `meeting:end:${roomId}`;
export const endRoomFlightKey = (roomId: string) => `translation-room:end:${roomId}`;
