import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseNewestAccessToken,
  isAccessTokenExpiring,
} from "../token-lifecycle.ts";

function tokenWithExpiry(expSeconds: number) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.signature`;
}

test("refreshes proactively when the access token is near expiry", () => {
  const nowMs = 1_000_000;
  const token = tokenWithExpiry(Math.floor(nowMs / 1000) + 20);

  assert.equal(isAccessTokenExpiring(token, nowMs, 30_000), true);
});

test("keeps a token that remains valid beyond the refresh window", () => {
  const nowMs = 1_000_000;
  const token = tokenWithExpiry(Math.floor(nowMs / 1000) + 120);

  assert.equal(isAccessTokenExpiring(token, nowMs, 30_000), false);
});

test("chooses the newest token instead of blindly preferring a stale cookie", () => {
  const older = tokenWithExpiry(2_000);
  const newer = tokenWithExpiry(3_000);

  assert.equal(chooseNewestAccessToken(older, newer), newer);
  assert.equal(chooseNewestAccessToken(newer, older), newer);
});

test("treats malformed tokens as expiring", () => {
  assert.equal(isAccessTokenExpiring("not-a-jwt", Date.now(), 30_000), true);
});
