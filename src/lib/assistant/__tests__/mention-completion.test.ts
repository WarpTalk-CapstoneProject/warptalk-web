import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { mentionCompletion } from "../mention-completion.ts";

describe("WarpBot composer — Tab completion for @mentions", () => {
  test("offers the rest of the highlighted name", () => {
    assert.equal(
      mentionCompletion({
        draft: "tao 1 cuoc hop tren google meet cho toi @googl",
        query: "googl",
        highlightedTitle: "Google Meet",
      }),
      "e Meet",
    );
  });

  test("matches case-insensitively and keeps the option's casing for the untyped part", () => {
    assert.equal(
      mentionCompletion({ draft: "@GOOGL", query: "GOOGL", highlightedTitle: "Google Meet" }),
      "e Meet",
    );
  });

  test("a substring match highlights but completes nothing", () => {
    // The menu filters on `includes`; Tab can only finish a prefix.
    assert.equal(
      mentionCompletion({ draft: "@meet", query: "meet", highlightedTitle: "Google Meet" }),
      "",
    );
  });

  test("a bare @ offers nothing", () => {
    assert.equal(
      mentionCompletion({ draft: "hi @", query: "", highlightedTitle: "Google Meet" }),
      "",
    );
  });

  test("nothing when the caret is not at the end of the draft", () => {
    assert.equal(
      mentionCompletion({
        draft: "@googl and then more",
        query: "googl",
        highlightedTitle: "Google Meet",
      }),
      "",
    );
  });

  test("nothing when nothing is highlighted", () => {
    assert.equal(
      mentionCompletion({ draft: "@zzz", query: "zzz", highlightedTitle: undefined }),
      "",
    );
  });

  test("a fully typed name offers an empty completion", () => {
    assert.equal(
      mentionCompletion({ draft: "@Alice", query: "Alice", highlightedTitle: "Alice" }),
      "",
    );
  });
});
