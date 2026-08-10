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
