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
    name: "Nguyen Van Creator",
    avatarUrl: "https://example.com/creator.png",
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
    name: "Current Creator",
    avatarUrl: "https://example.com/current.png",
  });
});
