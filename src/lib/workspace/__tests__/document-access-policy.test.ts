import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCUMENT_PERMISSIONS,
  isExternalViewPolicy,
  isMembershipPolicy,
  isUserPolicy,
  policyPermission,
} from "../document-access-policy.ts";

test("recognises the persisted external view policy regardless of API casing", () => {
  assert.equal(
    isExternalViewPolicy({
      subjectType: "MembershipType",
      subjectKey: "External",
      permission: "view",
      effect: "ALLOW",
    }),
    true,
  );
});

test("does not treat another membership policy as external view access", () => {
  assert.equal(
    isExternalViewPolicy({
      subjectType: "MembershipType",
      subjectKey: "Internal",
      permission: "view",
      effect: "ALLOW",
    }),
    false,
  );
});

test("serves every permission the server implements", () => {
  // If the server grows a fourth, this is the line that should fail first — the panel renders one
  // tab per entry, so a permission missing here is one no screen can reach, which is the exact
  // defect this module was widened to remove.
  assert.deepEqual([...DOCUMENT_PERMISSIONS], ["view", "download", "ai_retrieval"]);
});

test("names a permission whatever spelling the row arrived in", () => {
  assert.equal(policyPermission({ permission: "AI_Retrieval" }), "ai_retrieval");
  assert.equal(policyPermission({ permission: " Download " }), "download");
});

test("refuses to name a permission it does not serve", () => {
  // Null, not a `view` fallback. A row rendered as a view rule that is actually something else
  // would offer a Remove button that takes away a different grant than the chip claims.
  assert.equal(policyPermission({ permission: "print" }), null);
  assert.equal(policyPermission({ permission: null }), null);
});

test("separates a user's rules by permission", () => {
  const denyAi = {
    subjectType: "User",
    subjectId: "u1",
    permission: "ai_retrieval",
    effect: "DENY",
  };

  assert.equal(isUserPolicy(denyAi, "ai_retrieval", "deny"), true);
  // The same person, the same effect, a different permission: not this rule.
  assert.equal(isUserPolicy(denyAi, "view", "deny"), false);
  // The same person, the same permission, the opposite effect: not this rule either.
  assert.equal(isUserPolicy(denyAi, "ai_retrieval", "allow"), false);
});

test("does not confuse a membership rule with a user rule", () => {
  const external = {
    subjectType: "MembershipType",
    subjectKey: "External",
    permission: "download",
    effect: "ALLOW",
  };

  assert.equal(isUserPolicy(external, "download", "allow"), false);
  assert.equal(isMembershipPolicy(external, "External", "download", "allow"), true);
  assert.equal(isMembershipPolicy(external, "Internal", "download", "allow"), false);
});
