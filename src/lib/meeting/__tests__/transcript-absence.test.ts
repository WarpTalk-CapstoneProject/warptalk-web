import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  describeTranscriptAbsence,
  transcriptAbsenceMessage,
} from "../transcript-absence.ts";

describe("WT-516 — why the Transcript tab is empty", () => {
  test("a readable transcript needs no explanation", () => {
    assert.equal(
      describeTranscriptAbsence({ lineCount: 82, isEnded: true }),
      null,
    );
  });

  test("a refused read is withheld, not missing — the reported bug", () => {
    // A workspace member who never attended read "No transcript was captured for this meeting"
    // while 82 saved lines sat in the database and the host was looking at them.
    assert.equal(
      describeTranscriptAbsence({ lineCount: 0, isEnded: true, errorCode: "FORBIDDEN" }),
      "withheld",
    );
    assert.equal(
      describeTranscriptAbsence({ lineCount: 0, isEnded: true, errorCode: 403 }),
      "withheld",
    );
  });

  test("a refusal outranks the meeting still running", () => {
    // A refusal is a definite answer; it does not become less true mid-meeting.
    assert.equal(
      describeTranscriptAbsence({ lineCount: 0, isEnded: false, errorCode: "FORBIDDEN" }),
      "withheld",
    );
  });

  test("any other failure must not claim the meeting was silent", () => {
    // The whole point: "no transcript was captured" is a claim about the MEETING. A failed
    // request cannot support it.
    for (const code of ["INTERNAL_ERROR", "NOT_FOUND", 500, 502]) {
      assert.equal(
        describeTranscriptAbsence({ lineCount: 0, isEnded: true, errorCode: code }),
        "unavailable",
        `code ${code} must not read as an empty meeting`,
      );
    }
  });

  test("a request still in flight has not failed", () => {
    // And a stale error from a previous attempt must not be painted over a load in progress.
    assert.equal(
      describeTranscriptAbsence({
        lineCount: 0,
        isEnded: true,
        isLoading: true,
        errorCode: "INTERNAL_ERROR",
      }),
      "not-yet",
    );
  });

  test("a running meeting is not yet, not empty", () => {
    assert.equal(
      describeTranscriptAbsence({ lineCount: 0, isEnded: false }),
      "not-yet",
    );
  });

  test("only a successful answer of zero may say the meeting was silent", () => {
    assert.equal(
      describeTranscriptAbsence({ lineCount: 0, isEnded: true }),
      "none",
    );
    assert.equal(
      describeTranscriptAbsence({ lineCount: 0, isEnded: true, errorCode: null }),
      "none",
    );
  });
});

describe("WT-516 — what each state says", () => {
  test("the withheld message names who can grant access", () => {
    const message = transcriptAbsenceMessage("withheld");
    assert.match(message, /host/i);
    // Must not tell the reader the meeting produced nothing.
    assert.doesNotMatch(message, /no transcript was captured/i);
  });

  test("unavailable never claims the meeting was silent", () => {
    assert.doesNotMatch(transcriptAbsenceMessage("unavailable"), /no transcript was captured/i);
  });

  test("only `none` makes the claim about the meeting", () => {
    assert.match(transcriptAbsenceMessage("none"), /no transcript was captured/i);
  });

  test("every state has its own sentence", () => {
    const states = ["withheld", "unavailable", "not-yet", "none"] as const;
    const said = states.map(transcriptAbsenceMessage);
    assert.equal(new Set(said).size, states.length, "two states must not share a message");
  });
});
