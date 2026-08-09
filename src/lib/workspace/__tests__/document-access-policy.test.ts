import assert from "node:assert/strict";
import test from "node:test";
import { isExternalViewPolicy } from "../document-access-policy.ts";

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
