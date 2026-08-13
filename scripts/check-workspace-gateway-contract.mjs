import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const gatewayPage = read("src/app/(app)/workspace/page.tsx");
const createPage = read("src/app/(app)/workspace/create/page.tsx");
const membershipHelper = read("src/lib/workspace/workspace-membership.ts");

assert.match(
  membershipHelper,
  /function\s+isInternalWorkspaceMembership/,
  "workspace membership helper must expose an Internal membership classifier",
);
assert.match(
  membershipHelper,
  /\?\?\s*"Internal"/,
  "missing membershipType from legacy workspace DTOs must be treated as Internal",
);
assert.match(
  membershipHelper,
  /function\s+getPrimaryInternalWorkspace/,
  "workspace membership helper must find the user's primary Internal workspace",
);

assert.match(
  gatewayPage,
  /getPrimaryInternalWorkspace\(workspaces\)/,
  "/workspace must derive create eligibility from the listed memberships",
);
assert.match(
  gatewayPage,
  /isCreateWorkspaceLocked\s*=\s*hasPrimaryInternalWorkspace\s*\|\|\s*hasPublicEmailDomain/,
  "/workspace Create action must be locked by either existing Internal membership or public email",
);
assert.match(
  gatewayPage,
  /one internal workspace membership/i,
  "/workspace must explain the one-Internal-workspace rule in the UI",
);
assert.match(
  gatewayPage,
  /Join another workspace/,
  "/workspace should steer existing Internal members toward joining another workspace",
);

assert.match(
  createPage,
  /useWorkspaces\(1,\s*100\)/,
  "/workspace/create must query memberships instead of trusting only active workspace state",
);
assert.match(
  createPage,
  /getPrimaryInternalWorkspace\(workspaces\)/,
  "/workspace/create must block direct URL access for users with an Internal workspace",
);
assert.match(
  createPage,
  /primaryInternalWorkspace/,
  "/workspace/create must keep an explicit primary Internal workspace branch",
);

console.log("Workspace gateway contract passed.");
