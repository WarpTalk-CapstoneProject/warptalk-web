import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMemberDirectory,
  filterMemberDirectory,
  nameFromEmail,
} from "../member-directory.ts";
import type { WorkspaceInvitationDto, WorkspaceMemberDto } from "@/types/workspace";

const member = (over: Partial<WorkspaceMemberDto> = {}): WorkspaceMemberDto => ({
  id: "m1",
  workspaceId: "w1",
  userId: "u1",
  fullName: "Huynh Thai Tu",
  email: "tu@warptalk.io.vn",
  roleName: "Owner",
  status: "Active",
  joinedAt: "2026-07-01T00:00:00Z",
  membershipType: "Internal",
  canCreateMeetings: true,
  ...over,
});

const invite = (over: Partial<WorkspaceInvitationDto> = {}): WorkspaceInvitationDto => ({
  id: "i1",
  workspaceId: "w1",
  email: "nhi@warptalk.io.vn",
  roleName: "Member",
  status: "PENDING",
  membershipType: "Internal",
  deliveryStatus: "Sent",
  sentCount: 1,
  expiresAt: "2026-08-20T00:00:00Z",
  createdAt: "2026-08-08T00:00:00Z",
  ...over,
});

test("pending invitations and requests share one list with the members", () => {
  const rows = buildMemberDirectory(
    [member()],
    [invite()],
    [invite({ id: "r1", email: "ky@gmail.com", status: "REQUESTED" })],
  );

  assert.deepEqual(
    rows.map((row) => [row.status, row.email]),
    [
      ["requested", "ky@gmail.com"],
      ["invited", "nhi@warptalk.io.vn"],
      ["joined", "tu@warptalk.io.vn"],
    ],
    "people waiting on an answer belong at the top",
  );
});

test("settled invitations do not become rows", () => {
  const rows = buildMemberDirectory(
    [],
    [
      invite({ id: "a", status: "ACCEPTED", email: "a@x.com" }),
      invite({ id: "b", status: "REVOKED", email: "b@x.com" }),
      invite({ id: "c", status: "EXPIRED", email: "c@x.com" }),
    ],
    [invite({ id: "d", status: "REJECTED", email: "d@x.com" })],
  );

  assert.equal(rows.length, 0, "history is not a to-do list");
});

test("an invitation for somebody who already joined is dropped", () => {
  // The real window: the invite is accepted, the members list refetches, and for a moment
  // both lists contain the same person. They must not appear twice.
  const rows = buildMemberDirectory(
    [member({ email: "Nhi@WarpTalk.io.vn" })],
    [invite({ email: "nhi@warptalk.io.vn" })],
    [],
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "joined");
});

test("a join request shows as Member, not as whatever the row carried", () => {
  const rows = buildMemberDirectory(
    [],
    [],
    [invite({ status: "REQUESTED", roleName: "Admin" })],
  );

  assert.equal(rows[0].roleName, "Member", "the approver grants the role, the request cannot");
});

test("role filters describe the workspace as it stands", () => {
  const rows = buildMemberDirectory(
    [member({ roleName: "Owner" }), member({ id: "m2", email: "x@x.com", roleName: "Member" })],
    [invite({ roleName: "Admin" })],
    [],
  );

  assert.deepEqual(
    filterMemberDirectory(rows, "admin").map((row) => row.email),
    [],
    "an offered Admin role is not an Admin",
  );
  assert.deepEqual(filterMemberDirectory(rows, "owner").map((row) => row.email), [
    "tu@warptalk.io.vn",
  ]);
  assert.deepEqual(filterMemberDirectory(rows, "invited").map((row) => row.email), [
    "nhi@warptalk.io.vn",
  ]);
  assert.equal(filterMemberDirectory(rows, "all").length, 3);
});

test("an invited person is named by their address until they have a name", () => {
  assert.equal(nameFromEmail("hanh.nhi@warptalk.io.vn"), "hanh.nhi");
  assert.equal(nameFromEmail("nobody"), "nobody");
});

// ── a member asking to leave ─────────────────────────────────────────────────
//
// WT-559: a member sends a leave request, the Admin opens Members, and there is nothing to
// click. Every other piece of that feature was already built — the backend creates the row,
// lists it under the join-request kind, and has approve and reject endpoints; the web has the
// hooks, the service calls and even the two buttons, complete with "Approve leave request"
// titles. The chain broke here, in the one place with no UI to look at: this builder dropped
// the row twice over, so the buttons downstream could never be reached.
//
// Two independent drops, and fixing either alone still leaves nothing on screen:
//   1. it kept only status === "REQUESTED", and a leave request is "LEAVE_REQUESTED";
//   2. it drops any request whose email belongs to a member — which is right for a join
//      request left over after acceptance, and is every leave request by definition.

