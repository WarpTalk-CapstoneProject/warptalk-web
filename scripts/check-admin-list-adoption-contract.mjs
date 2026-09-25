#!/usr/bin/env node
/**
 * Every admin list page searches, filters and orders through the shared list toolkit — and the big
 * ones do it on the server.
 *
 * WHY THIS EXISTS
 *   The owner's complaint was that "all the list pages across the admin system are missing search
 *   and filters". Nine pages each grew their own answer (a form here, a local useState there, a raw
 *   workspace-id text box on the ledger), which is how some of them ended up with none. The toolkit
 *   (src/components/admin/list/) is the one answer; this pins that every list uses it, so the next
 *   admin list cannot quietly ship without search again.
 *
 *   The second rule is the expensive one to lose. Workspaces, accounts, subscriptions, sales leads,
 *   feedback, the glossary, invoices and the credit ledger grow with the platform. Two of them used
 *   to fetch 200 rows and filter in the browser — which silently drops row 201 from every search.
 *   Those lists must send their filters to the API; only the small catalogues (plans, plugins,
 *   usage alerts) may filter client-side.
 *
 * DELIBERATELY NOT HERE
 *   Announcements and Email templates (the CMS, feat/admin-cms) and the Audit log (web #576) are
 *   rebuilt elsewhere; the toolkit is exported for them (see check-admin-command-palette-contract).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const ADMIN = "src/app/(app)/admin";

/** [file, serverSide] — serverSide lists must not filter a fetched table in the browser. */
const PAGES = [
  [`${ADMIN}/workspaces/page.tsx`, true],
  [`${ADMIN}/users/page.tsx`, true],
  [`${ADMIN}/subscriptions/page.tsx`, true],
  [`${ADMIN}/sales-leads/page.tsx`, true],
  [`${ADMIN}/feedback/page.tsx`, true],
  [`${ADMIN}/global-glossary/page.tsx`, true],
  [`${ADMIN}/plans/page.tsx`, false],
  [`${ADMIN}/plugins/page.tsx`, false],
  // G12: the inbox is aggregated and bounded by the server (≤200 items per source); the expense
  // list is bounded by its period window on the server, then filtered in the browser.
  [`${ADMIN}/inbox/page.tsx`, false],
];

for (const [file, serverSide] of PAGES) {
  assert.ok(existsSync(path.join(root, file)), `${file} is missing`);
  const source = read(file);
  assert.match(source, /useAdminListState\(/, `${file} must keep its view in the URL with useAdminListState`);
  assert.match(source, /<AdminListToolbar\b/, `${file} must render the shared toolbar (search, Filter, Display)`);
  if (serverSide) {
    assert.doesNotMatch(
      source,
      /applyClientListState\(/,
      `${file} lists a table that grows with the platform — its filters belong in the API query, not in the browser`,
    );
  }
}

// The billing ledger spans a page and its tab components.
const ledgerFiles = [
  "src/app/(internal)/billing/page.tsx",
  "src/components/admin/AdminInvoicesTab.tsx",
];
const ledgerSource = ledgerFiles.map(read).join("\n");
assert.match(ledgerSource, /useAdminListState\(/, "the billing ledger must use the list toolkit");
assert.match(ledgerSource, /<AdminListToolbar\b/, "the billing ledger must render the shared toolbar");
const invoices = read("src/components/admin/AdminInvoicesTab.tsx");
assert.doesNotMatch(
  invoices,
  /getGlobalInvoices\(\s*1\s*,\s*200\s*\)/,
  "invoices must be filtered by the server, not fetched 200 at a time and filtered in the browser",
);
assert.doesNotMatch(invoices, /applyClientListState\(/, "invoices grow with the platform — filter them in the API");

// Popovers must be portalled, or the overflow-hidden panels clip them (web: overflow-x-auto once
// killed six meeting controls at once with no error).
for (const primitive of ["src/components/ui/popover.tsx", "src/components/ui/dropdown-menu.tsx"]) {
  assert.match(read(primitive), /Primitive\.Portal/, `${primitive} must portal its popup`);
}
const filterBar = read("src/components/admin/list/admin-filter-bar.tsx");
assert.match(filterBar, /from "@\/components\/ui\/dropdown-menu"/, "the Filter menu must use the portalled menu");
assert.match(filterBar, /from "@\/components\/ui\/popover"/, "filter editors must use the portalled popover");

console.log("admin list adoption contract: ok");
