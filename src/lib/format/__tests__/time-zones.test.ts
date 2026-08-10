import assert from "node:assert/strict";
import { test } from "node:test";

import {
  browserTimeZone,
  canonicalTimeZone,
  describeTimeZone,
  isSameTimeZone,
  supportedTimeZones,
} from "../time-zones.ts";

/**
 * The workspace timezone picker used to be four hand-written options with "(+7)" and "(-5)"
 * spelled out beside them. These pin the three ways that goes wrong: a list too short to hold
 * the customer, an offset that is only right for part of the year, and — the one that bit —
 * a stored value the platform spells differently from the list it generates.
 */

test("offers far more than the four zones that were hardcoded", () => {
  const zones = supportedTimeZones();
  assert.ok(zones.length > 50, `expected a real IANA list, got ${zones.length}`);
  for (const zone of ["Europe/London", "America/New_York"]) {
    assert.ok(zones.includes(zone), `${zone} must be offerable`);
  }
});

test("Asia/Ho_Chi_Minh and Asia/Saigon are one place under two spellings", () => {
  // The accounts DB defaults every user to Asia/Ho_Chi_Minh; this platform's zone list carries
  // only Asia/Saigon. Comparing the two as strings is how a stored setting goes missing.
  assert.ok(isSameTimeZone("Asia/Ho_Chi_Minh", "Asia/Saigon"));
  assert.equal(canonicalTimeZone("Asia/Ho_Chi_Minh"), canonicalTimeZone("Asia/Saigon"));
});

test("a stored zone the platform spells differently is still offered", () => {
  // THE regression this file exists for. Without `include`, the picker built from the platform
  // list would not contain the value nearly every account already holds, and would render as
  // though nothing were selected — losing the setting on the next save.
  const zones = supportedTimeZones("Asia/Ho_Chi_Minh");
  assert.ok(
    zones.some((zone) => isSameTimeZone(zone, "Asia/Ho_Chi_Minh")),
    "the stored zone must survive into the control that edits it",
  );
});

test("a stored zone already in the list is not offered twice under both spellings", () => {
  const zones = supportedTimeZones("Asia/Saigon");
  const vietnam = zones.filter((zone) => isSameTimeZone(zone, "Asia/Saigon"));
  assert.equal(vietnam.length, 1, `expected one Vietnam entry, got ${vietnam.join(", ")}`);
});

test("an unrecognised stored value is not treated as equal to everything", () => {
  assert.equal(canonicalTimeZone("Not/AZone"), null);
  assert.ok(!isSameTimeZone("Not/AZone", "Asia/Saigon"));
  assert.ok(!isSameTimeZone("Not/AZone", "Other/Nonsense"));
});

test("always offers UTC, which some platforms omit from the IANA list", () => {
  assert.ok(supportedTimeZones().includes("UTC"));
});

test("returns no duplicates, so the picker cannot render the same zone twice", () => {
  const zones = supportedTimeZones();
  assert.equal(new Set(zones).size, zones.length);
});

test("reads the offset from the zone rather than from a label", () => {
  // Vietnam does not observe DST, so this one is stable year-round.
  assert.match(describeTimeZone("Asia/Ho_Chi_Minh", new Date("2026-01-15T00:00:00Z")), /\+07:00/);
});

test("a DST zone reads differently in winter and in summer", () => {
  // The bug the old "(-5)" label had: correct in January, an hour off from March to November.
  const winter = describeTimeZone("America/New_York", new Date("2026-01-15T12:00:00Z"));
  const summer = describeTimeZone("America/New_York", new Date("2026-07-15T12:00:00Z"));
  assert.match(winter, /-05:00/);
  assert.match(summer, /-04:00/);
  assert.notEqual(winter, summer);
});

test("underscores are not shown to a human", () => {
  assert.ok(!describeTimeZone("Asia/Ho_Chi_Minh").includes("_"));
});

test("an unknown zone degrades to its own name instead of throwing", () => {
  assert.equal(describeTimeZone("Not/AZone"), "Not/AZone");
});

test("the browser zone is a zone or an admission that there is none", () => {
  const zone = browserTimeZone();
  assert.ok(zone === null || (typeof zone === "string" && zone.length > 0));
});
