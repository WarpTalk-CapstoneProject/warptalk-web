import assert from "node:assert/strict";
import { test } from "node:test";

import { looksLikeRoomCode, looksLikeRoomId } from "../room-code-guess.ts";

/**
 * This decides whether the palette offers "Join meeting <code>" above the navigation results.
 * It is deliberately loose — the join screen is what actually validates a code — so these
 * cases pin the two ways loose can go wrong: refusing a real code, and offering to join on
 * something that is plainly a search phrase.
 */

test("accepts the room codes the generator actually produces", () => {
  for (const code of ["xjm-fgcz-gbd", "frq-orjh-gix", "abc1-def2-ghi3"]) {
    assert.equal(looksLikeRoomCode(code), true, code);
  }
});

test("accepts a pasted code with surrounding whitespace", () => {
  assert.equal(looksLikeRoomCode("  xjm-fgcz-gbd \n"), true);
});

test("does not offer to join on ordinary search phrases", () => {
  // Anything with a space is someone looking for a page, not pasting a code.
  for (const phrase of ["voice profiles", "create room", "billing history"]) {
    assert.equal(looksLikeRoomCode(phrase), false, phrase);
  }
});

test("rejects fragments too short to be a code", () => {
  for (const value of ["", "a", "abc"]) {
    assert.equal(looksLikeRoomCode(value), false, JSON.stringify(value));
  }
});

test("rejects anything carrying path or query syntax", () => {
  // A pasted URL must not be treated as a code and re-encoded into ?code=, which would
  // produce a join attempt against a string that was never a room code.
  for (const value of ["/rooms/abc", "join?code=abc", "https://app.warptalk.io.vn"]) {
    assert.equal(looksLikeRoomCode(value), false, value);
  }
});

test("rejects a leading dash so a typo does not look joinable", () => {
  assert.equal(looksLikeRoomCode("-abc-def"), false);
});

// ── looksLikeRoomId — WT-528 ───────────────────────────────────────────────────────────────

test("recognises the room ids the API actually issues", () => {
  // uuid v7 (what the backend mints) and v4, both cases.
  for (const value of [
    "01a01542-874f-7971-b0ff-1dca73667d6e",
    "01A01542-874F-7971-B0FF-1DCA73667D6E",
    "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  ]) {
    assert.equal(looksLikeRoomId(value), true, value);
  }
});

test("does not mistake a room code for a room id", () => {
  // The case the ticket was about: `/rooms/spa-lyec-jga` reached a page that reads its segment
  // as an id, and reported the room as inaccessible rather than the link as stale.
  for (const value of ["spa-lyec-jga", "syo-kpru-lag", "abc-defg-hij"]) {
    assert.equal(looksLikeRoomId(value), false, value);
  }
});

test("is not the negation of looksLikeRoomCode", () => {
  // Both return true for a uuid, which is exactly why the loose code test cannot be inverted
  // to answer this question.
  const id = "01a01542-874f-7971-b0ff-1dca73667d6e";
  assert.equal(looksLikeRoomCode(id), true);
  assert.equal(looksLikeRoomId(id), true);
});

test("rejects a truncated or padded id rather than guessing", () => {
  for (const value of [
    "01a01542-874f-7971-b0ff-1dca73667d6",
    "01a01542-874f-7971-b0ff-1dca73667d6ee",
    "01a01542874f7971b0ff1dca73667d6e",
    "",
  ]) {
    assert.equal(looksLikeRoomId(value), false, JSON.stringify(value));
  }
});
