/**
 * Case-insensitive comparison for status strings coming off the API.
 *
 * The backend does not emit one casing. `WorkspaceInvitationDto` carries
 * `status: "PENDING"` (from InvitationStatus, a [JsonStringEnumConverter] enum
 * declared in SCREAMING_CASE) directly beside `deliveryStatus: "NotSent"`
 * (PascalCase) — two conventions inside a single object. Room and artifact
 * statuses have each produced the same class of bug already, and the
 * invitation page made it three: `previewData.status === "Accepted"` was never
 * true, so the "already accepted" banner was unreachable and a spent
 * invitation kept an enabled Accept button that failed with the wrong reason.
 *
 * Comparing through here removes the guess. It is not a substitute for the
 * backend agreeing with itself, but it makes the client correct either way.
 */
export function normalizeApiStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** True when `value` is `expected`, whatever casing the server chose today. */
export function apiStatusEquals(
  value: string | null | undefined,
  expected: string,
): boolean {
  const normalized = normalizeApiStatus(value);
  return normalized !== "" && normalized === normalizeApiStatus(expected);
}

/** True when `value` matches any of `expected`. */
export function apiStatusIn(
  value: string | null | undefined,
  expected: readonly string[],
): boolean {
  return expected.some((candidate) => apiStatusEquals(value, candidate));
}
