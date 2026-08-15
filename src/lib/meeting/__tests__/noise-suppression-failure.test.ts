import assert from "node:assert/strict";
import test from "node:test";

import { describeNoiseSuppressionFailure } from "../noise-suppression-failure.ts";

/**
 * WT-427 — three different failures, one message, and for one of them the message was false.
 *
 * useTrackProcessors already distinguishes "threw while attaching" from "attached but refused to
 * enable". The handler took no argument, so that distinction was discarded one function later and
 * everybody was told the same thing: "enhanced suppression will retry after reload."
 */

test("an unentitled LiveKit project is named, and not offered a retry", () => {
  // The case where the old message was actively false. Reloading cannot fix an entitlement, so a
  // user told to reload reloads forever and reports the feature as broken — which is what happened.
  const failure = describeNoiseSuppressionFailure(
    new Error("Krisp attached but did not enable — this LiveKit project or browser cannot run it."),
  );

  assert.equal(failure.retryable, false);
  assert.match(failure.detail, /LiveKit project/);
});

test("a load failure is retryable and says so", () => {
  // CSP, a blocked CDN, a transient network failure — these genuinely can change between loads.
  const failure = describeNoiseSuppressionFailure(
    new Error("Failed to fetch dynamically imported module"),
  );

  assert.equal(failure.retryable, true);
  assert.match(failure.detail, /try again/i);
});

test("every message says the microphone is still filtered", () => {
  // None of these is an outage. useTrackProcessors restores the browser's own suppression BEFORE
  // reporting, deliberately, so a message that reads like a failure overstates what happened.
  for (const error of [
    new Error("Krisp attached but did not enable — this LiveKit project or browser cannot run it."),
    new Error("boom"),
    "a bare string",
    null,
    undefined,
  ]) {
    const failure = describeNoiseSuppressionFailure(error);
    assert.match(
      failure.detail,
      /browser's own noise suppression/,
      `"${String(error)}" reported an outage rather than a downgrade`,
    );
  }
});

test("a non-Error value does not crash the toast", () => {
  // This value crosses a `catch (error)` boundary, so it is `unknown` and can be anything.
  assert.doesNotThrow(() => describeNoiseSuppressionFailure({ weird: true }));
  assert.doesNotThrow(() => describeNoiseSuppressionFailure(null));
});
