import test from "node:test";
import assert from "node:assert/strict";

import {
  isLiveMeetingPath,
  liveMeetingPath,
  readScheduleFocus,
  roomDetailPath,
  roomWaitingPath,
  schedulesPath,
  withScheduleFocus,
} from "../workspace-routes.ts";

test("every workspace path carries the slug", () => {
  assert.equal(liveMeetingPath("acme", "r1"), "/acme/rooms/r1/live");
  assert.equal(roomDetailPath("acme", "r1"), "/acme/rooms/r1");
  assert.equal(roomWaitingPath("acme", "r1"), "/acme/rooms/r1/waiting");
});

test("the live meeting sits beside waiting and ended, not at the root", () => {
  // The complaint: app.warptalk.io.vn/room/019fe5fc-… told you nothing about which
  // workspace the meeting belonged to.
  assert.ok(!liveMeetingPath("acme", "r1").startsWith("/room/"));
});

test("with no slug, callers are sent through the forwarding path", () => {
  // Not a guess at the slug and not a refusal to navigate: /room/{id} still exists and
  // redirects using the workspace the user already has open.
  assert.equal(liveMeetingPath(null, "r1"), "/room/r1");
  assert.equal(liveMeetingPath(undefined, "r1"), "/room/r1");
  assert.equal(liveMeetingPath("   ", "r1"), "/room/r1");
});

test("the shell recognises the live meeting at either address", () => {
  // This answer decides whether the dock floats. A false negative floats the minimised
  // window on top of the meeting it is a copy of.
  assert.equal(isLiveMeetingPath("/acme/rooms/r1/live"), true);
  assert.equal(isLiveMeetingPath("/acme/rooms/r1/live/"), true);
  assert.equal(isLiveMeetingPath("/room/r1"), true);
});

test("the calendar deep link carries the booked day and the room", () => {
  const href = withScheduleFocus(schedulesPath("acme"), {
    date: new Date(2026, 8, 18, 1, 30),
    roomId: "r1",
  });
  assert.equal(href, "/acme/schedules?date=2026-09-18&focus=r1");
});

test("the deep link's day is the local day, not the UTC one", () => {
  // 00:30 local is still "yesterday" in UTC for everyone east of Greenwich; toISOString() would
  // open the calendar on the wrong day, and on the 1st in the wrong month.
  const href = withScheduleFocus("/acme/schedules", { date: new Date(2026, 9, 1, 0, 30) });
  assert.equal(href, "/acme/schedules?date=2026-10-01");
});

test("a deep link with nothing to say leaves the path alone", () => {
  assert.equal(withScheduleFocus("/acme/schedules", {}), "/acme/schedules");
  assert.equal(
    withScheduleFocus("/acme/schedules", { date: new Date(Number.NaN), roomId: "  " }),
    "/acme/schedules",
  );
  assert.equal(withScheduleFocus("/acme/schedules", { roomId: "r1" }), "/acme/schedules?focus=r1");
});

test("the calendar reads back exactly what the link wrote", () => {
  const focus = readScheduleFocus(new URLSearchParams("date=2026-09-18&focus=r1"));
  assert.ok(focus);
  assert.equal(focus.roomId, "r1");
  assert.ok(focus.date);
  assert.equal(focus.date.getFullYear(), 2026);
  assert.equal(focus.date.getMonth(), 8);
  assert.equal(focus.date.getDate(), 18);
  assert.equal(focus.date.getHours(), 0);
});

test("a malformed day is dropped, not rolled over into another month", () => {
  assert.deepEqual(readScheduleFocus(new URLSearchParams("date=2026-02-30&focus=r1")), {
    date: null,
    roomId: "r1",
  });
  assert.equal(readScheduleFocus(new URLSearchParams("date=2026-13-01")), null);
  assert.equal(readScheduleFocus(new URLSearchParams("date=18/09/2026")), null);
});

test("a URL with no deep link reads as none", () => {
  assert.equal(readScheduleFocus(new URLSearchParams("")), null);
  assert.equal(readScheduleFocus(new URLSearchParams("focus=%20")), null);
  assert.equal(readScheduleFocus(null), null);
});

test("the rooms around it are not the live meeting", () => {
  for (const path of [
    "/acme/rooms/r1",
    "/acme/rooms/r1/waiting",
    "/acme/rooms/r1/ended",
    "/acme/rooms/r1/artifacts",
    "/acme/rooms",
    "/acme/home",
  ]) {
    assert.equal(isLiveMeetingPath(path), false, `${path} was taken for the live meeting`);
  }
});
