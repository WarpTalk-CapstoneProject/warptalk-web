import assert from "node:assert/strict";
import { test } from "node:test";

import { describeLiveKitError } from "../livekit-error.ts";

/**
 * These pin the distinction the stage could not previously make: a failure that retrying can
 * fix, and one it cannot. Both used to render as "Waiting for LiveKit".
 */

test("the quota failure says retrying will not help, because it will not", () => {
  // Verbatim from LiveKit Cloud on the project that blocked every meeting.
  const text = describeLiveKitError(
    new Error("connection minutes limit exceeded. please contact the project owner."),
  );
  assert.match(text, /connection minutes/i);
  assert.match(text, /will not help/i);
});

test("a plain 429 is also reported as a limit rather than a network blip", () => {
  const text = describeLiveKitError(new Error("Request failed with status 429"));
  assert.match(text, /limit/i);
});

test("a rejected token points at rejoining, not at the network", () => {
  const text = describeLiveKitError(new Error("invalid token"));
  assert.match(text, /token/i);
  assert.match(text, /rejoin/i);
});

test("an unreachable server points at the connection", () => {
  for (const message of ["could not establish pc connection", "WebSocket closed", "network error"]) {
    assert.match(describeLiveKitError(new Error(message)), /reach the media server/i);
  }
});

test("being displaced by the same account elsewhere is not called a network failure", () => {
  // Prod, 1 Oct 2026: a shared demo account on two devices read as "Could not reach the media
  // server", and nobody could tell it was a second login.
  const error = Object.assign(new Error("Received leave request while trying to (re)connect"), {
    reasonName: "LeaveRequest",
    context: 2, // DisconnectReason.DUPLICATE_IDENTITY
  });
  const text = describeLiveKitError(error);
  assert.doesNotMatch(text, /reach the media server/i);
  assert.match(text, /another device or tab/i);
});

test("an unrecognised failure keeps its original wording rather than inventing one", () => {
  // The raw text is the only thing anyone can search for when the cause is unknown.
  assert.match(describeLiveKitError(new Error("SFU exploded")), /SFU exploded/);
});

test("a non-Error value does not produce 'undefined' on screen", () => {
  assert.equal(describeLiveKitError(null), "Could not join the meeting.");
  assert.equal(describeLiveKitError(undefined), "Could not join the meeting.");
});
