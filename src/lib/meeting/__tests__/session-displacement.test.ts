import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIVEKIT_DUPLICATE_IDENTITY,
  isDisplacedConnectionError,
  isDisplacedHubReason,
  isDuplicateIdentityDisconnect,
} from "../session-displacement.ts";

/**
 * The same account in one meeting from two devices: both servers evict the older connection, and
 * the evicted tab must recognise that instead of reconnecting (prod, 1 Oct 2026).
 */

test("LiveKit's DUPLICATE_IDENTITY disconnect is recognised, and no other reason is", () => {
  assert.equal(isDuplicateIdentityDisconnect(LIVEKIT_DUPLICATE_IDENTITY), true);
  // CLIENT_INITIATED, SERVER_SHUTDOWN, PARTICIPANT_REMOVED, ROOM_DELETED — and no reason at all.
  for (const reason of [1, 3, 4, 5, undefined, null, "2"]) {
    assert.equal(isDuplicateIdentityDisconnect(reason), false, `reason ${String(reason)}`);
  }
});

test("a connect refused by a leave request for a duplicate identity is a displacement", () => {
  // Shape of livekit-client's ConnectionError.leaveRequest(message, DisconnectReason).
  const error = Object.assign(new Error("Received leave request while trying to (re)connect"), {
    name: "ConnectionError",
    reasonName: "LeaveRequest",
    context: LIVEKIT_DUPLICATE_IDENTITY,
  });
  assert.equal(isDisplacedConnectionError(error), true);
});

test("a leave request for another reason is not a displacement", () => {
  const error = Object.assign(new Error("Received leave request while trying to (re)connect"), {
    reasonName: "LeaveRequest",
    context: 5, // ROOM_DELETED
  });
  assert.equal(isDisplacedConnectionError(error), false);
});

test("ordinary network failures are not displacements", () => {
  for (const message of ["could not establish pc connection", "WebSocket closed", "network error"]) {
    assert.equal(isDisplacedConnectionError(new Error(message)), false);
  }
  assert.equal(isDisplacedConnectionError(null), false);
  assert.equal(isDisplacedConnectionError("DUPLICATE_IDENTITY"), false);
});

test("the hub's 'another device' kick is a displacement, a cancelled room is not", () => {
  // Verbatim from TranslationRoomHub.JoinTranslationRoom and TranslationRoomRedisSubscriberService.
  assert.equal(isDisplacedHubReason("You have joined from another device."), true);
  assert.equal(isDisplacedHubReason("This room has been cancelled."), false);
  assert.equal(isDisplacedHubReason(undefined), false);
});
