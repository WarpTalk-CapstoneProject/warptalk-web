import assert from "node:assert/strict";
import test from "node:test";
import { parseIntegerInRange } from "./settings-validation.ts";

test("accepts integer boundaries", () => {
  assert.deepEqual(parseIntegerInRange("1", 1, 500), { ok: true, value: 1 });
  assert.deepEqual(parseIntegerInRange("500", 1, 500), { ok: true, value: 500 });
});

test("rejects empty, decimal, and out-of-range values", () => {
  assert.equal(parseIntegerInRange("", 1, 500).ok, false);
  assert.equal(parseIntegerInRange("1.5", 1, 500).ok, false);
  assert.equal(parseIntegerInRange("0", 1, 500).ok, false);
  assert.equal(parseIntegerInRange("501", 1, 500).ok, false);
});
