/**
 * WT-699 TC4101: a Failed announcement rendered with the same green badge as a Sent one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ANNOUNCEMENT_STATUS_CLASSES,
  announcementDeliveredCount,
  announcementStatusClasses,
  announcementStatusTone,
} from "../announcement-status.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("only Sent is green; Failed is destructive and Pending is neither", () => {
  assert.equal(announcementStatusTone("Sent"), "sent");
  assert.equal(announcementStatusTone("Failed"), "failed");
  assert.equal(announcementStatusTone("Pending"), "pending");
  assert.equal(announcementStatusTone("draft"), "draft");
  assert.equal(announcementStatusTone("Something new"), "unknown");
  assert.equal(announcementStatusTone(null), "unknown");

  assert.match(announcementStatusClasses("Sent"), /emerald/);
  for (const status of ["Failed", "Pending", "Draft", "Weird"]) {
    assert.doesNotMatch(announcementStatusClasses(status), /emerald/, `${status} must not be green`);
  }
  assert.match(announcementStatusClasses("Failed"), /destructive/);
  assert.equal(new Set(Object.values(ANNOUNCEMENT_STATUS_CLASSES)).size, 5);
});

test("the delivered count is shown only when the server sent one", () => {
  assert.equal(announcementDeliveredCount({ deliveredCount: 12 }), 12);
  assert.equal(announcementDeliveredCount({ deliveredCount: 0 }), 0);
  assert.equal(announcementDeliveredCount({}), null);
  assert.equal(announcementDeliveredCount({ deliveredCount: null }), null);
});

test("the list and the detail page both read status, sent time and count through it", () => {
  const list = read("../../../app/(app)/admin/announcements/page.tsx");
  const detail = read("../../../app/(app)/admin/announcements/[id]/page.tsx");
  for (const [name, source] of [["list", list], ["detail", detail]] as const) {
    assert.match(source, /announcementStatusClasses\(/, `${name} uses the shared status tone`);
    assert.match(source, /\.sentAt/, `${name} shows when it was sent`);
    assert.match(source, /announcementDeliveredCount\(/, `${name} shows how many received it`);
  }
  assert.doesNotMatch(list, /isDraft\s*\?/, "the list must not paint everything that is not a draft green");
});
