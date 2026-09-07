import assert from "node:assert/strict";
import { test } from "node:test";

import { initialTermsSchema, termRowsToImport } from "../initial-terms.ts";

const row = (sourceTerm: string, targetTerm: string) => ({ sourceTerm, targetTerm });

// ── what the schema accepts ──────────────────────────────────────────────────

test("a complete pair is accepted", () => {
  assert.equal(initialTermsSchema.safeParse([row("runway", "đường băng")]).success, true);
});

test("a wholly empty row is accepted — it is the blank the dialog opens with", () => {
  assert.equal(initialTermsSchema.safeParse([row("", "")]).success, true);
});

test("no rows at all is accepted", () => {
  assert.equal(initialTermsSchema.safeParse([]).success, true);
});

// ── what it refuses, and where it points ─────────────────────────────────────

test("a term with no translation is refused, on the translation", () => {
  const result = initialTermsSchema.safeParse([row("runway", "")]);
  assert.equal(result.success, false);
  assert.deepEqual(result.error!.issues[0].path, [0, "targetTerm"]);
});

test("a translation with no term is refused, on the term", () => {
  const result = initialTermsSchema.safeParse([row("", "đường băng")]);
  assert.equal(result.success, false);
  assert.deepEqual(result.error!.issues[0].path, [0, "sourceTerm"]);
});

test("whitespace is not a value: a row of spaces is empty, not half-filled", () => {
  assert.equal(initialTermsSchema.safeParse([row("   ", "  ")]).success, true);
});

test("a term with only whitespace opposite it is still half a row", () => {
  assert.equal(initialTermsSchema.safeParse([row("runway", "   ")]).success, false);
});

test("the error names the row it belongs to, not just the first", () => {
  const result = initialTermsSchema.safeParse([
    row("runway", "đường băng"),
    row("", ""),
    row("taxiway", ""),
  ]);
  assert.equal(result.success, false);
  assert.deepEqual(result.error!.issues[0].path, [2, "targetTerm"]);
});

// ── what gets sent ───────────────────────────────────────────────────────────

test("blank rows are dropped rather than sent", () => {
  assert.deepEqual(
    termRowsToImport([row("runway", "đường băng"), row("", ""), row("  ", "")]),
    [{ sourceTerm: "runway", targetTerm: "đường băng" }],
  );
});

test("terms are trimmed — ' CEO ' and 'CEO' are one term to a person", () => {
  assert.deepEqual(termRowsToImport([row("  CEO  ", "  giám đốc  ")]), [
    { sourceTerm: "CEO", targetTerm: "giám đốc" },
  ]);
});

test("nothing typed means nothing sent, so no import request is made", () => {
  assert.equal(termRowsToImport([row("", ""), row("", "")]).length, 0);
});

test("order is kept", () => {
  const sent = termRowsToImport([row("a", "1"), row("", ""), row("b", "2"), row("c", "3")]);
  assert.deepEqual(
    sent.map((r) => r.sourceTerm),
    ["a", "b", "c"],
  );
});
