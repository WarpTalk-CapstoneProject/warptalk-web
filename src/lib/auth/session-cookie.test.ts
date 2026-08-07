import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_TOKEN_COOKIE,
  buildAccessTokenCookie,
  isLiveAccessToken,
  resolveAccessTokenExpiryMs,
} from "./session-cookie.ts";

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function b64url(value: object) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Obviously fake, locally generated. Nothing here verifies signatures. */
function jwt(expEpochSeconds: number | null) {
  const payload: Record<string, unknown> = { sub: "test-user" };
  if (expEpochSeconds !== null) payload.exp = expEpochSeconds;
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.not-a-real-signature`;
}

const liveToken = jwt(Math.floor(NOW / 1000) + 1800); // +30 min, as the backend issues
const deadToken = jwt(Math.floor(NOW / 1000) - 60); // expired one minute ago

test("an expired token is not live, however recently it expired", () => {
  assert.equal(isLiveAccessToken(liveToken, NOW), true);
  assert.equal(isLiveAccessToken(deadToken, NOW), false);
});

test("a token that cannot be decoded is treated as not live", () => {
  // The exact shape the route contract used to send, and the shape any corrupted cookie
  // takes. Presence must never be mistaken for validity.
  assert.equal(isLiveAccessToken("route-contract-placeholder", NOW), false);
  assert.equal(isLiveAccessToken("not.a.jwt", NOW), false);
  assert.equal(isLiveAccessToken(jwt(null), NOW), false);
  assert.equal(isLiveAccessToken("", NOW), false);
  assert.equal(isLiveAccessToken(null, NOW), false);
  assert.equal(isLiveAccessToken(undefined, NOW), false);
});

test("the cookie expiry comes from the response's expiresAt", () => {
  const expiresAt = new Date(NOW + 1800_000).toISOString();
  assert.equal(resolveAccessTokenExpiryMs(liveToken, expiresAt), NOW + 1800_000);
});

test("a response claiming a longer life than the token has cannot extend the cookie", () => {
  // The defect in one assertion: expiresAt said seven days, the token died in thirty
  // minutes, and the cookie believed expiresAt.
  const sevenDaysOut = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(resolveAccessTokenExpiryMs(liveToken, sevenDaysOut), NOW + 1800_000);
});

test("a missing or unparseable expiresAt falls back to the token's own exp claim", () => {
  assert.equal(resolveAccessTokenExpiryMs(liveToken, undefined), NOW + 1800_000);
  assert.equal(resolveAccessTokenExpiryMs(liveToken, ""), NOW + 1800_000);
  assert.equal(resolveAccessTokenExpiryMs(liveToken, "not a date"), NOW + 1800_000);
});

test("with neither source readable there is no expiry to assert", () => {
  assert.equal(resolveAccessTokenExpiryMs("opaque-token", undefined), null);
});

test("the written cookie expires with the token, never seven days later", () => {
  const cookie = buildAccessTokenCookie(liveToken, new Date(NOW + 1800_000).toISOString(), NOW);
  assert.ok(cookie);
  assert.ok(cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=${liveToken};`));
  assert.match(cookie, /expires=Thu, 15 Jan 2026 12:30:00 GMT/);
  assert.doesNotMatch(cookie, /max-age/i);
  assert.match(cookie, /SameSite=Lax/);
});

test("an already dead token is refused rather than written", () => {
  assert.equal(buildAccessTokenCookie(deadToken, new Date(NOW - 60_000).toISOString(), NOW), null);
  // Even when the response insists the session is good for another week.
  const sevenDaysOut = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(buildAccessTokenCookie(deadToken, sevenDaysOut, NOW), null);
});

test("an unsubstantiated lifetime produces a session cookie, not a seven day guess", () => {
  const cookie = buildAccessTokenCookie("opaque-token", undefined, NOW);
  assert.ok(cookie);
  assert.doesNotMatch(cookie, /expires=/i);
  assert.doesNotMatch(cookie, /max-age/i);
});
