import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [directory, detail, service, endpoints, dialog, sidebar, adminWorkspacesEn] =
  await Promise.all([
    source("src/app/(app)/admin/workspaces/page.tsx"),
    source("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx"),
    source("src/services/admin-workspace.service.ts"),
    source("src/lib/api/endpoints.ts"),
    source("src/components/admin/WorkspaceLifecycleDialog.tsx"),
    source("src/components/layout/linear-sidebar.tsx"),
    source("messages/en/adminWorkspaces.json").then(JSON.parse),
  ]);

// The directory must talk to the platform-wide admin API, never the member-scoped one.
assert.match(
  endpoints,
  /adminWorkspaces:[\s\S]*base: "\/admin\/workspaces"/,
  "admin workspace endpoints must live under /admin/workspaces",
);
assert.match(
  service,
  /API\.adminWorkspaces\.base/,
  "the directory service must call the admin workspace endpoint",
);
assert.doesNotMatch(
  service,
  /API\.workspaces\./,
  "the admin service must not reuse the member-scoped workspace endpoints",
);

// URL is the source of truth for tab, search, sort, filters and page. Since the admin list toolkit
// the parsing lives in useAdminListState (q, sort/dir, page, and one param per filter — see
// src/lib/admin/list-state.ts and its tests); the directory must drive its query from it.
assert.match(directory, /useAdminListState\(LIST_CONFIG\)/, "directory must keep its view in the URL via useAdminListState");
assert.match(
  directory,
  /key: "status", kind: "enum"/,
  "the status tab must be a URL filter (status=) so navigation restores it",
);
for (const field of ["state.page", "state.search", "state.sort.field"]) {
  assert.ok(directory.includes(field), `directory must send ${field} to the API`);
}
assert.match(
  directory,
  /useAdminWorkspaceDirectory/,
  "directory must load rows from the admin API, not from mock data",
);

// Server-driven paging: the page size goes to the API rather than slicing client-side.
assert.match(directory, /pageSize: PAGE_SIZE/, "paging must be server-driven");

// Required list states.
// i18n: the copy below now renders through next-intl (t("...") from the "adminWorkspaces.list"
// scope) rather than as literal source text, so these check the translation key is wired up plus
// the English catalog still carries the sentence.
assert.match(directory, /isError/, "directory must implement an error state");
assert.match(directory, /isPending/, "directory must implement a loading state");
assert.match(directory, /t\("emptyTitle"\)/, "directory must implement an empty state");
assert.equal(
  adminWorkspacesEn.list?.emptyTitle,
  "No workspaces match these filters",
  "the empty-state title must read 'No workspaces match these filters' in English",
);
assert.match(
  directory,
  /t\("ownerUnavailable"\)/,
  "directory must degrade gracefully when the owner cannot be resolved",
);
assert.equal(
  adminWorkspacesEn.list?.ownerUnavailable,
  "Owner unavailable",
  "the owner-unavailable label must read 'Owner unavailable' in English",
);

// Master → detail navigation is a real route, so the selected workspace lives in the URL.
// By slug since WT-560 — the workspace is named there rather than keyed. What this assertion
// is for is unchanged: the row must lead somewhere, and it must be a URL rather than state.
assert.match(
  directory,
  // `href={…}` on a Link, or `rowHref={(workspace) => …}` on the admin list table.
  /(?:href=\{|rowHref=\{\(workspace\) => )`\/admin\/workspaces\/\$\{workspace\.slug\}`\}/,
  "rows must link to the detail route",
);

// Detail tabs. Knowledge was removed on purpose (2026-08-17): the portal reads a workspace's
// operational facts, never its content — check-admin-knowledge-contract.mjs pins the absence.
for (const tab of ["overview", "members", "usage", "billing", "audit"]) {
  assert.match(
    detail,
    new RegExp(`TabsTrigger value="${tab}"`),
    `workspace detail must expose the ${tab} tab`,
  );
}
assert.doesNotMatch(
  detail,
  /TabsTrigger value="knowledge"/,
  "the knowledge tab must not come back — tenant content stays out of the portal",
);

// Lifecycle actions: explicit confirmation plus a mandatory reason.
assert.match(detail, /WorkspaceLifecycleDialog/, "lifecycle actions must be confirmed");
assert.match(
  dialog,
  /trimmedReason\.length > 0/,
  "the lifecycle dialog must require a non-empty reason",
);
assert.match(dialog, /pending/, "the lifecycle dialog must expose a pending state");
assert.match(detail, /getErrorMessage/, "lifecycle failures must surface the server message");
assert.match(
  detail,
  /t\("notFoundTitle"\)/,
  "workspace detail must implement a missing-workspace state",
);
assert.equal(
  adminWorkspacesEn.detail?.notFoundTitle,
  "Workspace not found",
  "the missing-workspace title must read 'Workspace not found' in English",
);

// Deleted workspaces are terminal in the UI as well as the API.
assert.match(
  detail,
  /t\("deletedCannotChange"\)/,
  "deleted workspaces must not offer suspend/reactivate",
);
assert.equal(
  adminWorkspacesEn.detail?.deletedCannotChange,
  "Deleted workspaces cannot change lifecycle state",
  "the deleted-workspace notice must read 'Deleted workspaces cannot change lifecycle state' in English",
);

// Navigation entry stays wired.
assert.match(
  sidebar,
  /label: t\("adminNav\.items\.workspaces"\)[\s\S]*href: "\/admin\/workspaces"/,
  "platform navigation must expose Workspaces",
);

console.log("Admin workspaces directory contract passed.");
