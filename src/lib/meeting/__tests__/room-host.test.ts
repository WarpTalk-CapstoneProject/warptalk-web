import assert from "node:assert/strict";
import test from "node:test";

import { isInvitedToRoom, resolveRoomHost } from "../room-host.ts";

test("resolves another room creator from workspace members", () => {
  const host = resolveRoomHost(
    { hostId: "creator-id" },
    [
      {
        id: "membership-id",
        userId: "creator-id",
        fullName: "Nguyen Van Creator",
        email: "creator@example.com",
        avatarUrl: "https://example.com/creator.png",
      },
    ],
    {
      id: "viewer-id",
      fullName: "Invited Viewer",
      email: "viewer@example.com",
    },
  );

  assert.deepEqual(host, {
    userId: "creator-id",
    name: "Nguyen Van Creator",
    email: "creator@example.com",
    avatarUrl: "https://example.com/creator.png",
    role: "Host",
  });
});

test("uses the signed-in creator profile for their own room", () => {
  const host = resolveRoomHost(
    { hostId: "creator-id" },
    [],
    {
      id: "creator-id",
      fullName: "Current Creator",
      email: "creator@example.com",
      avatarUrl: "https://example.com/current.png",
    },
  );

  assert.deepEqual(host, {
    userId: "creator-id",
    name: "Current Creator",
    email: "creator@example.com",
    avatarUrl: "https://example.com/current.png",
    role: "Host",
  });
});

/**
 * The chip keys presence and its own identity on `userId`, so an unmatched host — someone who
 * left the workspace, or a member past the page the caller fetched — must still carry the id.
 * Returning only the "Host" placeholder name is what makes the chip a dead end again.
 */
test("still carries the host id when nobody matches", () => {
  const host = resolveRoomHost({ hostId: "ghost-id" }, [], {
    id: "viewer-id",
    fullName: "Invited Viewer",
  });

  assert.equal(host.userId, "ghost-id");
  assert.equal(host.name, "Host");
  assert.equal(host.email, undefined);
});

// ── isInvitedToRoom: the meetings list's "Invited" badge ─────────────────────

test("a member sees Invited on a room somebody else booked and hosts", () => {
  // For a member the server lists only rooms they host, booked, joined or were invited to, so a
  // row that is neither of the first two is an invitation (or a room they joined).
  assert.equal(
    isInvitedToRoom({ hostId: "booker-id", isHost: false }, "viewer-id", "member"),
    true,
  );
});

test("the host a room was handed to is not told they were invited to it", () => {
  // `hostId` is still the booker after a transfer; `isHost` is the effective host.
  assert.equal(
    isInvitedToRoom({ hostId: "booker-id", isHost: true }, "viewer-id", "member"),
    false,
  );
});

test("the booker is never Invited, even after handing the room over", () => {
  assert.equal(
    isInvitedToRoom({ hostId: "viewer-id", isHost: false }, "viewer-id", "member"),
    false,
  );
  assert.equal(
    isInvitedToRoom({ hostId: "viewer-id", isHost: true }, "viewer-id", "member"),
    false,
  );
});

test("an Owner/Admin gets no Invited badge — the list shows her every room, invited or not", () => {
  for (const role of ["owner", "admin"] as const) {
    assert.equal(
      isInvitedToRoom({ hostId: "booker-id", isHost: false }, "viewer-id", role),
      false,
      `${role} sees the whole workspace; the row cannot tell an invitation from that`,
    );
  }
});

test("an unresolved role is not read as member — it might be an Owner/Admin", () => {
  assert.equal(
    isInvitedToRoom({ hostId: "booker-id", isHost: false }, "viewer-id", null),
    false,
  );
});

test("no signed-in viewer, no claim", () => {
  assert.equal(isInvitedToRoom({ hostId: "booker-id" }, undefined, "member"), false);
  assert.equal(isInvitedToRoom({ hostId: "booker-id" }, null, "member"), false);
});