const leaveRequest = (over: Partial<WorkspaceInvitationDto> = {}): WorkspaceInvitationDto =>
  invite({
    id: "lr1",
    email: "tu@warptalk.io.vn",
    status: "LEAVE_REQUESTED",
    requestedBy: "u1",
    createdAt: "2026-08-22T09:00:00Z",
    ...over,
  });

test("a member waiting to leave is still one person, not two rows", () => {
  // Letting the request through as its own row would list them twice — once as themselves and
  // once under the local part of their address, which reads as a different person entirely.
  const rows = buildMemberDirectory([member()], [], [leaveRequest()]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Huynh Thai Tu", "their real name, not tu@ derived from the email");
  assert.equal(rows[0].status, "leaving");
});

test("the row carries the request, so there is something to approve", () => {
  // The whole bug in one assertion: without this the action cell has no id to act on.
  const rows = buildMemberDirectory([member()], [], [leaveRequest()]);

  assert.equal(rows[0].leaveRequest?.id, "lr1");
  assert.ok(rows[0].member, "they have not left yet — they are still a member");
});

test("a leave request is not dropped for belonging to a member", () => {
  // The dedup rule that made this invisible. A leave request ALWAYS matches a member.
  const rows = buildMemberDirectory(
    [member({ email: "TU@WarpTalk.io.vn" })],
    [],
    [leaveRequest({ email: "tu@warptalk.io.vn" })],
  );

  assert.equal(rows[0].status, "leaving", "matched case-insensitively, and kept");
});

test("the date shown is when they asked, not when they joined", () => {
  const rows = buildMemberDirectory([member()], [], [leaveRequest()]);

  assert.equal(rows[0].date, "2026-08-22T09:00:00Z");
});

test("someone waiting to leave needs an answer, so they sort with the requests", () => {
  const rows = buildMemberDirectory(
    [member(), member({ id: "m2", userId: "u2", email: "x@x.com", fullName: "Somebody Else" })],
    [],
    [leaveRequest()],
  );

  assert.equal(rows[0].email, "tu@warptalk.io.vn", "the row with a decision on it comes first");
});

test("a settled leave request marks nobody as leaving", () => {
  // Approved and rejected requests stay in the table forever. Reading them as live would put
  // an Approve button on every member who has ever asked to leave.
  const rows = buildMemberDirectory(
    [member()],
    [],
    [leaveRequest({ id: "old", status: "ACCEPTED" }), leaveRequest({ id: "older", status: "REJECTED" })],
  );

  assert.equal(rows[0].status, "joined");
  assert.equal(rows[0].leaveRequest, null);
});

test("a request from a member on another page is still answerable", () => {
  // Members arrive ten at a time and the requests do not, so most requests will not find their
  // member on the page being shown. Dropping those would put the bug straight back for any
  // workspace past its tenth member: the request exists, the Admin is told so, and the page
  // they are looking at has nothing on it.
  //
  // Nothing else produces a live LEAVE_REQUESTED with no member — approving moves it to
  // ACCEPTED and rejecting to REJECTED — except an Admin removing the person outright while
  // their request was open, and approving that row clears it.
  const rows = buildMemberDirectory([], [], [leaveRequest()]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "leaving");
  assert.equal(rows[0].leaveRequest?.id, "lr1");
  assert.equal(rows[0].member, null, "they are not on this page, so there is no member record");
});

test("a request is not shown twice when its member is on the page", () => {
  // The standalone row and the decorated member row are the same request. Both would offer
  // Approve, and approving one would leave the other pointing at a settled request.
  const rows = buildMemberDirectory([member()], [], [leaveRequest()]);

  assert.equal(rows.filter((row) => row.leaveRequest?.id === "lr1").length, 1);
});

test("the Requests filter is everything waiting on a decision", () => {
  const rows = buildMemberDirectory(
    [member()],
    [],
    [leaveRequest(), invite({ id: "jr", email: "ky@gmail.com", status: "REQUESTED" })],
  );

  assert.deepEqual(
    filterMemberDirectory(rows, "requested").map((row) => row.email).sort(),
    ["ky@gmail.com", "tu@warptalk.io.vn"],
    "a leave request is a request — the Admin has to answer both",
  );
});

test("asking to leave does not remove somebody from their role yet", () => {
  // They are still an Owner of this workspace until an Admin says otherwise, so a role filter
  // — a question about the workspace as it stands — must still find them.
  const rows = buildMemberDirectory([member({ roleName: "Owner" })], [], [leaveRequest()]);

  assert.deepEqual(filterMemberDirectory(rows, "owner").map((row) => row.email), [
    "tu@warptalk.io.vn",
  ]);
});
