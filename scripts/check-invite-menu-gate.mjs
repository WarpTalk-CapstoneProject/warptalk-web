/**
 * WT-699 TC0705: a workspace Member saw "Invite and manage members" in the workspace menu, opened
 * the dialog, and had the invite refused by the server. The entry — and the dialog it opens — are
 * for the people who may invite: Owner and Admin, the same audience the Members page uses.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const sidebar = fs.readFileSync(
  new URL("../src/components/layout/linear-sidebar.tsx", import.meta.url),
  "utf8",
);

const itemAt = sidebar.indexOf('t("workspaceMenu.inviteAndManageMembers")');
assert.ok(itemAt > 0, "the workspace menu still offers the entry to those who may use it");
const before = sidebar.slice(Math.max(0, itemAt - 700), itemAt);
assert.match(
  before,
  /\{isOwnerOrAdmin && \(\s*<DropdownMenuItem\s+onClick=\{\(\) => setIsInviteModalOpen\(true\)\}/,
  "the Invite and manage members item must render only for Owner/Admin",
);

// Every other way into the dialog is gated the same way, and the dialog itself refuses to open
// for anyone else even if some later trigger forgets.
for (const match of sidebar.matchAll(/setIsInviteModalOpen\(true\)/g)) {
  const context = sidebar.slice(Math.max(0, match.index - 1600), match.index);
  assert.ok(context.includes("isOwnerOrAdmin"), "every invite trigger must sit behind isOwnerOrAdmin");
}
assert.match(sidebar, /<InviteMemberDialog\s+open=\{isOwnerOrAdmin && isInviteModalOpen\}/);

console.log("Invite menu gate contract: PASS");
