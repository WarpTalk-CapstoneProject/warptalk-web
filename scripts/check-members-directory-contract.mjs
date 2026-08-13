import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Invitations and join requests are managed from Members, and there is no second page.
 *
 * The queues must stay reachable for Owner/Admin, but pending records must not be merged into
 * the active member directory. All means active members only; Invitations and Join Requests
 * are separate management tabs.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const gone of [
  "src/app/(app)/[workspaceSlug]/invitations",
  "src/app/(app)/workspace/invitations",
]) {
  assert.ok(
    !fs.existsSync(path.join(root, gone)),
    `${gone} must not come back; Members is the access-management surface.`,
  );
}

const sidebar = read("src/components/layout/linear-sidebar.tsx");
assert.ok(
  !sidebar.includes('label: "Invitations"'),
  "The sidebar must not offer an Invitations destination.",
);

const members = read("src/app/(app)/[workspaceSlug]/members/page.tsx");
const dialog = read("src/components/workspace/invite-member-dialog.tsx");

assert.match(
  members,
  /useWorkspaceInvitations\(/,
  "Members must load invitations.",
);
assert.match(
  members,
  /"join-request"/,
  "Members must load join requests, which no other page does.",
);
assert.match(
  members,
  /buildMemberDirectory\(/,
  "Members must build the active member directory through the tested builder.",
);
assert.match(
  members,
  /filter === "invitations"/,
  "Members must render invitations as their own tab.",
);
assert.match(
  members,
  /filter === "join-requests"/,
  "Members must render join requests as their own tab.",
);
assert.ok(
  !members.includes('{ key: "owner"'),
  "The Owner tab must stay hidden.",
);

for (const [mutation, what] of [
  ["useRevokeWorkspaceInvitation", "revoke a pending invitation"],
  ["useApproveJoinRequest", "approve a join request"],
  ["useRejectJoinRequest", "reject a join request"],
]) {
  assert.ok(
    members.includes(mutation),
    `Members must still be able to ${what} (${mutation}).`,
  );
}

assert.match(
  members,
  /<span>Invite new member<\/span>/,
  "Members must offer an explicit Invite new member button.",
);

for (const [file, source] of [
  ["Members", members],
  ["the sidebar", sidebar],
]) {
  assert.match(
    source,
    /<InviteMemberDialog\b/,
    `${file} must open the shared invite dialog rather than its own.`,
  );
}

assert.ok(
  !sidebar.includes('"Sending..." : "Send invite"'),
  "The sidebar must not carry its own invite form any more.",
);

assert.match(
  dialog,
  /\{canGrantAdmin && effectiveMembershipType === "Internal" && \(/,
  "Only an Owner inviting an Internal member may be offered the Admin role.",
);
assert.match(
  members,
  /canGrantAdmin=\{isOwner\}/,
  "Members must pass Owner-only Admin granting to the invite dialog.",
);
assert.match(
  dialog,
  /membershipType: effectiveMembershipType/,
  "Invite requests must send the explicitly selected membership type.",
);

console.log("Members directory contract: PASS");
