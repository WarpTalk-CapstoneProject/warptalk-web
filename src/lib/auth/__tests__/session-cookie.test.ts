import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_TOKEN_COOKIE,
  SESSION_DEAD_COOKIE,
  buildAccessTokenCookie,
  clearSessionDeadMarker,
  isLiveAccessToken,
  isSessionDeadMarked,
  markSessionDead,
  resolveAccessTokenExpiryMs,
  setAccessTokenCookie,
} from "../session-cookie.ts";

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


// ── an aged-out access token is not a sign-out ──────────────────────────────────────

test("an access token that arrives already expired clears only itself", () => {
  // This branch used to call clearSessionCookies(), taking the seven-day marker with it.
  // The marker is what tells middleware there is still a refresh token worth redeeming, so
  // removing it turned a token that had merely aged out into a full sign-out — the exact
  // "every 7-day session becomes a 30-minute one" this module's header exists to prevent.
  const written: string[] = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      set cookie(value: string) {
        written.push(value);
      },
      get cookie() {
        return "";
      },
    },
  });

  try {
    setAccessTokenCookie(deadToken, new Date(NOW - 60_000).toISOString());
  } finally {
    // @ts-expect-error the test environment had no document before this
    delete globalThis.document;
  }

  const cleared = written.join("\n");
  assert.match(cleared, /access_token=;/);
  assert.doesNotMatch(
    cleared,
    /warptalk_session=;/,
    "the session marker must survive an expired access token",
  );
});

// ── The dead-session mark ───────────────────────────────────────────────────────────────────
//
// The logout storm of 16 Aug, in one sentence: `endDeadSession()` leaves by reassigning
// window.location, which destroys every module-level guard in the tab, and `proxy.ts` then
// bounced the visitor straight back into the app on the strength of an HttpOnly cookie only it
// could see. Each bounce was a fresh page with a clean latch and one more POST /auth/logout —
// 240 refusals in a minute from one address. The latch therefore has to outlive a page load,
// and the middleware has to be able to read it.

/** sessionStorage and document.cookie, for a runner that has neither. */
function withBrowserStorage<T>(run: (written: string[]) => T): T {
  const written: string[] = [];
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      set cookie(value: string) {
        written.push(value);
      },
      get cookie() {
        return "";
      },
    },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });

  try {
    return run(written);
  } finally {
    // @ts-expect-error the test environment had neither before this
    delete globalThis.document;
    // @ts-expect-error the test environment had neither before this
    delete globalThis.sessionStorage;
  }
}

test("the dead-session mark survives where a module variable cannot", () => {
  withBrowserStorage(() => {
    assert.equal(isSessionDeadMarked(), false);
    markSessionDead();
    // sessionStorage outlives the full page navigation endDeadSession() performs; the module
    // flag it used to rely on does not, which is why the loop came back round every time.
    assert.equal(isSessionDeadMarked(), true);
  });
});

test("the mark is also a cookie, because the middleware cannot read sessionStorage", () => {
  withBrowserStorage((written) => {
    markSessionDead();
    const cookie = written.join("\n");
    assert.match(cookie, new RegExp(`${SESSION_DEAD_COOKIE}=1`));
    // Short-lived on purpose: a stale one must never become a second way to strand somebody.
    assert.match(cookie, /max-age=120/);
  });
});

test("signing in clears both halves, or the trap just points the other way", () => {
  withBrowserStorage((written) => {
    markSessionDead();
    clearSessionDeadMarker();

    assert.equal(isSessionDeadMarked(), false);
    assert.match(written.join("\n"), new RegExp(`${SESSION_DEAD_COOKIE}=;`));
  });
});

test("nothing throws when storage is unavailable", () => {
  // Private mode, or a blocked third-party context. Losing the cross-load half of the latch is
  // survivable; throwing inside a sign-out is not.
  assert.doesNotThrow(() => {
    markSessionDead();
    clearSessionDeadMarker();
  });
  assert.equal(isSessionDeadMarked(), false);
});
