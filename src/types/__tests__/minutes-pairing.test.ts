/**
 * When a translated line may be printed beside the original it translates.
 *
 * The same cases as MinutesBilingualPairingTests in warptalk-backend/translation-room. The rule is
 * implemented twice — once for the panel, once for the .docx — so it is pinned twice, because the
 * failure that matters is not "no pairing" but a pairing that is WRONG: on a signed document that
 * attributes a decision to something nobody decided.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { counterpartOf, pairByCitation } from "../meetingMinutes.ts";
import type { MinutesItem, MinutesSection } from "../meetingMinutes.ts";

const item = (text: string, atMs: number | null): MinutesItem => ({ text, atMs });

test("items citing the same moment are paired regardless of order", () => {
  const pairs = pairByCitation(
    [item("Ship on Friday", 2000), item("Freeze the schema", 1000)],
    [item("Đóng băng schema", 1000), item("Phát hành thứ Sáu", 2000)],
  );

  assert.ok(pairs);
  assert.equal(pairs.length, 2);
  // Order follows the ORIGINAL, and each line meets the translation citing its own moment.
  assert.equal(pairs[0].original.text, "Ship on Friday");
  assert.equal(pairs[0].translated.text, "Phát hành thứ Sáu");
  assert.equal(pairs[1].translated.text, "Đóng băng schema");
});

test("position is never evidence of correspondence", () => {
  // Same count, same order, no citations. Index would "work" here and would be a guess.
  assert.equal(
    pairByCitation(
      [item("Ship on Friday", null), item("Freeze the schema", null)],
      [item("Phát hành thứ Sáu", null), item("Đóng băng schema", null)],
    ),
    null,
  );
});

test("one unmatched original refuses the whole section", () => {
  assert.equal(
    pairByCitation(
      [item("Ship on Friday", 1000), item("Freeze the schema", 2000)],
      [item("Phát hành thứ Sáu", 1000)],
    ),
    null,
  );
});

test("a repeated citation on either side is not a join key", () => {
  assert.equal(
    pairByCitation([item("A", 1000), item("B", 1000)], [item("A-vi", 1000), item("B-vi", 1000)]),
    null,
  );
});

test("an original with no citation cannot be paired", () => {
  assert.equal(
    pairByCitation(
      [item("Ship on Friday", 1000), item("Freeze the schema", null)],
      [item("Phát hành thứ Sáu", 1000), item("Đóng băng schema", 2000)],
    ),
    null,
  );
});

test("extra translated lines are tolerated when every original still matches", () => {
  const pairs = pairByCitation(
    [item("Ship on Friday", 1000)],
    [item("Phát hành thứ Sáu", 1000), item("Thừa", 9000)],
  );

  assert.ok(pairs);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].translated.text, "Phát hành thứ Sáu");
});

test("nothing to pair against is not a pairing", () => {
  assert.equal(pairByCitation([item("Ship on Friday", 1000)], null), null);
  assert.equal(pairByCitation([item("Ship on Friday", 1000)], []), null);
  assert.equal(pairByCitation(null, [item("Ship on Friday", 1000)]), null);
});

test("sections are matched by key, not by position", () => {
  const section: MinutesSection = { key: "decisions", kind: "items" };
  const translated: MinutesSection[] = [
    { key: "actionItems", kind: "items" },
    { key: "decisions", kind: "items", text: "found" },
  ];

  assert.equal(counterpartOf(section, translated)?.text, "found");
});

test("a section with no translated counterpart is undefined", () => {
  // A template section the summary worker never translates — "problems", "options" — must read as
  // absent rather than as an empty translation.
  const section: MinutesSection = { key: "problems", kind: "items" };

  assert.equal(counterpartOf(section, [{ key: "decisions", kind: "items" }]), undefined);
  assert.equal(counterpartOf(section, null), undefined);
});
