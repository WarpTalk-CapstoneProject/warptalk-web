import assert from "node:assert/strict";
import { test } from "node:test";

import { describeLiveKitError } from "./livekit-error.ts";

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

test("an unrecognised failure keeps its original wording rather than inventing one", () => {
  // The raw text is the only thing anyone can search for when the cause is unknown.
  assert.match(describeLiveKitError(new Error("SFU exploded")), /SFU exploded/);
});

test("a non-Error value does not produce 'undefined' on screen", () => {
  assert.equal(describeLiveKitError(null), "Could not join the meeting.");
  assert.equal(describeLiveKitError(undefined), "Could not join the meeting.");
});
