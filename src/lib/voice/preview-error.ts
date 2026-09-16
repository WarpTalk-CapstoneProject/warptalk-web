/**
 * What to say when a voice preview does not play.
 *
 * WHY A CODE MAP AND NOT JUST THE SERVER'S SENTENCE
 *     The preview endpoint answers with `{ error, code }`, and until WT-649 the button read only
 *     `error`. That was survivable while the two agreed. They stopped agreeing: the render-timeout
 *     branch carried `INVALID_STATE` — a code that means "the thing you asked about is in a state
 *     that cannot do this" — next to a message that correctly said the render was slow. A reader
 *     comparing the two could conclude either that the voice was broken or that the wording was
 *     wrong, and QA concluded the second.
 *
 *     The server side of that is fixed: the timeout now answers `SERVICE_UNAVAILABLE`. This map is
 *     the other half — it lets the UI key off the code, so the two can never drift apart silently
 *     again, and so a cause we understand gets copy written for it rather than whatever sentence
 *     the API happened to carry.
 *
 * WHY UNKNOWN CODES FALL BACK TO THE SERVER'S OWN MESSAGE
 *     Deliberate, and load-bearing for deployment order. This client may ship before the API does,
 *     and the old API still answers `INVALID_STATE` for a timeout. If an unrecognised code
 *     collapsed to generic copy, deploying the fix would DELETE the honest "taking longer than
 *     expected" wording and make the very defect being fixed worse until the backend caught up.
 *     An unknown code means we have no better sentence than the server's — so we use the server's.
 */

/** Kept in step with WarpTalk.Shared.ErrorCodes. */
export const PREVIEW_FALLBACK_MESSAGE = "Could not play a preview of this voice.";

const PREVIEW_MESSAGE_BY_CODE: Record<string, string> = {
  // The render did not arrive inside the worker's window, or the queue could not be reached.
  // Both are "ask again shortly", and neither says anything about the voice itself.
  SERVICE_UNAVAILABLE: "The preview is taking longer than expected. Try again in a moment.",
  // The id is not on offer for this language, or is not one this account may hear.
  VALIDATION_ERROR: "That voice cannot be previewed in this language.",
  FORBIDDEN: "That voice is not one you can preview.",
};

/**
 * The message to show, given the error code and whatever sentence the server sent with it.
 *
 * `serverMessage` wins over the generic fallback but loses to a known code, so a cause we have
 * written copy for reads consistently everywhere it appears.
 */
export function previewErrorMessageFor(
  code: string | number | undefined,
  serverMessage?: string | null,
): string {
  const mapped = typeof code === "string" ? PREVIEW_MESSAGE_BY_CODE[code] : undefined;
  if (mapped) return mapped;

  const fromServer = serverMessage?.trim();
  return fromServer && fromServer.length > 0 ? fromServer : PREVIEW_FALLBACK_MESSAGE;
}
