import assert from "node:assert/strict";
import { test } from "node:test";

import { getMessageFallback, mergeWithFallback } from "../message-fallback.ts";

test("a key missing from the active locale falls back to the English message", () => {
  const en = { nav: { home: "Home", insights: "Insights" }, only: "English only" };
  const vi = { nav: { home: "Trang chủ" } };
  const merged = mergeWithFallback(en, vi);
  assert.deepEqual(merged, {
    nav: { home: "Trang chủ", insights: "Insights" },
    only: "English only",
  });
  // The inputs are left alone: the English catalog is shared across requests.
  assert.equal(en.nav.home, "Home");
});

test("the active locale wins wherever it has a value", () => {
  assert.deepEqual(mergeWithFallback({ a: "A", b: { c: "C" } }, { a: "á", b: { c: "ć" } }), {
    a: "á",
    b: { c: "ć" },
  });
});

test("a key missing everywhere renders a readable label, never the dotted path", () => {
  assert.equal(getMessageFallback({ namespace: "common.sidebar", key: "adminNav.items.billingLedger" }), "Billing ledger");
  assert.equal(getMessageFallback({ key: "save" }), "Save");
  assert.equal(getMessageFallback({ key: "api_key" }), "Api key");
  assert.doesNotMatch(getMessageFallback({ namespace: "a.b", key: "c.d" }), /\./);
});
