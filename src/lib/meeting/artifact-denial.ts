/**
 * "You may not see this" is not "this is broken", and the history panel said the second one.
 *
 * WHAT WAS ON SCREEN
 *   A meeting's outputs list "summary export (TEXT/MARKDOWN) · Ready". Opening it produced a
 *   panel reading, in full:
 *
 *       Unauthorized to download this artifact.
 *
 *   The summary was fine. Room artifacts default to HOST_ONLY (ArtifactAccessHelper), so a
 *   participant reading the summary of a meeting they attended is refused until the host shares
 *   it. That is a setting, with an owner and a next action — and the panel reported it in the
 *   register of a fault, which sends people to look for a broken summary generator instead of
 *   asking the host.
 *
 * WHY THIS IS A MODULE
 *   summary-absence.ts already drew exactly this distinction for the Summary TAB, and the
 *   download path kept the flat denial — so one meeting gave two different answers depending on
 *   which control you touched. Keeping the classification in one place is what stops the next
 *   surface that opens an artifact from restating a third version of it.
 *
 * THE SERVER SAYS IT BETTER, WHEN IT SAYS ANYTHING
 *   ArtifactAccessHelper.DescribeArtifactDenial now names which refusal it is — the host has not
 *   shared it, or you were not in this meeting. That message is preferred when present; the
 *   fallback here exists for a client running against a server that predates it.
 */

import axios from "axios";

/** Whether a failed artifact request was a refusal rather than a fault. */
export function isArtifactWithheld(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

/**
 * What to show for a withheld artifact.
 *
 * Named "withheld" rather than "forbidden" on purpose: the word a person reads should describe
 * the meeting's state, not the HTTP status that reported it.
 */
export const ARTIFACT_WITHHELD_FALLBACK =
  "This output has not been shared with you yet. The meeting host controls who can read it.";
