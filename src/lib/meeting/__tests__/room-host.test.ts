import assert from "node:assert/strict";
import test from "node:test";

import { resolveRoomHost } from "../room-host.ts";

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
