import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  parseRecipients,
  sendableRecipients,
  hasInvalid,
  describeInviteResult,
} from "../invite-recipients.ts";

describe("WT-552 — deciding who actually gets invited", () => {
  test("a pasted list arrives however the host's calendar formatted it", () => {
    const parsed = parseRecipients("a@x.com, b@x.com; c@x.com\nd@x.com");

    assert.deepEqual(sendableRecipients(parsed), [
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  test("somebody already on the roster is not invited again", () => {
    // The email reads as the meeting starting over, to somebody sitting in it.
    const parsed = parseRecipients("here@x.com, new@x.com", {
      participantEmails: ["HERE@x.com"],
    });

    assert.deepEqual(
      parsed.map((r) => r.state),
      ["already-in-room", "new"],
    );
    assert.deepEqual(sendableRecipients(parsed), ["new@x.com"]);
  });

  test("somebody already invited is reported, not re-sent", () => {
    const parsed = parseRecipients("pending@x.com", {
      invitedEmails: ["Pending@X.com"],
    });

    assert.equal(parsed[0].state, "already-invited");
    assert.deepEqual(sendableRecipients(parsed), []);
  });

  test("being in the room outranks having an invitation", () => {
    // Both are true of anybody who accepted. "Already here" is the useful half.
    const parsed = parseRecipients("both@x.com", {
      invitedEmails: ["both@x.com"],
      participantEmails: ["both@x.com"],
    });

    assert.equal(parsed[0].state, "already-in-room");
  });

  test("the same address twice in one paste is sent once", () => {
    const parsed = parseRecipients("dup@x.com, Dup@x.com");

    assert.deepEqual(
      parsed.map((r) => r.state),
      ["new", "duplicate"],
    );
    assert.deepEqual(sendableRecipients(parsed), ["dup@x.com"]);
  });

  test("a repeat of somebody already here is marked as the repeat, not listed twice", () => {
    // The duplicate check runs before the roster lookups. Reversed, the second copy reports
    // "Already here" again — two identical rows for one person, which reads as two people.
    const parsed = parseRecipients("here@x.com, here@x.com", {
      participantEmails: ["here@x.com"],
    });

    assert.deepEqual(
      parsed.map((r) => r.state),
      ["already-in-room", "duplicate"],
    );
  });

  test("a malformed entry blocks the send instead of being trimmed away", () => {
    // Silently dropping it is the dangerous version: the host never learns that the fifth
    // person on their list was not invited.
    const parsed = parseRecipients("good@x.com, notanemail");

    assert.equal(parsed[1].state, "invalid");
    assert.equal(hasInvalid(parsed), true);
  });

  test("a well-formed list does not block", () => {
    assert.equal(hasInvalid(parseRecipients("good@x.com, also@x.com")), false);
  });

  test("a malformed entry is never mistaken for one already invited", () => {
    const parsed = parseRecipients("nope", { invitedEmails: ["nope"] });

    assert.equal(parsed[0].state, "invalid");
  });

  test("an empty box sends nothing rather than an empty address", () => {
    assert.deepEqual(parseRecipients("   \n , ; "), []);
    assert.deepEqual(sendableRecipients(parseRecipients("")), []);
  });
});

describe("WT-552 — what the host is told afterwards", () => {
  test("the server's count is what is reported, not the list that was typed", () => {
    // The server de-duplicates against rows this client may not have refetched, so a request
    // for three can legitimately invite two.
    assert.equal(
      describeInviteResult(2, 3),
      "Invited 2 people. The rest were already invited.",
    );
  });

  test("nobody added is not a failure", () => {
    assert.equal(
      describeInviteResult(0, 1),
      "That person was already invited.",
    );
    assert.equal(
      describeInviteResult(0, 4),
      "Everyone on that list was already invited.",
    );
  });

  test("one person is a person", () => {
    assert.equal(describeInviteResult(1, 1), "Invited 1 person.");
    assert.equal(describeInviteResult(3, 3), "Invited 3 people.");
  });
});
