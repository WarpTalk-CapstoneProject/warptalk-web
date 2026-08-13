import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMemberDirectory,
  filterMemberDirectory,
  groupMemberRowsByMembership,
  nameFromEmail,
} from "../member-directory.ts";
import type { WorkspaceMemberDto } from "@/types/workspace";

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

test("member directory contains active joined members only", () => {
  const rows = buildMemberDirectory([
    member(),
    member({
      id: "m2",
      userId: "u2",
      email: "pending@warptalk.io.vn",
      fullName: "Pending Person",
      status: "Invited",
      roleName: "Member",
    }),
    member({
      id: "m3",
      userId: "u3",
      email: "suspended@warptalk.io.vn",
      fullName: "Suspended Person",
      status: "Suspended",
      roleName: "Member",
    }),
  ]);

  assert.deepEqual(rows.map((row) => row.email), ["tu@warptalk.io.vn"]);
});

test("members are sorted by role and access level", () => {
  const rows = buildMemberDirectory([
    member({
      id: "external",
      userId: "external",
      fullName: "External Member",
      email: "external@gmail.com",
      roleName: "Member",
      membershipType: "External",
      joinedAt: "2026-08-10T00:00:00Z",
    }),
    member({
      id: "internal",
      userId: "internal",
      fullName: "Internal Member",
      email: "internal@warptalk.io.vn",
      roleName: "Member",
      membershipType: "Internal",
      joinedAt: "2026-08-11T00:00:00Z",
    }),
    member({
      id: "admin",
      userId: "admin",
      fullName: "Admin User",
      email: "admin@warptalk.io.vn",
      roleName: "Admin",
      joinedAt: "2026-08-12T00:00:00Z",
    }),
    member(),
  ]);

  assert.deepEqual(
    rows.map((row) => [row.roleName, row.membershipType, row.email]),
    [
      ["Owner", "Internal", "tu@warptalk.io.vn"],
      ["Admin", "Internal", "admin@warptalk.io.vn"],
      ["Member", "Internal", "internal@warptalk.io.vn"],
      ["Member", "External", "external@gmail.com"],
    ],
  );
});

test("filters exclude owner tab while still allowing member access filters", () => {
  const rows = buildMemberDirectory([
    member(),
    member({ id: "a", userId: "a", roleName: "Admin", email: "a@warptalk.io.vn" }),
    member({ id: "i", userId: "i", roleName: "Member", email: "i@warptalk.io.vn" }),
    member({
      id: "e",
      userId: "e",
      roleName: "Member",
      membershipType: "External",
      email: "e@gmail.com",
    }),
  ]);

  assert.deepEqual(filterMemberDirectory(rows, "admin").map((row) => row.email), [
    "a@warptalk.io.vn",
  ]);
  assert.deepEqual(filterMemberDirectory(rows, "member").map((row) => row.email), [
    "i@warptalk.io.vn",
    "e@gmail.com",
  ]);
  assert.deepEqual(filterMemberDirectory(rows, "internal").map((row) => row.email), [
    "tu@warptalk.io.vn",
    "a@warptalk.io.vn",
    "i@warptalk.io.vn",
  ]);
  assert.deepEqual(filterMemberDirectory(rows, "external").map((row) => row.email), [
    "e@gmail.com",
  ]);
});

test("member groups split internal and external rows for table rendering", () => {
  const rows = buildMemberDirectory([
    member(),
    member({
      id: "e",
      userId: "e",
      roleName: "Member",
      membershipType: "External",
      email: "e@gmail.com",
    }),
  ]);

  const grouped = groupMemberRowsByMembership(rows);
  assert.deepEqual(grouped.internal.map((row) => row.email), ["tu@warptalk.io.vn"]);
  assert.deepEqual(grouped.external.map((row) => row.email), ["e@gmail.com"]);
});

test("an invited person is named by their address until they have a name", () => {
  assert.equal(nameFromEmail("hanh.nhi@warptalk.io.vn"), "hanh.nhi");
  assert.equal(nameFromEmail("nobody"), "nobody");
});
