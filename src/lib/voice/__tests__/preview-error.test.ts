import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PREVIEW_FALLBACK_MESSAGE,
  previewErrorMessageFor,
} from "../preview-error.ts";

test("a known code decides the copy, whatever sentence the server sent", () => {
  assert.equal(
    previewErrorMessageFor("SERVICE_UNAVAILABLE", "something else entirely"),
    "The preview is taking longer than expected. Try again in a moment.",
  );
  assert.equal(
    previewErrorMessageFor("FORBIDDEN", undefined),
    "That voice is not one you can preview.",
  );
});

test("an unknown code keeps the server's own message", () => {
  // Load-bearing for deployment order. This client can ship before the API, and the old API
  // answers INVALID_STATE for a render timeout with the correct sentence beside it. Collapsing
  // an unrecognised code to generic copy would delete that sentence and make WT-649 worse until
  // the backend caught up.
  assert.equal(
    previewErrorMessageFor("INVALID_STATE", "The preview is taking longer than expected."),
    "The preview is taking longer than expected.",
  );
  assert.equal(previewErrorMessageFor("SOMETHING_NEW", "A named reason."), "A named reason.");
});

test("nothing usable falls back to the generic message", () => {
  assert.equal(previewErrorMessageFor(undefined, undefined), PREVIEW_FALLBACK_MESSAGE);
  assert.equal(previewErrorMessageFor(undefined, "   "), PREVIEW_FALLBACK_MESSAGE);
  assert.equal(previewErrorMessageFor(undefined, ""), PREVIEW_FALLBACK_MESSAGE);
});

test("a bare HTTP status is not mistaken for a code", () => {
  // apiErrorCode falls back to the numeric status when the body carries no code. A number must
  // never index the map, and must not suppress the server's message either.
  assert.equal(previewErrorMessageFor(503, "Gateway is down."), "Gateway is down.");
  assert.equal(previewErrorMessageFor(500, undefined), PREVIEW_FALLBACK_MESSAGE);
});
