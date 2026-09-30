#!/usr/bin/env node
/**
 * G12 internal management: /admin/finance/expenses (operating costs) and /admin/inbox (pending work).
 *
 * Pins the wiring that makes the two pages real rather than decorative:
 *   - every endpoint the web names is called by its service, and every service call is behind a hook;
 *   - both pages use the shared list toolkit, the expense charts use the shared chart primitives;
 *   - the sidebar carries both rows and the Inbox badge comes from the summary endpoint;
 *   - both permission areas exist in the web catalog with a route mapping and palette actions;
 *   - the two namespaces are loaded and have the same keys in en, vi and ja.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const endpoints = read("src/lib/api/endpoints.ts");
for (const [group, service] of [
  ["adminExpenses", "src/services/admin-expenses.service.ts"],
  ["adminInbox", "src/services/admin-inbox.service.ts"],
]) {
  const start = endpoints.indexOf(`${group}: {`);
  assert.ok(start > 0, `API.${group} is missing`);
  const body = endpoints.slice(start, endpoints.indexOf("},", start));
  const keys = [...body.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  assert.ok(keys.length > 3, `API.${group} lists its endpoints`);
  const source = read(service);
  for (const key of keys) assert.match(source, new RegExp(`API\\.${group}\\.${key}\\b`), `${service} must call API.${group}.${key}`);
}

const expensesHooks = read("src/hooks/use-admin-expenses.ts");
for (const call of ["list", "create", "update", "markPaid", "remove", "uploadReceipt", "removeReceipt", "categories", "createCategory", "updateCategory", "budgets", "saveBudgets", "report", "pnl", "previewImport", "import"]) {
  assert.match(expensesHooks, new RegExp(`adminExpensesService\\.${call}\\(`), `use-admin-expenses must wire adminExpensesService.${call}`);
}
const inboxHooks = read("src/hooks/use-admin-inbox.ts");
for (const call of ["get", "summary", "notes", "addNote", "assign", "snooze", "done", "reopen"]) {
  assert.match(inboxHooks, new RegExp(`adminInboxService\\.${call}\\(`), `use-admin-inbox must wire adminInboxService.${call}`);
}

const inboxPage = read("src/app/(app)/admin/inbox/page.tsx");
assert.match(inboxPage, /useAdminListState\(/);
assert.match(inboxPage, /<AdminListToolbar\b/);
assert.match(inboxPage, /SourceNotices/, "a source that is down must be named on the page, not fail it");
const expenseList = read("src/components/admin/finance/expense-list.tsx");
assert.match(expenseList, /useAdminListState\(/);
assert.match(expenseList, /<AdminListToolbar\b/);
assert.match(expenseList, /expenseCsvRows\(/, "the list exports the import's own CSV format");
const reports = read("src/components/admin/finance/expense-reports.tsx");
assert.match(reports, /from "@\/components\/admin\/charts\/time-series-chart"/);
assert.match(reports, /\bstacked\b/, "monthly totals by category are stacked bars");
assert.match(read("src/components/admin/finance/finance-pnl.tsx"), /useAdminFinancePnl\(/);
assert.match(read("src/components/admin/finance/expense-import.tsx"), /previewImport[\s\S]*commitImport/, "import validates before it commits");

const sidebar = read("src/components/layout/linear-sidebar.tsx");
assert.match(sidebar, /href: "\/admin\/inbox", badge: inboxBadge\(/);
assert.match(sidebar, /href: "\/admin\/finance\/expenses"/);
assert.match(sidebar, /useAdminInboxSummary\(/);

const permissions = read("src/lib/admin/staff-permissions.ts");
for (const code of ["finance.read", "finance.manage", "inbox.read", "inbox.manage"]) assert.ok(permissions.includes(`"${code}"`), `${code} missing`);
assert.match(permissions, /href: "\/admin\/inbox", permission: ADMIN_PERMISSIONS\.inboxRead/);
assert.match(permissions, /href: "\/admin\/finance", permission: ADMIN_PERMISSIONS\.financeRead/);
for (const action of ["recordExpense", "importExpenses", "myInbox"]) assert.match(permissions, new RegExp(`${action}: ADMIN_PERMISSIONS\\.`));

const request = read("src/i18n/request.ts");
const flatten = (value, prefix = "") =>
  Object.entries(value).flatMap(([key, child]) => (child && typeof child === "object" ? flatten(child, `${prefix}${key}.`) : [`${prefix}${key}`]));
for (const namespace of ["adminFinance", "adminInbox"]) {
  assert.match(request, new RegExp(`"${namespace}"`), `${namespace} must be loaded`);
  const [en, vi, ja] = ["en", "vi", "ja"].map((locale) => flatten(JSON.parse(read(`messages/${locale}/${namespace}.json`))).sort());
  assert.deepEqual(vi, en, `messages/vi/${namespace}.json must have exactly the English keys`);
  assert.deepEqual(ja, en, `messages/ja/${namespace}.json must have exactly the English keys`);
}

console.log("admin internal management contract: ok");
