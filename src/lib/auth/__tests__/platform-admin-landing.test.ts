// Where a platform administrator lands after logging in.
//
// WT-376: both seeded admin accounts were sent to "Set up your workspace" and offered Join or
// Create — the product telling the people who run it that they had not started using it yet. The
// proxy decides that redirect before React mounts, so `useIsSystemAdmin` (which reads the auth
// store) could not answer; the role has to come off the token itself.
//
// The claim shape is the whole risk. ASP.NET writes roles under `role` or the long ClaimTypes.Role
// URI depending on whether the mapper was suppressed, and one role serialises as a bare string
// rather than an array. Each unread shape fails open into exactly the bug being fixed.

import assert from "node:assert/strict";
import test from "node:test";

import { getAccessTokenRoles, isPlatformAdminToken } from "../../api/token-lifecycle.ts";

/** A JWT with `payload` as its body. Unsigned — nothing here verifies signatures, by design. */
function tokenWith(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${body}.signature`;
}

test("a single role serialises as a bare string, not an array", () => {
  // The seeded admin accounts hold exactly one role, so this is the shape production sends —
  // and an implementation that only handled arrays would read [] for every real administrator.
  assert.equal(isPlatformAdminToken(tokenWith({ role: "admin" })), true);
});

test("several roles arrive as an array", () => {
  assert.equal(isPlatformAdminToken(tokenWith({ role: ["user", "admin"] })), true);
});

test("the long ClaimTypes.Role URI is read too", () => {
  const claim = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
  assert.equal(isPlatformAdminToken(tokenWith({ [claim]: "admin" })), true);
});

test("roles are matched case-insensitively", () => {
  assert.equal(isPlatformAdminToken(tokenWith({ role: "Admin" })), true);
});

test("an ordinary user is not a platform admin", () => {
  assert.equal(isPlatformAdminToken(tokenWith({ role: "user" })), false);
});

test("a workspace-scoped owner is not a platform admin", () => {
  // Workspace Owner/Admin are a different axis entirely. Confusing them would hand the platform
  // portal to anyone who created a workspace.
  assert.equal(isPlatformAdminToken(tokenWith({ role: "owner" })), false);
});

test("a token with no role claim at all is not an admin", () => {
  assert.equal(isPlatformAdminToken(tokenWith({ sub: "u1" })), false);
});

test("a malformed or missing token is not an admin rather than throwing", () => {
  // This runs in the proxy on every landing request. Throwing here would 500 the redirect for
  // everybody, which is a far worse failure than the one being fixed.
  assert.deepEqual(getAccessTokenRoles(null), []);
  assert.deepEqual(getAccessTokenRoles("not-a-jwt"), []);
  assert.deepEqual(getAccessTokenRoles("header.%%%not-base64%%%.sig"), []);
  assert.equal(isPlatformAdminToken(undefined), false);
});
