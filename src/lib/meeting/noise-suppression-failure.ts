/**
 * Why enhanced noise suppression did not turn on, said in a way somebody can act on.
 *
 * WHY THIS EXISTS
 *   The three ways Krisp fails are genuinely different problems with different fixes, and the
 *   meeting collapsed all of them into one line: "Browser noise suppression remains enabled;
 *   enhanced suppression will retry after reload."
 *
 *   For one of the three that sentence is actively false. When the LiveKit project is not
 *   entitled to run Krisp, reloading changes nothing — and a user told to reload will reload,
 *   repeatedly, and report the feature as broken. Which is what happened.
 *
 *   The error handler took no argument at all, so the cause was discarded before it could be
 *   read. useTrackProcessors had already done the hard part: it distinguishes "threw while
 *   attaching" from "attached but refused to enable", and that distinction was thrown away one
 *   function later.
 *
 * WHAT DOES NOT CHANGE
 *   The microphone is fine in every case. useTrackProcessors restores the browser's own
 *   suppression before reporting, deliberately — "the report is only honest if it is true by the
 *   time it is made". So none of these messages is an outage; they are a downgrade, and they
 *   should read like one.
 */

export type NoiseSuppressionFailure = {
  /** Short title for the toast. */
  title: string;
  /** One line saying what it means and, when there is one, what to do. */
  detail: string;
  /**
   * Whether trying again could plausibly help.
   *
   * False for an entitlement problem: telling somebody to reload when reloading cannot work is
   * how a fixable configuration issue becomes a bug report about the feature.
   */
  retryable: boolean;
};

/** Krisp attached and then declined to run — the LiveKit project or browser cannot. */
const NOT_ENABLED_MARKER = "did not enable";

export function describeNoiseSuppressionFailure(error: unknown): NoiseSuppressionFailure {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message.includes(NOT_ENABLED_MARKER)) {
    return {
      title: "Enhanced noise suppression is not available on this account",
      // Named precisely, because this one is a configuration somebody can change — and it is the
      // case where "try again" wastes the user's time.
      detail:
        "The Krisp filter needs to be enabled for this LiveKit project. Your microphone is still "
        + "using the browser's own noise suppression.",
      retryable: false,
    };
  }

  // Everything else: a WASM load blocked by CSP, a network failure fetching the model, a browser
  // that cannot run it. These CAN change between loads, so saying so is honest rather than
  // hopeful.
  //
  // The CAUSE rides along now. This branch fired on production (22 Aug, the "test krisp" room)
  // and there was nothing to read anywhere — not in the toast, not in the console — so the only
  // possible diagnosis was a guess. A one-line summary that hides the error is how one bug
  // spends weeks as a mystery.
  const cause = error instanceof Error && message.trim() ? ` (${message.trim().slice(0, 140)})` : "";
  return {
    title: "Enhanced noise suppression could not start",
    detail:
      "Your microphone is still using the browser's own noise suppression. It will try again the "
      + "next time you turn it on."
      + cause,
    retryable: true,
  };
}
