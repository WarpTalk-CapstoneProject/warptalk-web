import assert from "node:assert/strict";
import { test } from "node:test";

import type { WorkspaceRoleChangePreview } from "@/types/workspace";
import {
  buildMemberRoleChangeRequest,
  createMemberRoleChangeIntent,
  getMemberRoleConfirmationValue,
  getPromotionCooldown,
  isRoleChangePreviewForTarget,
  matchesMemberRoleConfirmation,
} from "../member-role-change.ts";

const preview = (overrides: Partial<WorkspaceRoleChangePreview> = {}) => ({
  targetUserId: "user-1",
  currentRole: "Member",
  targetRole: "Admin",
  membershipType: "Internal",
  canCreateMeetings: true,
  impact: [],
  expiresAt: "2026-08-10T12:02:00.000Z",
  previewToken: "signed-preview",
  coolingOffUntil: "2026-08-10T12:01:00.000Z",
  ...overrides,
});

test("confirmation prefers email, trims input, and compares case-insensitively", () => {
  assert.equal(getMemberRoleConfirmationValue(" owner@example.com ", "Owner"), "owner@example.com");
  assert.equal(matchesMemberRoleConfirmation(" OWNER@example.com ", "owner@example.com", "Owner"), true);
  assert.equal(matchesMemberRoleConfirmation("Owner", "owner@example.com", "Owner"), false);
});

test("confirmation falls back to a non-empty full name and never accepts an empty identity", () => {
  assert.equal(getMemberRoleConfirmationValue("  ", " Jane Doe "), "Jane Doe");
  assert.equal(matchesMemberRoleConfirmation("jane doe", "", "Jane Doe"), true);
  assert.equal(matchesMemberRoleConfirmation("", "", ""), false);
});

test("promotion cooldown uses the server deadline and rounds partial seconds up", () => {
  assert.deepEqual(getPromotionCooldown("2026-08-10T12:01:00.000Z", Date.parse("2026-08-10T12:00:00.250Z")), {
    deadlineMs: Date.parse("2026-08-10T12:01:00.000Z"),
    remainingSeconds: 60,
  });
  assert.equal(getPromotionCooldown("not-a-date", Date.now()), null);
  assert.equal(getPromotionCooldown(null, Date.now()), null);
});

test("an elapsed server cooldown is valid and immediately ready", () => {
  assert.deepEqual(getPromotionCooldown("2026-08-10T12:00:00.000Z", Date.parse("2026-08-10T12:00:01.000Z")), {
    deadlineMs: Date.parse("2026-08-10T12:00:00.000Z"),
    remainingSeconds: 0,
  });
});

test("preview must belong to the selected user and role and carry a token", () => {
  assert.equal(isRoleChangePreviewForTarget(preview(), "user-1", "Admin"), true);
  assert.equal(isRoleChangePreviewForTarget(preview(), "user-2", "Admin"), false);
  assert.equal(isRoleChangePreviewForTarget(preview(), "user-1", "Member"), false);
  assert.equal(isRoleChangePreviewForTarget(preview({ previewToken: " " }), "user-1", "Admin"), false);
});

test("retries for one reviewed change reuse the same idempotency and correlation IDs", () => {
  const generatedIds = ["id-1", "trace-1"];
  const intent = createMemberRoleChangeIntent(preview(), () => generatedIds.shift()!);

  const firstAttempt = buildMemberRoleChangeRequest(intent, "Admin");
  const retry = buildMemberRoleChangeRequest(intent, "Admin");

  assert.deepEqual(retry, firstAttempt);
  assert.equal(firstAttempt.idempotencyKey, "id-1");
  assert.equal(firstAttempt.correlationId, "trace-1");
  assert.equal(generatedIds.length, 0);
});
