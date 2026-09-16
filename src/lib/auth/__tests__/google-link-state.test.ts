// Settings > Connected accounts: what the Google row may offer.
//
// The server refuses to unlink Google from an account with no password (MIN_AUTH_METHOD_REQUIRED).
// The page must refuse first, and must not read a missing field as "not linked".

import assert from "node:assert/strict";
import test from "node:test";

import { googleLinkState, UNLINK_NEEDS_PASSWORD_REASON } from "../google-link-state.ts";

test("an auth service that does not report link status is unknown, not 'not linked'", () => {
  // Reading absent as false would offer to link an account that is already linked.
  assert.deepEqual(googleLinkState({}), { kind: "unknown" });
  assert.deepEqual(googleLinkState(null), { kind: "unknown" });
  assert.deepEqual(googleLinkState(undefined), { kind: "unknown" });
  assert.deepEqual(googleLinkState({ googleLinked: null, hasPassword: true }), { kind: "unknown" });
});

test("not linked offers linking regardless of password", () => {
  assert.deepEqual(googleLinkState({ googleLinked: false, hasPassword: false }), { kind: "not-linked" });
  assert.deepEqual(googleLinkState({ googleLinked: false, hasPassword: true }), { kind: "not-linked" });
});

test("linked with a password may unlink", () => {
  assert.deepEqual(googleLinkState({ googleLinked: true, hasPassword: true }), {
    kind: "linked",
    canUnlink: true,
  });
});

test("linked with no password may not unlink — Google is the only way back in", () => {
  assert.deepEqual(googleLinkState({ googleLinked: true, hasPassword: false }), {
    kind: "linked",
    canUnlink: false,
    reason: UNLINK_NEEDS_PASSWORD_REASON,
  });
});

test("linked with password status unreported fails closed", () => {
  const state = googleLinkState({ googleLinked: true });
  assert.equal(state.kind, "linked");
  assert.equal(state.kind === "linked" && state.canUnlink, false);
});
