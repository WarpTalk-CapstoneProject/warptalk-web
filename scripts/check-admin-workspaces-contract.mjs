import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [directory, detail, service, endpoints, dialog, sidebar] = await Promise.all([
  source("src/app/(app)/admin/workspaces/page.tsx"),
  source("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx"),
  source("src/services/admin-workspace.service.ts"),
  source("src/lib/api/endpoints.ts"),
  source("src/components/admin/WorkspaceLifecycleDialog.tsx"),
  source("src/components/layout/linear-sidebar.tsx"),
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

// URL is the source of truth for tab, search, sort, and page.
for (const param of ["status", "sort", "page", "q"]) {
  assert.match(
    directory,
    new RegExp(`searchParams\\.get\\("${param}"\\)`),
    `directory must read "${param}" from the URL so navigation restores it`,
  );
}
assert.match(
  directory,
  /useAdminWorkspaceDirectory/,
  "directory must load rows from the admin API, not from mock data",
);

// Server-driven paging: the page size goes to the API rather than slicing client-side.
assert.match(directory, /pageSize: PAGE_SIZE/, "paging must be server-driven");

// Required list states.
assert.match(directory, /isError/, "directory must implement an error state");
assert.match(directory, /isPending/, "directory must implement a loading state");
assert.match(
  directory,
  /No workspaces match these filters/,
  "directory must implement an empty state",
);
assert.match(
  directory,
  /Owner unavailable/,
  "directory must degrade gracefully when the owner cannot be resolved",
);

// Master → detail navigation is a real route, so the selected workspace lives in the URL.
// By slug since WT-560 — the workspace is named there rather than keyed. What this assertion
// is for is unchanged: the row must lead somewhere, and it must be a URL rather than state.
assert.match(
  directory,
  /href=\{`\/admin\/workspaces\/\$\{workspace\.slug\}`\}/,
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
  /Workspace not found/,
  "workspace detail must implement a missing-workspace state",
);

// Deleted workspaces are terminal in the UI as well as the API.
assert.match(
  detail,
  /Deleted workspaces cannot change lifecycle state/,
  "deleted workspaces must not offer suspend/reactivate",
);

// Navigation entry stays wired.
assert.match(
  sidebar,
  /label: "Workspaces"[\s\S]*href: "\/admin\/workspaces"/,
  "platform navigation must expose Workspaces",
);

console.log("Admin workspaces directory contract passed.");
