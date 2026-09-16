import assert from "node:assert/strict";
import test from "node:test";

import { correctionAuthorName, sortCorrectionsNewestFirst } from "../correction-history.ts";

function revision(id: string, createdAt: string) {
  return { id, userId: "u1", originalText: "before", correctedText: "after", createdAt };
}

test("the history reads newest first, whatever order the server returned", () => {
  const sorted = sortCorrectionsNewestFirst([
    revision("a", "2026-09-01T10:00:00Z"),
    revision("c", "2026-09-01T12:00:00Z"),
    revision("b", "2026-09-01T11:00:00Z"),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["c", "b", "a"],
  );
});

test("sorting does not mutate the server's list", () => {
  const original = [revision("a", "2026-09-01T10:00:00Z"), revision("b", "2026-09-01T11:00:00Z")];
  sortCorrectionsNewestFirst(original);
  assert.deepEqual(
    original.map((item) => item.id),
    ["a", "b"],
  );
});

test("a tie or an unparseable date still gives a stable order", () => {
  const sameInstant = sortCorrectionsNewestFirst([
    revision("x", "2026-09-01T10:00:00Z"),
    revision("y", "2026-09-01T10:00:00Z"),
  ]);
  assert.deepEqual(sameInstant.map((item) => item.id), ["y", "x"]);

  const junk = sortCorrectionsNewestFirst([revision("m", "not a date"), revision("n", "")]);
  assert.deepEqual(junk.map((item) => item.id), ["n", "m"]);
});

test("the editor is named from the member directory, and the reader is You", () => {
  const directory = { "u-host": { fullName: "Huỳnh Thái Tú" }, "u-blank": { fullName: "  " } };

  assert.equal(correctionAuthorName("u-host", "u-me", directory), "Huỳnh Thái Tú");
  assert.equal(correctionAuthorName("u-me", "u-me", directory), "You");
  // Somebody who has since left the workspace has no row. Do not print their id.
  assert.equal(correctionAuthorName("u-gone", "u-me", directory), "Unknown editor");
  assert.equal(correctionAuthorName("u-blank", "u-me", directory), "Unknown editor");
  assert.equal(correctionAuthorName(null, "u-me", directory), "Unknown editor");
  assert.equal(correctionAuthorName("u-host", undefined, undefined), "Unknown editor");
});
