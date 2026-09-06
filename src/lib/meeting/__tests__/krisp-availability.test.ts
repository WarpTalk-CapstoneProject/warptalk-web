import assert from "node:assert/strict";
import test from "node:test";

import { shouldAttemptKrispNoiseFilter } from "../krisp-availability.ts";

test("does not call Krisp against local self-hosted LiveKit", () => {
  assert.equal(shouldAttemptKrispNoiseFilter("ws://localhost:7880"), false);
  assert.equal(shouldAttemptKrispNoiseFilter("ws://127.0.0.1:7880"), false);
  assert.equal(shouldAttemptKrispNoiseFilter("ws://[::1]:7880"), false);
});

test("keeps Krisp enabled for remote LiveKit deployments", () => {
  assert.equal(shouldAttemptKrispNoiseFilter("wss://project.livekit.cloud"), true);
});

test("keeps Krisp enabled when no endpoint is configured", () => {
  assert.equal(shouldAttemptKrispNoiseFilter(undefined), true);
});
