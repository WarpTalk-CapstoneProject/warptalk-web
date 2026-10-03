import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { MENTION_BLURB_MAX_CHARS, mentionBlurb } from "../mention-blurb.ts";

describe("WarpBot @ menu — the hint beside a plugin", () => {
  test("keeps the first clause of a long catalog description", () => {
    assert.equal(
      mentionBlurb("Turn action items into Linear issues, and look up projects, cycles and documents."),
      "Turn action items into Linear issues",
    );
  });

  test("keeps the first sentence only", () => {
    assert.equal(mentionBlurb("Search your Drive. Read docs and sheets."), "Search your Drive");
  });

  test("stops at a dash or a colon", () => {
    assert.equal(mentionBlurb("Calendar — create and list events"), "Calendar");
    assert.equal(mentionBlurb("Meet: start a call"), "Meet");
  });

  test("a short description is shown as it is", () => {
    assert.equal(mentionBlurb("Create Google Meet links"), "Create Google Meet links");
  });

  test("a single long clause ends on a whole word", () => {
    const blurb = mentionBlurb(
      "Synchronise every customer conversation across every support inbox you own",
    );
    assert.ok(blurb.endsWith("…"));
    assert.ok(blurb.length <= MENTION_BLURB_MAX_CHARS + 1);
    assert.ok(!/\s…$/.test(blurb), "no dangling space before the ellipsis");
    assert.equal(blurb, "Synchronise every customer conversation…");
  });

  test("empty and missing descriptions give nothing to show", () => {
    assert.equal(mentionBlurb(""), "");
    assert.equal(mentionBlurb(null), "");
    assert.equal(mentionBlurb(undefined), "");
  });
});
