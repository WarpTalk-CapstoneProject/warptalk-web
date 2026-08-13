/**
 * Whether this tab has already offered the language picker for a given room.
 *
 * WHY IT IS NOT A REF
 *   PersistentMeetingSession guarded the picker with `useRef(false)`, which lives and dies with
 *   the component instance. Anything that rebuilds the instance therefore asks again — and
 *   "Return to meeting" from the mini dock does exactly that, so a user already inside a meeting
 *   got the "choose a language for this meeting" modal thrown back over it.
 *
 * WHY sessionStorage AND NOT localStorage
 *   The same reason the active-meeting store gives: this is a property of the browsing context,
 *   not of the account. A second tab joining the same room is a second participant session and
 *   is entitled to be asked; localStorage would silently answer for it.
 *
 * Storage is treated as optional throughout. Private mode, a blocked origin or a full quota must
 * degrade to "ask again", never to a crash inside a live meeting.
 */

const KEY_PREFIX = "warptalk.meeting.language-picker-shown:";

export function wasLanguagePickerShown(roomId: string): boolean {
  if (typeof window === "undefined" || !roomId) return false;
  try {
    return window.sessionStorage.getItem(KEY_PREFIX + roomId) === "1";
  } catch {
    return false;
  }
}

export function markLanguagePickerShown(roomId: string): void {
  if (typeof window === "undefined" || !roomId) return;
  try {
    window.sessionStorage.setItem(KEY_PREFIX + roomId, "1");
  } catch {
    // The nudge will be offered once more on a remount. Harmless, and better than throwing.
  }
}
