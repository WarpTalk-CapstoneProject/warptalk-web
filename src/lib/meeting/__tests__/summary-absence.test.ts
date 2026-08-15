import assert from "node:assert/strict";
import test from "node:test";

import { describeSummaryAbsence, summaryAbsenceMessage } from "../summary-absence.ts";

/**
 * A meeting listed `summary export · Ready` under Artifacts while the Summary tab beside it said
 * "This meeting ended without a summary artifact."
 *
 * The summary existed. What was missing was permission: room artifacts default to HOST_ONLY, and
 * the history projection omits `content` for anyone the access policy refuses while still listing
 * the row. The client saw a body-less artifact and reported the meeting as having produced none.
 */

const BASE = { isGenerating: false, hasSummaryArtifact: false, hasParsedSummary: false };

test("an artifact we cannot read is withheld, not absent", () => {
  // The bug. Saying "no summary" sends the reader after a broken generator instead of the host.
  const absence = describeSummaryAbsence({
    ...BASE,
    hasSummaryArtifact: true,
    hasParsedSummary: false,
  });

  assert.equal(absence, "withheld");
  assert.match(summaryAbsenceMessage(absence), /not shared with you/);
});

test("no artifact at all is still absent", () => {
  // The negative control: the honest "no summary" case must survive.
  assert.equal(describeSummaryAbsence(BASE), "absent");
  assert.match(summaryAbsenceMessage("absent"), /ended without a summary/);
});

test("a readable summary is not an absence at all", () => {
  assert.equal(
    describeSummaryAbsence({ ...BASE, hasSummaryArtifact: true, hasParsedSummary: true }),
    "absent",
    "a parsed summary must not fall into the withheld branch",
  );
});

test("insufficient data outranks withheld", () => {
  // The worker ran and answered about the MEETING. That is more specific than a permission
  // problem, and the row it wrote would otherwise read as withheld.
  assert.equal(
    describeSummaryAbsence({
      ...BASE,
      hasSummaryArtifact: true,
      hasParsedSummary: false,
      insufficientData: true,
    }),
    "insufficient-data",
  );
});

test("generating and failed outrank everything", () => {
  assert.equal(
    describeSummaryAbsence({ ...BASE, isGenerating: true, hasSummaryArtifact: true }),
    "generating",
  );
  assert.equal(
    describeSummaryAbsence({ ...BASE, summaryState: "failed", hasSummaryArtifact: true }),
    "failed",
  );
});

test("every state has a message", () => {
  for (const absence of ["generating", "failed", "insufficient-data", "withheld", "absent"] as const) {
    assert.ok(summaryAbsenceMessage(absence).length > 0);
  }
});
