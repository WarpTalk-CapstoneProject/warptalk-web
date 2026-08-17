import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreateWorkspacePayload,
  canFoundWorkspace,
} from "../create-workspace-payload.ts";

/**
 * WT-418 — a Gmail account may found a workspace.
 *
 * The rule was relaxed in three places and missed in two, both in the same submit handler: the
 * guard read a helper that returns null for a public domain by design, and the payload asked to
 * verify the account's own domain unconditionally. Two dead ends in a row, behind a button that
 * had already been fixed to enable.
 */

test("a public-domain account may found a workspace", () => {
  // The bug, at its simplest. The button enabled and the form then refused, because the guard
  // asked for a BUSINESS domain while the button asked for a valid one.
  assert.equal(canFoundWorkspace("someone@gmail.com"), true);
});

test("a business account still may, obviously", () => {
  assert.equal(canFoundWorkspace("someone@acme.com"), true);
});

test("an unparseable address is the one case that is blocked", () => {
  assert.equal(canFoundWorkspace("not-an-email"), false);
  assert.equal(canFoundWorkspace(""), false);
  assert.equal(canFoundWorkspace(null), false);
  assert.equal(canFoundWorkspace(undefined), false);
});

test("a Gmail workspace claims no domain", () => {
  // The second dead end. Asking to verify gmail.com is the one thing the server MUST refuse —
  // verifying it would make every Gmail address on the platform Internal to this workspace.
  const payload = buildCreateWorkspacePayload("someone@gmail.com", { name: "Side Project" });

  assert.deepEqual(payload?.verifiedDomains, []);
  assert.equal(payload?.requireVerifiedDomainForInternal, false);
});

test("a business workspace still claims its own domain", () => {
  // The negative control. Fixing Gmail must not quietly stop corporate workspaces from getting
  // the Internal tier they are the whole point of.
  const payload = buildCreateWorkspacePayload("someone@acme.com", { name: "Acme" });

  assert.deepEqual(payload?.verifiedDomains, ["acme.com"]);
  assert.equal(payload?.requireVerifiedDomainForInternal, true);
});

test("requireVerifiedDomainForInternal is never true without a domain to verify", () => {
  // Sending true with an empty list is not merely pointless: the server reads it as "verify my
  // own domain", which is exactly how a Gmail account reached CannotVerifyPublicDomain.
  for (const email of ["a@gmail.com", "b@outlook.com", "c@proton.me", "d@icloud.com"]) {
    const payload = buildCreateWorkspacePayload(email, { name: "X" });
    assert.equal(
      payload?.requireVerifiedDomainForInternal && payload.verifiedDomains.length === 0,
      false,
      `${email} asked to verify a domain it does not have`,
    );
  }
});

test("an unparseable address produces no payload rather than a broken one", () => {
  assert.equal(buildCreateWorkspacePayload("nope", { name: "X" }), null);
});

test("the name and logo are trimmed, and a blank logo becomes null", () => {
  const payload = buildCreateWorkspacePayload("a@acme.com", { name: "  Acme  ", logoUrl: "   " });

  assert.equal(payload?.name, "Acme");
  assert.equal(payload?.logoUrl, null);
});

test("an uppercase address resolves to the same lowercase domain", () => {
  const payload = buildCreateWorkspacePayload("Someone@ACME.com", { name: "Acme" });
  assert.deepEqual(payload?.verifiedDomains, ["acme.com"]);
});
