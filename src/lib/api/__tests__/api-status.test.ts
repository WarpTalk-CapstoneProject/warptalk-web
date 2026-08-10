import assert from "node:assert/strict";
import test from "node:test";

import { apiStatusEquals, apiStatusIn, normalizeApiStatus } from "../api-status.ts";

test("the exact payload the invitation page used to get wrong", () => {
  // InvitationStatus.cs declares ACCEPTED under [JsonStringEnumConverter], and
  // it reaches the client as "ACCEPTED". The page compared it to "Accepted",
  // so isAccepted was always false: the banner was dead UI and the Accept
  // button stayed enabled on a spent invitation.
  // Typed as `string`, matching WorkspaceInvitationDto.status — otherwise
  // TypeScript narrows to a literal and refuses to compile the comparison the
  // page actually shipped.
  const fromServer: string = "ACCEPTED";

  assert.equal(fromServer === "Accepted", false, "the old comparison");
  assert.equal(apiStatusEquals(fromServer, "ACCEPTED"), true);
  assert.equal(apiStatusEquals(fromServer, "Accepted"), true);
});

test("every casing the backend has actually been seen to emit", () => {
  // WorkspaceInvitationDto carries status: "PENDING" beside
  // deliveryStatus: "NotSent" — SCREAMING_CASE and PascalCase in one object.
  for (const value of ["PENDING", "Pending", "pending", "  Pending  "]) {
    assert.equal(apiStatusEquals(value, "PENDING"), true, value);
  }
  assert.equal(apiStatusEquals("NotSent", "NOTSENT"), true);
});

test("a missing status is not a match for anything", () => {
  assert.equal(apiStatusEquals(null, "ACCEPTED"), false);
  assert.equal(apiStatusEquals(undefined, "ACCEPTED"), false);
  assert.equal(apiStatusEquals("", "ACCEPTED"), false);
  assert.equal(apiStatusEquals("   ", "ACCEPTED"), false);
  // Not even against an empty expectation — "no status" must never read as a
  // terminal state, or a pending invitation would render as accepted.
  assert.equal(apiStatusEquals(null, ""), false);
  assert.equal(apiStatusEquals("", ""), false);
});

test("unrelated statuses stay unrelated", () => {
  assert.equal(apiStatusEquals("REJECTED", "ACCEPTED"), false);
  assert.equal(apiStatusEquals("ACCEPTED_LATER", "ACCEPTED"), false);
});

test("apiStatusIn matches any candidate, case-insensitively", () => {
  assert.equal(apiStatusIn("Revoked", ["ACCEPTED", "REVOKED"]), true);
  assert.equal(apiStatusIn("PENDING", ["ACCEPTED", "REVOKED"]), false);
  assert.equal(apiStatusIn(null, ["ACCEPTED"]), false);
});

test("normalizeApiStatus is the single shape everything compares in", () => {
  assert.equal(normalizeApiStatus(" Accepted "), "ACCEPTED");
  assert.equal(normalizeApiStatus(null), "");
});
