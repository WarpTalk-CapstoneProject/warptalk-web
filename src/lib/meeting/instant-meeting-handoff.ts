/**
 * The one thing the create dialog has to tell the live meeting.
 *
 * An instant meeting is created, started and entered by a single click, which means the host
 * never sees the screen that used to hand them the join link. Google Meet answers this with the
 * "Your meeting's ready" card that greets you inside an instant meeting; this is the handoff that
 * lets WarpTalk show the same thing, without the live session having to guess how the host got
 * there — a room that is merely WAITING looks identical whether it was opened one second ago or
 * rejoined an hour later.
 *
 * sessionStorage, and the same tab, on purpose: this is a fact about one navigation, not about
 * the room. A second tab opening the same meeting was not the click that started it.
 */
export const INSTANT_MEETING_KEY = "warptalk.meeting.instant";

type StorageWriter = Pick<Storage, "setItem">;
type StorageConsumer = Pick<Storage, "getItem" | "removeItem">;

/** Written immediately before navigating into the meeting the host just started. */
export function markInstantMeetingStarted(
  storage: StorageWriter,
  roomId: string,
): void {
  storage.setItem(INSTANT_MEETING_KEY, roomId);
}

/**
 * Reads the mark and CLEARS it, whatever it said.
 *
 * Clearing on a mismatch too is deliberate: a mark that was never consumed — the host closed the
 * tab before the meeting loaded, or navigated somewhere else first — must not survive to greet
 * them inside an unrelated meeting later in the same session.
 */
export function consumeInstantMeetingStart(
  storage: StorageConsumer,
  roomId: string,
): boolean {
  const marked = storage.getItem(INSTANT_MEETING_KEY);
  if (marked === null) return false;
  storage.removeItem(INSTANT_MEETING_KEY);
  return marked === roomId;
}
