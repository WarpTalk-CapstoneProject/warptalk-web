import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const memberRolesPage = new URL(
  "../src/app/(app)/[workspaceSlug]/settings/member-roles/page.tsx",
  import.meta.url,
);
const legacyPage = new URL(
  "../src/app/(app)/[workspaceSlug]/settings/access-management/page.tsx",
  import.meta.url,
);
const page = source("src/app/(app)/[workspaceSlug]/settings/member-roles/page.tsx");
const sidebar = source("src/components/layout/linear-sidebar.tsx");
const workspaceHooks = source("src/hooks/use-workspace.ts");

assert.equal(existsSync(memberRolesPage), true, "the member roles route must exist");
assert.equal(existsSync(legacyPage), false, "the legacy access-management route must stay removed");
assert.match(page, /function MemberRolesPage/, "the page should use the canonical domain name");
assert.match(page, /useWorkspaceRoleLoaded/, "permission copy must wait until the workspace role is loaded");
assert.match(page, /Change role/, "each eligible member should expose the plain role action");
assert.match(page, /createMemberRoleChangeIntent/, "the page must create one retry-safe intent per preview");
assert.match(page, /buildMemberRoleChangeRequest/, "apply requests must reuse the reviewed intent");
assert.doesNotMatch(
  page,
  /Can create meetings|Governance summary|Preview promote|Preview demote/,
  "the focused UI must not restore removed governance or meeting-permission copy",
);
assert.match(sidebar, /settings\/member-roles/, "the sidebar must link to the canonical route");
assert.doesNotMatch(sidebar, /settings\/access-management/, "the sidebar must not link to the legacy route");
assert.match(
  workspaceHooks,
  /invalidateQueries\(\{ queryKey: \["workspaces", "members", workspaceId\] \}\)/,
  "role changes must invalidate every paginated member-list query",
);

console.log("Member roles route, UI, safety, and cache contracts passed.");
