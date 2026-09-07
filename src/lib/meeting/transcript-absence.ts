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

export function transcriptAbsenceMessage(absence: TranscriptAbsence): string {
  switch (absence) {
    case "withheld":
      // Names who can change it. The flat denial is what sent this reader looking for a broken
      // recorder instead of asking the host.
      return "This meeting has a transcript, but it is not shared with you. Only the people who took part can read it — ask the host if you need access.";
    case "unavailable":
      // Deliberately does NOT say the meeting had no transcript. We do not know that.
      return "The transcript could not be loaded right now. Refresh to try again.";
    case "not-yet":
      return "The transcript is saved here as the meeting is transcribed.";
    case "none":
      return "No transcript was captured for this meeting.";
  }
}
