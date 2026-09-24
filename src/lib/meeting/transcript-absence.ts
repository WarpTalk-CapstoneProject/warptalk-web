/**
 * Why the Transcript tab has nothing to show — told apart, because the causes are not the same.
 *
 * The Summary tab already draws this distinction (see summary-absence.ts, "withheld" vs
 * "absent"). The Transcript tab never got it, and answered every one of these cases with the
 * same confident sentence:
 *
 *     "No transcript was captured for this meeting."
 *
 * WT-516 is what that costs. A workspace member opened a published meeting record and read
 * exactly that, while the meeting's transcript sat in the database with 82 saved lines and the
 * host was looking at all of them. The reader had simply never attended: `TranscriptReadAccess`
 * grants host-or-participant, deliberately and by documented decision, so the API answered
 * `FORBIDDEN` — and the client turned "you may not read this" into "this does not exist".
 *
 * The two are not close. One sends you to ask the host for access; the other sends you to report
 * a broken recorder. The room page already knows this — it carries a "Still writing this up"
 * state for the minute after a meeting ends, added because the empty state was "a wrong answer,
 * given confidently, at the only moment it is wrong". This is the same wrong answer, given for
 * three more reasons.
 *
 * THE RULE THAT MATTERS: "no transcript was captured" is a claim about the MEETING, and it may
 * only be made when the server actually answered and the answer was zero. Every other path —
 * refused, failed, still loading, not finished yet — is a claim about THIS REQUEST, and must say
 * so instead.
 */

export type TranscriptAbsence =
  /** The read was refused. It exists; this viewer may not read it. */
  | "withheld"
  /** The read failed for some other reason. We do not know whether it exists. */
  | "unavailable"
  /** The meeting is still running, or the finalizer has not written it yet. */
  | "not-yet"
  /** The server answered, and the meeting really did capture nothing. */
  | "none";

export type TranscriptAbsenceInput = {
  /** Lines this viewer can actually see. Above zero, there is nothing to explain. */
  lineCount: number;
  /** The meeting has reached a terminal state. */
  isEnded: boolean;
  /** The transcript lookup is still in flight. */
  isLoading?: boolean;
  /**
   * The server's own code for a failed lookup — `FORBIDDEN`, `NOT_FOUND`, … — or the HTTP
   * status. Absent means the request did not fail.
   */
  errorCode?: string | number | null;
};

/** Whether a failure means "refused" rather than "went wrong". */
function isRefusal(code: string | number | null | undefined): boolean {
  if (code == null) return false;
  if (typeof code === "number") return code === 403;
  const normalized = code.trim().toUpperCase();
  return normalized === "FORBIDDEN" || normalized === "403" || normalized === "UNAUTHORIZED";
}

/**
 * What to say instead of showing the transcript, or null when there is a transcript to show.
 */
export function describeTranscriptAbsence(
  input: TranscriptAbsenceInput,
): TranscriptAbsence | null {
  // Anything readable outranks every explanation below. A viewer who can see some of the
  // meeting is not looking at an empty state.
  if (input.lineCount > 0) return null;

  // Before the error check: a request still in flight has not failed, and a stale error from a
  // previous attempt must not be rendered over a load that may yet succeed.
  if (input.isLoading) return "not-yet";

  // Above `not-yet`: a refusal is a definite answer, and it does not become less true because
  // the meeting happens to still be running.
  if (isRefusal(input.errorCode)) return "withheld";
  if (input.errorCode != null) return "unavailable";

  if (!input.isEnded) return "not-yet";

  return "none";
}

/**
 * `t` is optional and defaulted to today's exact English strings, so call sites that have not yet
 * migrated onto the i18n catalog (see `.agents/page-docs/i18n-localization.md`) keep compiling and
 * keep their existing copy unchanged — same pattern as `getPlanDescription` in `src/lib/utils.ts`.
 * The default's four strings are pinned by `transcript-absence.test.ts`'s regex assertions.
 */
type TranscriptAbsenceTranslator = (key: string) => string;

const DEFAULT_TRANSCRIPT_ABSENCE_MESSAGES: Record<TranscriptAbsence, string> = {
  // Names who can change it. The flat denial is what sent this reader looking for a broken
  // recorder instead of asking the host.
  withheld:
    "This meeting has a transcript, but it is not shared with you. Only the people who took part can read it — ask the host if you need access.",
  // Deliberately does NOT say the meeting had no transcript. We do not know that.
  unavailable: "The transcript could not be loaded right now. Refresh to try again.",
  "not-yet": "The transcript is saved here as the meeting is transcribed.",
  none: "No transcript was captured for this meeting.",
};

function defaultTranscriptAbsenceCopy(key: string): string {
  return DEFAULT_TRANSCRIPT_ABSENCE_MESSAGES[key as TranscriptAbsence] ?? key;
}

/**
 * Two overloads rather than one function with a defaulted param: `transcript-absence.test.ts`
 * hands this function straight to `Array.prototype.map` (`states.map(transcriptAbsenceMessage)`),
 * and a single signature with an optional SECOND parameter is not assignable there — TypeScript
 * checks that `map`'s `index: number` is compatible with this function's `t` parameter, and a
 * function type never is. Overloading keeps the 1-argument call signature the public type map's
 * callback is checked against, so the test keeps compiling unmodified.
 *
 * Overloads only settle the TYPE, though — they vanish at runtime, and `map` always calls its
 * callback with three positional arguments. Called that way, `t` receives the numeric INDEX, not
 * `undefined`, so a plain default parameter would never kick in and `t(...)` would throw on a
 * number. The `typeof maybeT === "function"` guard below is what actually keeps that call — and
 * the test's `states.map(transcriptAbsenceMessage)` — working: anything that is not a real
 * translator function (an index, a stray array) falls back to the English default exactly as it
 * did before this function took a second parameter at all.
 */
export function transcriptAbsenceMessage(absence: TranscriptAbsence): string;
export function transcriptAbsenceMessage(
  absence: TranscriptAbsence,
  t: TranscriptAbsenceTranslator,
): string;
export function transcriptAbsenceMessage(
  absence: TranscriptAbsence,
  maybeT?: TranscriptAbsenceTranslator,
): string {
  const t = typeof maybeT === "function" ? maybeT : defaultTranscriptAbsenceCopy;
  switch (absence) {
    case "withheld":
      return t("withheld");
    case "unavailable":
      return t("unavailable");
    case "not-yet":
      return t("not-yet");
    case "none":
      return t("none");
  }
}
