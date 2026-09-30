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
