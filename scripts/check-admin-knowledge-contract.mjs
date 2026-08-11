/**
 * The admin Knowledge tab reads a workspace the caller is not a member of.
 *
 * That makes two properties worth pinning in source rather than trusting to review: the admin
 * surface must go through the admin-gated endpoint, and the two surfaces that read this index
 * must keep sharing one implementation. Both failures are silent — the member endpoint would
 * 403 only for workspaces the admin happens not to belong to, and a copied table drifts without
 * ever breaking a build.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [endpoints, service, hooks, table, filters, view, adminDetail, workspacePage] =
  await Promise.all([
    source("src/lib/api/endpoints.ts"),
    source("src/services/admin-workspace.service.ts"),
    source("src/hooks/use-admin-workspaces.ts"),
    source("src/components/knowledge/knowledge-table.tsx"),
    source("src/hooks/use-knowledge-filters.ts"),
    source("src/lib/knowledge/knowledge-view.ts"),
    source("src/app/(app)/admin/workspaces/[workspaceId]/page.tsx"),
    source("src/app/(app)/[workspaceSlug]/knowledge/page.tsx"),
  ]);

// The admin read has its own endpoint, gated by the platform admin policy.
assert.match(
  endpoints,
  /adminWorkspaces:[\s\S]*knowledge: \(id: string\) => `\/admin\/workspaces\/\$\{id\}\/knowledge`/,
  "the admin knowledge endpoint must live under /admin/workspaces/{id}/knowledge",
);
assert.match(
  service,
  /API\.adminWorkspaces\.knowledge/,
  "the admin service must read the index through the admin-gated endpoint",
);

// Both surfaces render the same table, and neither reimplements it.
for (const [name, page] of [
  ["admin workspace detail", adminDetail],
  ["workspace knowledge page", workspacePage],
]) {
  assert.match(
    page,
    /KnowledgeTable/,
    `${name} must render the shared KnowledgeTable rather than its own copy`,
  );
  assert.match(
    page,
    /useKnowledgeFilters/,
    `${name} must take its filter and cursor state from the shared hook`,
  );
}
assert.match(
  adminDetail,
  /<KnowledgeTab workspaceId=\{workspace\.id\}/,
  "the knowledge tab must be scoped to the workspace being viewed",
);

// Each surface reads through its own authorization, and never through the other's.
assert.match(
  adminDetail,
  /useAdminWorkspaceKnowledge/,
  "the admin tab must use the admin-scoped query hook",
);
assert.doesNotMatch(
  adminDetail,
  /useWorkspaceKnowledge\b/,
  "the admin tab must not read through the member-scoped hook",
);
assert.match(
  workspacePage,
  /useWorkspaceKnowledge\b/,
  "the workspace page must keep reading through the member-scoped hook",
);
assert.doesNotMatch(
  workspacePage,
  /useAdminWorkspaceKnowledge/,
  "the workspace page must not read through the admin-scoped hook",
);
assert.match(
  workspacePage,
  /Only a workspace Owner or Admin can see what has been indexed/,
  "the workspace page must keep its owner/admin gate",
);

// The query key includes the filters, or paging in one tab would serve another tab's page.
assert.match(
  hooks,
  /knowledge: \(id: string, query: WorkspaceKnowledgeQuery\) =>/,
  "the admin knowledge query key must include the query, not just the workspace id",
);
assert.match(
  hooks,
  /placeholderData: \(previous\) => previous/,
  "paging must not blank the table while the next cursor page loads",
);

// States the tab cannot silently drop: an empty index and a failed read are different answers.
assert.match(table, /Could not read the index/, "the table must implement an error state");
assert.match(table, /Nothing indexed yet/, "the table must implement an empty state");
assert.match(
  table,
  /emptyHint/,
  "the empty state must be caller-supplied: it differs by audience",
);
assert.match(
  adminDetail,
  /Nothing here means nothing stored — not a failed read/,
  "the admin empty state must distinguish an empty index from a failed read",
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

console.log("Admin knowledge contract passed.");
