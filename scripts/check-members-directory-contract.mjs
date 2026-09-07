import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Invitations are part of Members, and there is no second page.
 *
 * The Invitations page had been duplicated under two routes and still owned Join Requests
 * exclusively — so deleting it without carrying approve/reject across would have quietly
 * removed the only way to admit someone who asked to join. This contract pins both halves:
 * the page stays gone, and the abilities it used to hold stay reachable from Members.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const gone of [
  "src/app/(app)/[workspaceSlug]/invitations",
  "src/app/(app)/workspace/invitations",
]) {
  assert.ok(
    !fs.existsSync(path.join(root, gone)),
    `${gone} must not come back — Members is the one list of people.`,
  );
}

const sidebar = read("src/components/layout/linear-sidebar.tsx");
assert.ok(
  !sidebar.includes('label: "Invitations"'),
  "The sidebar must not offer an Invitations destination.",
);

const members = read("src/app/(app)/[workspaceSlug]/members/page.tsx");

// The merge itself: pending rows come from the invitation endpoints, not from members.
assert.match(
  members,
  /useWorkspaceInvitations\(/,
  "Members must load pending invitations.",
);
assert.match(
  members,
  /"join-request"/,
  "Members must load join requests, which no other page does.",
);
assert.match(
  members,
  /buildMemberDirectory\(/,
  "Members must merge the three lists through the tested builder.",
);

// The three abilities that would otherwise be lost with the page.
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

// The owner asked for the invite flow to start from a button, not a permanent form rail.
assert.match(
  members,
  /<span>Invite new member<\/span>/,
  "Members must offer an explicit Invite new member button.",
);

/**
 * One invite dialog, everywhere.
 *
 * There were two. The sidebar's showed the invitation link — the one moment the plaintext
 * token exists — while the Members one showed a `/dev/email/...` preview URL that does not
 * exist in production, so the copy that mattered when email delivery failed was the one
 * fewer people could reach.
 */
const dialog = read("src/components/workspace/invite-member-dialog.tsx");
const sidebar_ = sidebar;

for (const [file, source] of [
  ["Members", members],
  ["the sidebar", sidebar_],
]) {
  assert.match(
    source,
    /<InviteMemberDialog\b/,
    `${file} must open the shared invite dialog rather than its own.`,
  );
}

// The old inline form lived in the sidebar; its submit label is the marker that it is gone.
assert.ok(
  !sidebar_.includes('"Sending..." : "Send invite"'),
  "The sidebar must not carry its own invite form any more.",
);

// The server refuses AdminCannotPromoteToAdmin, so an Admin must never be offered the
// option — it can only produce a 403 after they have typed an address.
assert.match(
  dialog,
  /\{canGrantAdmin && <option value="Admin">Admin<\/option>\}/,
  "Only an Owner may be offered the Admin role in the invite dialog.",
);
assert.match(
  members,
  /canGrantAdmin=\{isOwner\}/,
  "Members must pass Owner-only Admin granting to the invite dialog.",
);

/**
 * A member asking to leave must be answerable (WT-559).
 *
 * Everything about this feature was built except the last inch. The backend creates the
 * request, returns it on the join-request listing and has approve and reject endpoints; the
 * web has the service calls, the hooks, the handlers and the two buttons — written with
 * "Approve leave request" titles by somebody who clearly meant them to be seen. The row simply
 * never arrived, so an Admin was told a request existed and given nothing to click.
 *
 * A unit test of the builder cannot catch the half of that which lives in the page, and a test
 * of the page cannot catch the half in the builder. Both halves are pinned here.
 */
const directory = read("src/lib/workspace/member-directory.ts");

assert.match(
  directory,
  /LEAVE_REQUESTED/,
  "The builder must recognise a leave request. It once kept only status === REQUESTED, and a leave request carries LEAVE_REQUESTED, so every one of them was dropped before it could become a row.",
);
assert.match(
  directory,
  /leaveRequest: WorkspaceInvitationDto \| null/,
  "A leaving row must carry the request itself — without an id there is nothing for approve to act on.",
);

for (const [mutation, what] of [
  ["useApproveLeaveRequest", "approve a leave request"],
  ["useRejectLeaveRequest", "reject a leave request"],
]) {
  assert.ok(
    members.includes(mutation),
    `Members must be able to ${what} (${mutation}).`,
  );
}

// The order of the branches IS the bug. A member who has asked to leave is still a member, so
// a `member ?` branch placed first matches them, renders Remove, and the request stays
// unanswerable — with the approve and reject buttons sitting right below it, unreachable.
const actionCell = members.slice(
  members.indexOf('<div className="flex justify-end gap-1">'),
);
const leaveBranch = actionCell.indexOf("leaveRequest ? (");
const memberBranch = actionCell.indexOf("member ? (");

assert.ok(leaveBranch !== -1, "The row actions must have a branch for a pending leave request.");
assert.ok(memberBranch !== -1, "The row actions must still have a branch for a plain member.");
assert.ok(
  leaveBranch < memberBranch,
  "The leave-request branch must be tested BEFORE the member branch — a leaving member satisfies both, and whichever comes first wins.",
);

// The request has to be read off the row, not guessed at from the member.
assert.match(
  members,
  /row\.leaveRequest/,
  "The page must take the pending leave request from the row the builder produced.",
);

console.log("Members directory contract: PASS");
