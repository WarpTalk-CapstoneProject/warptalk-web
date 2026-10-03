import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundedText,
  canAutoRetryConnect,
  connectFailureCode,
  MAX_AUTO_CONNECT_RETRIES,
  shouldReportDisconnect,
} from "../livekit-connect-watchdog.ts";

test("retries are bounded per meeting", () => {
  assert.equal(canAutoRetryConnect({ autoRetries: 0, displaced: false }), true);
  assert.equal(
    canAutoRetryConnect({ autoRetries: MAX_AUTO_CONNECT_RETRIES, displaced: false }),
    false,
  );
});

test("a displaced session never reconnects on its own", () => {
  // Reconnecting would evict the same account on the other device, which reconnects in turn.
  assert.equal(canAutoRetryConnect({ autoRetries: 0, displaced: true }), false);
});

test("the failure code prefers LiveKit's own reason name", () => {
  assert.equal(connectFailureCode({ reasonName: "NotAllowed", reason: 0 }), "NotAllowed");
  assert.equal(connectFailureCode({ reason: 3 }), "reason_3");
  assert.equal(connectFailureCode(new TypeError("x")), "TypeError");
  assert.equal(connectFailureCode(null), null);
});

test("text sent to the server is bounded", () => {
  assert.equal(boundedText("x".repeat(1000))?.length, 300);
  assert.equal(boundedText(new Error("could not establish pc connection")), "could not establish pc connection");
  assert.equal(boundedText(undefined), null);
});

test("leaving on purpose is not reported as a disconnect", () => {
  assert.equal(shouldReportDisconnect(1), false);
  assert.equal(shouldReportDisconnect(2), true);
  assert.equal(shouldReportDisconnect(undefined), true);
});
