/**
 * The admin portal reads NO tenant content — decided 2026-08-17.
 *
 * This file used to pin the opposite: an admin Knowledge tab reading a workspace's index
 * through an admin-gated endpoint. That surface was removed on purpose (the portal sees a
 * workspace's operational facts — membership, billing, lifecycle — never its content), and
 * the failure mode this contract now guards against is the tab quietly coming back: each of
 * these hooks/endpoints is a one-line re-add that no build would ever refuse.
 *
 * The member-scoped Knowledge page is untouched and keeps its own invariants below.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [endpoints, service, hooks, table, filters, view, adminDetail, workspacePage, knowledgeEn] =
  await Promise.all([
    source("src/lib/api/endpoints.ts"),
    source("src/services/admin-workspace.service.ts"),
    source("src/hooks/use-admin-workspaces.ts"),
    source("src/components/knowledge/knowledge-table.tsx"),
    source("src/hooks/use-knowledge-filters.ts"),
    source("src/lib/knowledge/knowledge-view.ts"),
    source("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx"),
    source("src/app/(app)/[workspaceSlug]/knowledge/page.tsx"),
    source("messages/en/knowledge.json").then(JSON.parse),
  ]);

// The admin surface has no route into the index, at any layer.
for (const [name, text] of [
  ["endpoints", endpoints],
  ["admin workspace service", service],
  ["admin workspace hooks", hooks],
  ["admin workspace detail page", adminDetail],
]) {
  assert.doesNotMatch(
    text,
    /admin\/workspaces\/\$\{id\}\/knowledge|useAdminWorkspaceKnowledge|listKnowledge|GetKnowledgeForAdmin/i,
    `${name} must not reference an admin knowledge read — tenant content stays out of the portal`,
  );
}
assert.doesNotMatch(
  adminDetail,
  /KnowledgeTable|KnowledgeTab/,
  "the admin detail page must not render the knowledge table",
);

// What the admin detail page DOES show: operational facts.
assert.match(
  adminDetail,
  /<MembersTab workspaceId=\{workspace\.id\}/,
  "the admin detail page must show the member roster",
);
assert.match(
  adminDetail,
  /useAdminWorkspaceAnalytics/,
  "the admin detail page must read usage from the billing analytics endpoint",
);

// The member-scoped page keeps its gate and the shared implementation.
assert.match(
  workspacePage,
  /useWorkspaceKnowledge\b/,
  "the workspace page must keep reading through the member-scoped hook",
);
assert.match(
  workspacePage,
  /KnowledgeTable/,
  "the workspace page must render the shared KnowledgeTable rather than its own copy",
);
assert.match(
  workspacePage,
  /useKnowledgeFilters/,
  "the workspace page must take its filter and cursor state from the shared hook",
);
// WT-607: the gate's copy now comes from the i18n catalog rather than living inline. The
// contract checks that the page still calls the translation key AND that the English catalog
// still carries the original wording — either half regressing (the call site reverting to a
// literal, or the catalog's copy drifting) is what this guards against now.
assert.match(
  workspacePage,
  /t\(["']restricted\.title["']\)/,
  "the workspace page must keep its owner/admin gate wired to the i18n catalog",
);
assert.match(
  knowledgeEn.restricted.title,
  /Only a workspace Owner or Admin can see what has been indexed/,
  "messages/en/knowledge.json must keep the owner/admin gate's original wording",
);

// States the member page cannot silently drop, unchanged from the original contract — now
// verified against the catalog key the table calls, and that key's English text.
assert.match(table, /t\(["']readError["']\)/, "the table must implement an error state");
assert.match(knowledgeEn.table.readError, /Could not read the index/);
assert.match(table, /t\(["']emptyTitle["']\)/, "the table must implement an empty state");
assert.match(knowledgeEn.table.emptyTitle, /Nothing indexed yet/);
assert.match(
  table,
  /emptyHint/,
  "the empty state must be caller-supplied: it differs by audience",
);

// A filter change invalidates the cursor trail; otherwise page 3 of one filter is requested
// under another, and the store answers with a page that was never asked for.
assert.match(
  filters,
  /setSourceTab: \(tab\) => \{[\s\S]*setCursorStack\(initialCursorStack\(\)\)/,
  "changing the source tab must reset paging",
);
assert.match(
  filters,
  /setFactCategory: \(category\) => \{[\s\S]*setCursorStack\(initialCursorStack\(\)\)/,
  "changing the fact category must reset paging",
);

// The shared rules stay React-free and value-import-free so node:test can exercise them.
assert.doesNotMatch(view, /^import (?!type )/m, "knowledge-view must only import types");
assert.doesNotMatch(view, /"use client"/, "knowledge-view must stay free of React");

console.log("Admin knowledge contract passed (portal reads no tenant content).");
