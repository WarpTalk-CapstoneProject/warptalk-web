/**
 * WT-888 — the read-aloud phrase a voice-profile recording must say.
 *
 * WHY THIS EXISTS
 *     The create-profile dialog used to accept any audio file, and the only protection was five
 *     self-attested checkboxes — so anybody could clone another person from a recording of them.
 *     Now the server issues a random phrase (POST /auth/voice-profiles/challenges), the person
 *     records themselves reading it in the browser, and the recording is uploaded with the
 *     challenge id. The server transcribes it and refuses a profile unless it says the phrase. The
 *     API enforces this; the dialog only makes it possible to pass.
 *
 * Kept free of React and of the API client so the rules below can be unit-tested with node.
 */

export type VoiceEnrollmentChallenge = {
  challengeId: string;
  /** The bare language the phrase is written in: "en", "vi" or "ja". */
  language: string;
  phrase: string;
  /** ISO-8601 instant. */
  expiresAt: string;
};

/** The server's stable codes for a refused recording (VoiceEnrollmentErrorCodes in AuthService). */
export const VOICE_CHALLENGE_ERROR_CODES = {
  required: "VOICE_CHALLENGE_REQUIRED",
  invalid: "VOICE_CHALLENGE_INVALID",
  mismatch: "VOICE_CHALLENGE_MISMATCH",
} as const;

/**
 * A phrase is reused for a re-take only while it has comfortably more than this left: reading it
 * and saving the form takes time, and a phrase that expires mid-submit costs the whole take.
 */
export const CHALLENGE_REUSE_MARGIN_MS = 60_000;

/** "vi-VN" → "vi". The server answers with the bare code the phrase is written in. */
export function bareLanguage(language: string): string {
  return language.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";
}

/**
 * May this phrase be read again for another take in `profileLanguage`? Not once it is near
 * expiry, and never across a language change — the server refuses a phrase issued for another
 * language. Languages without a phrase list fall back to English on the server, so a mismatch
 * there is only ever a reason to ask for a new phrase, never to keep a wrong one.
 */
export function isChallengeReusable(
  challenge: VoiceEnrollmentChallenge | null,
  profileLanguage: string,
  now: number = Date.now(),
): challenge is VoiceEnrollmentChallenge {
  if (!challenge) return false;
  if (challenge.language !== bareLanguage(profileLanguage)) return false;
  const expiresAt = Date.parse(challenge.expiresAt);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - now > CHALLENGE_REUSE_MARGIN_MS;
}

/**
 * After a failed save, is the phrase (and the take read against it) spent?
 *
 * The server consumes a phrase the moment it checks a recording against it — pass, mismatch, or
 * the transcriber being unavailable — so after any of those the next take needs a new phrase.
 * Failures that happen before the check (a missing name, say) leave both intact.
 */
export function isChallengeSpentBy(errorCode: string | number | undefined): boolean {
  return (
    errorCode === VOICE_CHALLENGE_ERROR_CODES.required ||
    errorCode === VOICE_CHALLENGE_ERROR_CODES.invalid ||
    errorCode === VOICE_CHALLENGE_ERROR_CODES.mismatch ||
    errorCode === "SERVICE_UNAVAILABLE" ||
    errorCode === 503
  );
}

/** Which createDialog.challengeErrors key explains this code, if any. */
export function challengeErrorKey(
  errorCode: string | number | undefined,
): "mismatch" | "invalid" | "unavailable" | null {
  if (errorCode === VOICE_CHALLENGE_ERROR_CODES.mismatch) return "mismatch";
  if (
    errorCode === VOICE_CHALLENGE_ERROR_CODES.invalid ||
    errorCode === VOICE_CHALLENGE_ERROR_CODES.required
  ) {
    return "invalid";
  }
  if (errorCode === "SERVICE_UNAVAILABLE" || errorCode === 503) return "unavailable";
  return null;
}
