import test from "node:test";
import assert from "node:assert/strict";

import {
  budgetUsage,
  categoryStacks,
  clampMonths,
  expenseCsvRows,
  monthRangeDates,
  monthsBetween,
  parseTags,
  resolvePeriod,
  toCsv,
} from "../expenses.ts";
import { ageBucket, assigneeKey, compactAge, inboxBadge, inboxState, scopeItems, slaState, snoozeUntil } from "../inbox.ts";
import type { ExpenseReportDto, OperatingExpenseDto } from "../../../types/admin-expenses.ts";
import type { InboxItemDto } from "../../../types/admin-inbox.ts";

const NOW = new Date(2026, 8, 25, 10, 0); // Fri 25 Sep 2026, local

test("periods and month ranges", () => {
  assert.deepEqual(resolvePeriod("3m", NOW), { from: "2026-07", to: "2026-09" });
  assert.deepEqual(resolvePeriod("ytd", NOW), { from: "2026-01", to: "2026-09" });
  assert.deepEqual(resolvePeriod("12m", NOW), { from: "2025-10", to: "2026-09" });
  assert.deepEqual(monthsBetween("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(monthRangeDates("2026-01", "2026-02"), { from: "2026-01-01", to: "2026-02-28" });
  assert.deepEqual(clampMonths({ from: "2024-10", to: "2026-09" }, 12), { from: "2025-10", to: "2026-09" });
});

test("budget usage warns from 80% and is over above 100%", () => {
  assert.deepEqual(budgetUsage(50, null), { percent: null, state: "none" });
  assert.deepEqual(budgetUsage(70, 100), { percent: 70, state: "ok" });
  assert.deepEqual(budgetUsage(80, 100), { percent: 80, state: "warn" });
  assert.deepEqual(budgetUsage(133.3, 100).state, "over");
});

test("stacked categories keep the five largest and fold the rest into other", () => {
  const categories = ["a", "b", "c", "d", "e", "f", "g"].map((id, index) => ({
    id, slug: id, name: id.toUpperCase(), description: null, color: null, sortOrder: index, isActive: true, inUse: true,
  }));
  const report = {
    categories,
    categoryTotals: categories.map((c, index) => ({ categoryId: c.id, slug: c.slug, name: c.name, color: null, amountVnd: 700 - index * 100, count: 1, budgetVnd: null })),
    months: [
      { month: "2026-08", totalVnd: 0, paidVnd: 0, plannedVnd: 0, budgetVnd: null, categories: [] },
      {
        month: "2026-09", totalVnd: 2800, paidVnd: 2800, plannedVnd: 0, budgetVnd: null,
        categories: categories.map((c, index) => ({ categoryId: c.id, amountVnd: 700 - index * 100, budgetVnd: null, overBudget: false })),
      },
    ],
  } as unknown as ExpenseReportDto;

  const stacks = categoryStacks(report, "Other");
  assert.deepEqual(stacks.map((s) => s.key), ["a", "b", "c", "d", "e", "other"]);
  assert.deepEqual(stacks[0].values, [0, 700]);
  assert.deepEqual(stacks[5].values, [0, 100 + 200]);
  assert.ok(stacks.every((s) => s.color.startsWith("var(--")), "chart colours are tokens, never hex");
});

test("the CSV export uses the import's columns and guards formulas", () => {
  const expense = {
    expenseDate: "2026-09-01", vendor: "=HYPERLINK(evil)", categorySlug: "saas", amount: 21, currency: "USD", description: "Team, plan",
    paymentMethod: "company_card", status: "paid", paidBy: null, tags: ["infra", "saas"], recurrence: "monthly", amountVnd: 546000,
  } as unknown as OperatingExpenseDto;
  const csv = toCsv(expenseCsvRows([expense]));
  const [header, row] = csv.trim().split("\r\n");
  assert.equal(header, "date,vendor,category,amount,currency,description,payment_method,status,paid_by,tags,recurrence,amount_vnd");
  assert.equal(row, "2026-09-01,'=HYPERLINK(evil),saas,21,USD,\"Team, plan\",company_card,paid,,infra;saas,monthly,546000");
  assert.deepEqual(parseTags(" Infra, saas;infra | Prod "), ["infra", "saas", "prod"]);
});

const item = (overrides: Partial<InboxItemDto> = {}): InboxItemDto => ({
  key: "k", source: "billing", type: "sales_lead", title: "t", detail: null, workspaceId: null, customer: null,
  occurredAt: new Date(NOW.getTime() - 30 * 3_600_000).toISOString(), dueAt: null, priority: "normal", href: "/admin/sales-leads",
  naturalCompletion: true, amount: null, currency: null, overdue: false, snoozed: false, done: false,
  triage: { assigneeId: null, assigneeName: null, assignedAt: null, snoozedUntil: null, doneAt: null, doneBy: null, noteCount: 0, lastNoteAt: null },
  ...overrides,
});

test("inbox SLA, age, state and scope", () => {
  assert.equal(slaState(item({ dueAt: new Date(NOW.getTime() - 1).toISOString() }), NOW), "overdue");
  assert.equal(slaState(item({ dueAt: new Date(NOW.getTime() + 3_600_000).toISOString() }), NOW), "dueSoon");
  assert.equal(slaState(item({ dueAt: new Date(NOW.getTime() + 72 * 3_600_000).toISOString() }), NOW), "onTrack");
  assert.equal(slaState(item(), NOW), "none");
  assert.equal(ageBucket(item().occurredAt, NOW), "days1to3");
  assert.deepEqual(compactAge(item().occurredAt, NOW), { value: 30, unit: "h" });
  assert.equal(inboxState(item({ snoozed: true })), "snoozed");
  assert.equal(inboxState(item({ snoozed: true, done: true })), "done");

  const mine = item({ key: "a", triage: { ...item().triage, assigneeId: "me-id" } });
  const theirs = item({ key: "b", triage: { ...item().triage, assigneeId: "other" } });
  const snoozed = item({ key: "c", snoozed: true, triage: { ...item().triage, assigneeId: "me-id" } });
  assert.deepEqual(scopeItems([mine, theirs, snoozed], "mine", "open", "me-id").map((i) => i.key), ["a"]);
  assert.deepEqual(scopeItems([mine, theirs, snoozed], "all", "open", "me-id").map((i) => i.key), ["a", "b"]);
  assert.equal(assigneeKey(mine, "me-id"), "me");
  assert.equal(assigneeKey(item(), "me-id"), "unassigned");
});

test("the badge and snooze presets", () => {
  assert.equal(inboxBadge(null), null);
  assert.equal(inboxBadge({ open: 0, mine: 0, unassigned: 0, overdue: 0, snoozed: 3, done: 1 }), null);
  assert.equal(inboxBadge({ open: 7, mine: 0, unassigned: 0, overdue: 0, snoozed: 0, done: 0 }), "7");
  assert.equal(inboxBadge({ open: 120, mine: 0, unassigned: 0, overdue: 0, snoozed: 0, done: 0 }), "99+");
  const monday = snoozeUntil("nextWeek", NOW);
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getHours(), 9);
  assert.equal(snoozeUntil("tomorrow", NOW).getDate(), 26);
});
