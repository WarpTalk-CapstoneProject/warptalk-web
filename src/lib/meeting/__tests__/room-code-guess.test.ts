import assert from "node:assert/strict";
import { test } from "node:test";

import { looksLikeRoomCode } from "../room-code-guess.ts";

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
