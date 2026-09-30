/**
 * Why an uploaded recording could not be turned into a voice, and what the person can do next.
 *
 * WHY THIS EXISTS
 *     On 2026-09-18 every upload failed at the voice provider: the Cartesia account had dropped to
 *     the Free plan, which does not include cloning. The row said "Couldn't clone" and nothing
 *     else, because the reason was never stored — and the only action it offered was Re-record,
 *     which could not have helped: the recordings were fine and the account was not. A new take
 *     would have failed identically.
 *
 *     So the failure is split by whose problem it is. A provider/account failure says the
 *     recording is fine and offers Try again (which re-sends the STORED recording). Only a
 *     recording the provider actually refused asks for a new take.
 *
 * The codes come from warptalk-ai `tts_worker._clone_failure`, stored by AuthService in
 * voice_profiles.clone_error_code. A code this page does not know is treated as unknown rather
 * than guessed at, so a worker newer than the page can never make it claim the wrong cause.
 */

export type CloneFailureReason =
  | "planRequired"
  | "outOfCredits"
  | "providerRejected"
  | "providerUnavailable"
  | "sampleRejected"
  | "sampleExpired"
  | "unknown"
  | "notRecorded";

export interface CloneFailure {
  /** i18n key under `voiceProfiles.yourVoices.cloneFailure`. */
  reason: CloneFailureReason;
  /** Re-sending the stored recording can succeed — the recording was not the problem. */
  canRetry: boolean;
  /** Only a new take can fix it (or we cannot tell, so both are offered). */
  suggestReRecord: boolean;
}

const BY_CODE: Record<string, CloneFailureReason> = {
  PROVIDER_PLAN_REQUIRED: "planRequired",
  PROVIDER_QUOTA_EXCEEDED: "outOfCredits",
  PROVIDER_REJECTED: "providerRejected",
  PROVIDER_BUSY: "providerUnavailable",
  PROVIDER_UNAVAILABLE: "providerUnavailable",
  PROVIDER_UNREACHABLE: "providerUnavailable",
  SAMPLE_REJECTED: "sampleRejected",
  SAMPLE_EXPIRED: "sampleExpired",
  UNKNOWN: "unknown",
};

export function describeCloneFailure(code: string | null | undefined): CloneFailure {
  const trimmed = code?.trim();
  if (!trimmed) {
    // Failed before reasons were stored (the 2026-09-18 rows). Nothing to go on, so both ways out.
    return { reason: "notRecorded", canRetry: true, suggestReRecord: true };
  }

  const reason = BY_CODE[trimmed] ?? "unknown";
  if (reason === "sampleRejected") {
    return { reason, canRetry: false, suggestReRecord: true };
  }
  if (reason === "unknown") {
    return { reason, canRetry: true, suggestReRecord: true };
  }
  return { reason, canRetry: true, suggestReRecord: false };
}
