import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  auditActionLabel,
  auditEntityLabel,
  dateInputToRangeBound,
  isDateRangeInverted,
} from "../audit-log.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("known actions read as sentences and unknown ones still read as words", () => {
  assert.equal(auditActionLabel("suspend"), "Workspace suspended");
  assert.equal(auditActionLabel("credit.adjusted"), "Credit adjusted");
  assert.equal(auditEntityLabel("credit_adjustment"), "Credits");
  assert.equal(auditEntityLabel("pricing_version"), "Pricing version");
});

test("the 'to' day is included: its bound is the start of the next local day", () => {
  const from = dateInputToRangeBound("2026-09-16", "from");
  const to = dateInputToRangeBound("2026-09-16", "to");
  assert.ok(from && to);
  assert.equal(new Date(to).getTime() - new Date(from).getTime() > 0, true);
  assert.equal(new Date(from).getDate(), 16);
  assert.equal(new Date(to).getDate(), 17);
  assert.equal(dateInputToRangeBound("", "from"), undefined);
  assert.equal(dateInputToRangeBound("16/09/2026", "from"), undefined);
});

test("a same-day range is valid, a reversed one is not", () => {
  assert.equal(isDateRangeInverted("2026-09-16", "2026-09-16"), false);
  assert.equal(isDateRangeInverted("2026-09-17", "2026-09-16"), true);
  assert.equal(isDateRangeInverted("", "2026-09-16"), false);
});

/**
 * The page is Owner/Admin only, and the workspace it reads is the active one from the store —
 * the id goes in the PATH, never a query parameter the backend would ignore anyway.
 */
test("the audit log page gates on owner/admin and never renders a staff identity", () => {
  const page = read("../../../app/(app)/[workspaceSlug]/settings/audit-log/page.tsx");
  assert.match(page, /isOwnerOrAdmin/);
  assert.match(page, /useWorkspaceAuditLog\(\s*activeWorkspaceId/);
  assert.match(page, /WorkspacePage/);
  assert.doesNotMatch(page, /actorId|reason|correlationId/);

  const endpoints = read("../../api/endpoints.ts");
  assert.match(endpoints, /auditLog: \(workspaceId: string\) => `\/workspaces\/\$\{workspaceId\}\/audit-log`/);

  const sidebar = read("../../../components/layout/linear-sidebar.tsx");
  assert.ok(
    sidebar.indexOf("/settings/audit-log") > sidebar.indexOf("/settings/security"),
    "Audit log sits after Security in the settings group",
  );
});
