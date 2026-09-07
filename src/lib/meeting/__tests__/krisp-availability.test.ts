import assert from "node:assert/strict";
import test from "node:test";

import { shouldAttemptKrispNoiseFilter } from "../krisp-availability.ts";

/**
 * The argument is optional and the only production caller omits it, so every test here has to say
 * what `NEXT_PUBLIC_LIVEKIT_URL` is. Reading whatever the surrounding shell happens to hold makes a
 * test that passes on a laptop and fails in CI, which is exactly what happened: CI sets the
 * variable to `ws://127.0.0.1:7880` for the whole job, so "no endpoint is configured" was never
 * true there.
 */
function withLivekitUrl<T>(value: string | undefined, body: () => T): T {
  const previous = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (value === undefined) delete process.env.NEXT_PUBLIC_LIVEKIT_URL;
  else process.env.NEXT_PUBLIC_LIVEKIT_URL = value;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_LIVEKIT_URL;
    else process.env.NEXT_PUBLIC_LIVEKIT_URL = previous;
  }
}

test("does not call Krisp against local self-hosted LiveKit", () => {
  assert.equal(shouldAttemptKrispNoiseFilter("ws://localhost:7880"), false);
  assert.equal(shouldAttemptKrispNoiseFilter("ws://127.0.0.1:7880"), false);
  assert.equal(shouldAttemptKrispNoiseFilter("ws://[::1]:7880"), false);
});

test("keeps Krisp enabled for remote LiveKit deployments", () => {
  assert.equal(shouldAttemptKrispNoiseFilter("wss://project.livekit.cloud"), true);
});

test("keeps Krisp enabled when no endpoint is configured anywhere", () => {
  withLivekitUrl(undefined, () => {
    assert.equal(shouldAttemptKrispNoiseFilter(), true);
  });
});

/**
 * `use-track-processors.ts` calls this with no argument, so the environment variable is the real
 * input in production. A test that only ever passes the URL explicitly would leave that path
 * unproven — and it is the path that decides whether a developer running against a local LiveKit
 * server gets the 404 this file exists to avoid.
 */
test("falls back to the configured endpoint when called with no argument", () => {
  withLivekitUrl("ws://127.0.0.1:7880", () => {
    assert.equal(shouldAttemptKrispNoiseFilter(), false);
  });
  withLivekitUrl("wss://project.livekit.cloud", () => {
    assert.equal(shouldAttemptKrispNoiseFilter(), true);
  });
});

test("an explicit endpoint wins over the environment", () => {
  withLivekitUrl("ws://127.0.0.1:7880", () => {
    assert.equal(shouldAttemptKrispNoiseFilter("wss://project.livekit.cloud"), true);
  });
});
