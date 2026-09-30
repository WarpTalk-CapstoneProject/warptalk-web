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
 * The workspace Audit log page was taken out of the product (2026-09-23): it only ever listed what
 * WarpTalk staff did to a workspace, which is the platform's own trail and stays on /admin/audit.
 * The page is gone, nothing in the settings nav links to it, and an old bookmark forwards to the
 * settings root instead of 404ing. The labelling helpers above stay: the admin page shares them.
 */
test("workspace owners have no audit log page; the platform admin one is untouched", () => {
  assert.throws(
    () => read("../../../app/(app)/[workspaceSlug]/settings/audit-log/page.tsx"),
    "the workspace audit log page must stay deleted",
  );

  const sidebar = read("../../../components/layout/linear-sidebar.tsx");
  assert.ok(!sidebar.includes("/settings/audit-log"), "no settings nav entry may link to it");
  assert.ok(sidebar.includes('href: "/admin/audit"'), "the platform admin audit log keeps its entry");
  read("../../../app/(app)/admin/audit/page.tsx");

  const proxy = read("../../../proxy.ts");
  assert.ok(proxy.includes("\\/settings\\/audit-log\\/?$/.exec(pathname)"), "the old address forwards");
  assert.ok(proxy.includes("`/${retiredAuditLog[1]}/settings`"), "…to the workspace settings root");
});
