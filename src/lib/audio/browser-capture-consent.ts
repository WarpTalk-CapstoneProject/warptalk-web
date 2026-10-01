/**
 * When WarpTalk has to ask before listening to the user's browser, and when it must not.
 *
 * Kept out of the meeting session because "have we asked?" and "may we start?" are two questions
 * that look like one, and answering them inline is how a capture ends up starting on a render
 * where the answer had not arrived yet.
 */

export type BrowserCaptureConsentState =
  /** Nothing to ask: this path does not listen to the browser. */
  | "not-required"
  /** The dialog should be on screen. Nothing may capture yet. */
  | "required"
  | "granted"
  | "declined";

export interface BrowserCaptureConsentInput {
  isBridgeRoom: boolean;
  isHost: boolean;
  /**
   * The meeting is open and being transcribed.
   *
   * WT-828: this used to be `translationStarted`, on the theory that before Start Translation
   * there was no pipeline to consume the far side's audio. There is: the transcript is saved
   * whenever people speak, and Start Translation controls only translation and dubbing. Waiting
   * for it left every word the far side said before Start out of the meeting's record.
   */
  meetingOpen: boolean;
  /** A second virtual device exists, so the far side arrives on its own endpoint. */
  hasInboundDevice: boolean;
  /** Windows process loopback is the only way in on this machine. */
  loopbackAvailable: boolean;
  /** What the user said for THIS meeting. `null` when they have not been asked yet. */
  answer: boolean | null;
}

/**
 * A device endpoint never triggers the ask.
 *
 * Only process loopback takes more than it was pointed at. Prompting on the device path would put
 * a scary dialog in front of a capture that is genuinely narrow, and a prompt shown where it is not
 * needed is how people learn to dismiss the one that is.
 */
export function browserCaptureConsentState(
  input: BrowserCaptureConsentInput,
): BrowserCaptureConsentState {
  const wouldCaptureBrowser =
    input.isBridgeRoom &&
    input.isHost &&
    input.meetingOpen &&
    !input.hasInboundDevice &&
    input.loopbackAvailable;

  if (!wouldCaptureBrowser) return "not-required";
  if (input.answer === null) return "required";
  return input.answer ? "granted" : "declined";
}

/** Whether the loopback capture may start. Deliberately not `!== "declined"`. */
export function mayCaptureBrowser(state: BrowserCaptureConsentState): boolean {
  return state === "granted";
}

/**
 * WT-900 — the answer, remembered for the ROOM it was given in, across a reload.
 *
 * A reload used to ask again: the answer lived only in React state, so refreshing the main window
 * mid-meeting put the question back in front of a host who had already answered it, and on a
 * machine without a cable the far side went silent until they answered it a second time.
 *
 * Per room and in sessionStorage on purpose. Still NOT remembered across meetings: what gets
 * captured depends on which tabs are open, so a yes is for the sitting it was given in. sessionStorage
 * dies with the window, and the entry is removed when the room ends (`shouldForgetBrowserCaptureAnswer`).
 *
 * Every access is guarded: storage can be missing (server render), blocked (privacy settings) or
 * throw on access, and none of that may take the meeting down — the worst case is being asked again.
 */
export const BROWSER_CAPTURE_ANSWER_KEY_PREFIX = "warptalk:bridge-capture-answer:";

/** The slice of `Storage` this needs, so the tests can pass a plain object. */
export type BrowserCaptureAnswerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserCaptureAnswerKey(roomId: string): string {
  return `${BROWSER_CAPTURE_ANSWER_KEY_PREFIX}${roomId}`;
}

/** `window.sessionStorage`, or null wherever reading it is impossible or throws. */
export function browserCaptureAnswerStorage(): BrowserCaptureAnswerStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The stored answer for this room. Anything but the two values written below reads as unanswered. */
export function readStoredBrowserCaptureAnswer(
  storage: BrowserCaptureAnswerStorage | null,
  roomId: string,
): boolean | null {
  if (!storage || !roomId) return null;
  try {
    const value = storage.getItem(browserCaptureAnswerKey(roomId));
    if (value === "granted") return true;
    if (value === "declined") return false;
    return null;
  } catch {
    return null;
  }
}

/** Stores an answer, or forgets it when `granted` is null (the host asked to be asked again). */
export function writeStoredBrowserCaptureAnswer(
  storage: BrowserCaptureAnswerStorage | null,
  roomId: string,
  granted: boolean | null,
): void {
  if (!storage || !roomId) return;
  try {
    const key = browserCaptureAnswerKey(roomId);
    if (granted === null) storage.removeItem(key);
    else storage.setItem(key, granted ? "granted" : "declined");
  } catch {
    // Full or blocked storage: this sitting keeps its answer in memory and a reload asks again.
  }
}

const MEETING_OVER_STATUSES: ReadonlySet<string> = new Set([
  "ended",
  "cancelled",
  "expired",
  "failed",
  "timeout",
]);

/**
 * Whether the room's stored answer should be dropped. A room that is over will not be listened to
 * again; PAUSED is not over, and the answer must survive the resume.
 */
export function shouldForgetBrowserCaptureAnswer(roomStatus: string | null | undefined): boolean {
  return typeof roomStatus === "string" && MEETING_OVER_STATUSES.has(roomStatus.toLowerCase());
}

/**
 * WT-900 — the quiet form of the question, used while the Hi-Fi Cable already carries Meet
 * (`isCompactConsentAsk`). One line and two buttons, in both the popup and the main-window modal,
 * so the two surfaces cannot word it differently. "Switch" is the grant, "Keep cable" the decline.
 */
export const CABLE_WHILE_ASKING_PROMPT = {
  text: "Listening through Hi-Fi Cable. Switch to listening to the browser?",
  confirm: "Switch",
  decline: "Keep cable",
} as const;
