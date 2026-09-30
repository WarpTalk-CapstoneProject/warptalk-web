import assert from "node:assert/strict";
import { test } from "node:test";

import {
  browserSessionId,
  byPlacement,
  firstSighting,
  SESSION_STORAGE_KEY,
  TOAST_LIMIT,
  visibleNow,
} from "../viewer-placements.ts";

const item = (id: string, placement: string, priority = 0, startsAt: string | null = null) => ({
  id,
  placement,
  priority,
  startsAt,
  publishedAt: "2026-09-01T00:00:00Z",
});

test("every placement the CMS offers has a surface, and an unknown one falls back to the banner", () => {
  const groups = byPlacement([
    item("a", "TOP_BANNER"),
    item("b", "MODAL"),
    item("c", "TOAST"),
    item("d", "NOTIFICATION_CENTER"),
    item("e", "DASHBOARD_CARD"),
    item("f", "SIDEBAR"),
  ]);
  assert.deepEqual(groups.TOP_BANNER.map((x) => x.id), ["a", "f"]);
  assert.deepEqual(groups.MODAL.map((x) => x.id), ["b"]);
  assert.deepEqual(groups.TOAST.map((x) => x.id), ["c"]);
  assert.deepEqual(groups.NOTIFICATION_CENTER.map((x) => x.id), ["d"]);
  assert.deepEqual(groups.DASHBOARD_CARD.map((x) => x.id), ["e"]);
});

test("higher priority comes first, then the newest start", () => {
  const groups = byPlacement([
    item("low", "TOP_BANNER", 1),
    item("old", "TOP_BANNER", 5, "2026-09-01T00:00:00Z"),
    item("new", "TOP_BANNER", 5, "2026-09-10T00:00:00Z"),
  ]);
  assert.deepEqual(groups.TOP_BANNER.map((x) => x.id), ["new", "old", "low"]);
});

test("one modal at a time, a capped toast stack, and what was closed stays closed", () => {
  const items = [item("m1", "MODAL", 9), item("m2", "MODAL", 1), item("t1", "TOAST"), item("t2", "TOAST"), item("t3", "TOAST")];
  const first = visibleNow(items, new Set());
  assert.equal(first.modal?.id, "m1");
  assert.equal(first.toasts.length, TOAST_LIMIT);
  const after = visibleNow(items, new Set(["m1", "t1"]));
  assert.equal(after.modal?.id, "m2");
  assert.deepEqual(after.toasts.map((x) => x.id), ["t2", "t3"]);
});

test("the session id is reused for the tab and replaced when missing or malformed", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const id = browserSessionId(storage, () => "0f3c2a1e-aaaa-bbbb-cccc-1234567890ab");
  assert.equal(id, "0f3c2a1e-aaaa-bbbb-cccc-1234567890ab");
  assert.equal(browserSessionId(storage, () => "other-random-id"), id);
  store.set(SESSION_STORAGE_KEY, "<script>");
  assert.equal(browserSessionId(storage, () => "fresh-session-id"), "fresh-session-id");
  const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => undefined };
  assert.equal(browserSessionId(throwing, () => "memory-only-id"), "memory-only-id");
});

test("an impression is recorded once per page load", () => {
  const seen = new Set<string>();
  assert.equal(firstSighting(seen, "a"), true);
  assert.equal(firstSighting(seen, "a"), false);
});
