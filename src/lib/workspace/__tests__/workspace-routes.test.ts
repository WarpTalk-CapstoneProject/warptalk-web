import test from "node:test";
import assert from "node:assert/strict";

import {
  isLiveMeetingPath,
  liveMeetingPath,
  roomDetailPath,
  roomWaitingPath,
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
