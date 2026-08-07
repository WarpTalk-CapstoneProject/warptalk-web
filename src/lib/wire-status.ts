/**
 * Case-folding for enum-shaped values that arrive from the backend.
 *
 * Every C# enum in warptalk-backend is serialised with
 * `[JsonConverter(typeof(JsonStringEnumConverter))]` and NO naming policy, so the wire
 * carries the value in the casing it was DECLARED in — `"CANCELLED"`, `"ACCEPTED"`,
 * `"IN_PROGRESS"`. Several statuses that are plain string columns rather than enums are
 * likewise written from `SomeEnum.X.ToString()`, which is also upper-case.
 *
 * Comparing such a value directly against a differently-cased literal produces a branch
 * that can NEVER fire, and it fails silently — the UI just quietly shows the wrong thing.
 * This class of bug has now shipped three times in this client:
 *
 *   1. artifact status  — every finished artifact looked stuck in `processing`
 *   2. room status      — guarded in `resolveHistoryStatus` (see room-history-mapping.ts)
 *   3. invitation status — `previewData.status === "Accepted"` vs the wire's `"ACCEPTED"`,
 *                          so an already-accepted invite still offered an Accept button
 *
 * Use this on ANY status/role/type string that came off the wire before comparing it.
 * `scripts/check-wire-status-casing-contract.mjs` fails the build on new raw comparisons.
 */
export function foldWireStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/** True when a wire value matches any of the given names, ignoring casing. */
export function wireStatusIs(
  status: string | null | undefined,
  ...names: string[]
): boolean {
  const folded = foldWireStatus(status);
  return names.some((name) => foldWireStatus(name) === folded);
}
