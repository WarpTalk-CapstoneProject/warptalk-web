/**
 * The admin directory's lifecycle button: Cancel, Reactivate, or nothing — and never `/resume`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AdminSubscriptionSummaryDto } from "../../../types/admin-subscription.ts";
import {
  adminSubscriptionRowAction,
  isRenewalCancelled,
} from "../admin-subscription-actions.ts";

const NOW = Date.parse("2026-09-16T10:00:00Z");

type Row = Pick<
  AdminSubscriptionSummaryDto,
  "status" | "autoRenew" | "cancelledAt" | "currentPeriodEnd"
>;

function row(overrides: Partial<Row> = {}): Row {
  return {
    status: "active",
    autoRenew: true,
    cancelledAt: null,
    currentPeriodEnd: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

test("a renewing subscription offers Cancel", () => {
  assert.equal(adminSubscriptionRowAction(row(), NOW), "cancel");
});

test("a scheduled cancellation offers Reactivate, though Cancel() leaves cancelledAt null", () => {
  const scheduled = row({ status: "cancelled", autoRenew: false, cancelledAt: null });
  assert.equal(adminSubscriptionRowAction(scheduled, NOW), "reactivate");
  assert.equal(isRenewalCancelled(scheduled), true);
});

test("renewal off with status still active (payment refund path) offers Reactivate", () => {
  assert.equal(adminSubscriptionRowAction(row({ autoRenew: false }), NOW), "reactivate");
});

test("a scheduled cancellation whose period has ended offers nothing", () => {
  const lapsed = row({
    status: "cancelled",
    autoRenew: false,
    currentPeriodEnd: "2026-09-15T00:00:00Z",
  });
  assert.equal(adminSubscriptionRowAction(lapsed, NOW), null);
});

test("a row with cancelledAt set is no longer live and offers nothing", () => {
  // CancelImmediately (trial) and a superseded plan both stamp cancelledAt and set IsActive=false.
  const ended = row({ status: "cancelled", autoRenew: false, cancelledAt: "2026-09-10T00:00:00Z" });
  assert.equal(adminSubscriptionRowAction(ended, NOW), null);
  assert.equal(isRenewalCancelled(ended), false);
});

test("an expired row offers nothing", () => {
  assert.equal(adminSubscriptionRowAction(row({ status: "expired", autoRenew: false }), NOW), null);
});

test("undoing a cancellation calls /reactivate, and /resume stays the suspension endpoint", () => {
  const service = readFileSync(
    new URL("../../../services/admin-subscription.service.ts", import.meta.url),
    "utf8",
  );
  const endpoints = readFileSync(new URL("../../api/endpoints.ts", import.meta.url), "utf8");
  const page = readFileSync(
    new URL("../../../app/(app)/admin/subscriptions/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(endpoints, /reactivate: \(workspaceId: string\) =>\s*`\/subscriptions\/workspace\/\$\{workspaceId\}\/reactivate`/);
  assert.match(endpoints, /resume: \(workspaceId: string\) => `\/subscriptions\/workspace\/\$\{workspaceId\}\/resume`/);
  assert.match(service, /API\.adminSubscriptions\.reactivate\(workspaceId\)/);
  assert.doesNotMatch(service, /API\.adminSubscriptions\.resume\(/);
  assert.match(page, /adminSubscriptionRowAction\(/);
  assert.doesNotMatch(page, /useResumeAdminSubscription/);
});
