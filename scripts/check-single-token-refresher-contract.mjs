import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * One refresher, behind one lock.
 *
 * Refresh tokens rotate, and AuthService revokes the WHOLE rotation family the moment an
 * already-rotated token is presented again — it reads a replay as a stolen token, which is
 * correct. That makes a second refresher anywhere in the client a session that ends itself.
 *
 * lib/signalr.ts had one: its own in-flight promise, its own expiry check, its own POST to
 * /auth/refresh, and — unlike lib/api/client.ts — no cross-tab Web Lock at all. Every time a
 * hub reconnect landed near an HTTP request, one of them presented the token the other had
 * just rotated away, the family was revoked, and the user was returned to the login screen
 * roughly every half hour with nothing on screen to explain it.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const client = read("src/lib/api/client.ts");

// The single refresher, and the lock that makes it single across tabs.
assert.match(
  client,
  /navigator\.locks\.request\("warptalk-auth-refresh"/,
  "The refresh must hold a cross-tab Web Lock, or two tabs race and revoke the family.",
);
assert.match(
  client,
  /export async function getUsableAccessToken/,
  "The one refresher must be exported so nothing needs to build a second.",
);

// Nothing outside client.ts may talk to the refresh endpoint directly. Checked by URL rather
// than by prose so a comment explaining the rule cannot trip it — this repo has failed a
// contract on its own explanatory comment before.
for (const rel of [
  "src/lib/realtime/signalr.ts",
  "src/stores/auth-store.ts",
  "src/components/providers/realtime-notification-provider.tsx",
]) {
  const source = read(rel);
  assert.ok(
    !/["'`][^"'`]*\/auth\/refresh/.test(source),
    `${rel} must not call /auth/refresh — use getUsableAccessToken() from lib/api/client.`,
  );
}

const signalr = read("src/lib/realtime/signalr.ts");
assert.match(
  signalr,
  /getUsableAccessToken\(\)/,
  "The hub must take its token from the shared refresher.",
);
assert.ok(
  !signalr.includes("refreshPromise"),
  "lib/signalr.ts must not keep an in-flight refresh of its own.",
);

// The refresh token is no longer JS's to hold.
//
// This block used to arbitrate between two client-side copies of it — the zustand store and
// localStorage — because a stale copy meant a replay, and a replay revokes the whole rotation
// family and logs every tab out. That arbitration is gone rather than fixed: the token now lives
// in an HttpOnly cookie the browser attaches itself, so there is no copy to go stale and no
// second source to disagree with. The bug it was managing was the ~30-minute forced logout in
// production, where the client held a token the server had already rotated away.
//
// What has to stay true is that no client-side copy comes back.
assert.ok(
  !client.includes("function getRefreshToken()"),
  "getRefreshToken must not come back — the refresh token is an HttpOnly cookie, not JS state.",
);
// Comments stripped first: these files explain at length why the client-side copy went away, and
// that history is worth keeping. It is the CODE that must not hold one.
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
for (const rel of ["src/lib/api/client.ts", "src/stores/auth-store.ts", "src/types/auth.ts"]) {
  assert.ok(
    !/refreshToken/.test(withoutComments(read(rel))),
    `${rel} must not hold a refreshToken — the browser owns it now, and a JS copy is the bug.`,
  );
}

// The cookie only travels on a credentialed request, and the request must carry no token of its
// own: an empty body is what proves the server is reading the cookie rather than the client.
assert.match(
  client,
  /withCredentials:\s*true/,
  "The axios instance must send credentials, or the refresh cookie never reaches the gateway.",
);
assert.match(
  client,
  /axios\.post<AuthResponse>\([\s\S]{0,160}\{\},\s*\n?\s*\{\s*withCredentials:\s*true\s*\}/,
  "The refresh call must post an empty body with credentials — no refresh token in the payload.",
);

// The gate that replaced "do we hold a refresh token": a JS-readable marker cookie, plus the
// access token as a fallback. A false positive costs one 400 that ends the session correctly; a
// false negative — refusing to refresh while a valid cookie sits in the jar — is the logout bug.
assert.match(
  client,
  /function canAttemptRefresh\(\)[\s\S]{0,200}hasRedeemableSession\(/,
  "The refresh gate must ask hasRedeemableSession(), the only question JS can still answer.",
);

// The proactive timer wakes further out than the reactive window, so it must say so. Passing the
// default made the refresher judge the token healthy and hand it straight back — the timer fired
// on schedule and refreshed nothing, which is the second half of the same production logout.
assert.match(
  client,
  /getUsableAccessToken\(PROACTIVE_REFRESH_WINDOW_MS\)/,
  "The proactive refresh must pass its own window, or it is a no-op that looks like it ran.",
);
const lifecycle = read("src/lib/api/token-lifecycle.ts");
const margin = /PROACTIVE_REFRESH_MARGIN_MS\s*=\s*([\d_]+)/.exec(lifecycle);
const window = /PROACTIVE_REFRESH_WINDOW_MS\s*=\s*([\d_]+)/.exec(lifecycle);
assert.ok(margin && window, "Both proactive-refresh constants must exist.");
assert.ok(
  Number(margin[1].replaceAll("_", "")) < Number(window[1].replaceAll("_", "")),
  "The window must exceed the margin — setTimeout has no upper bound on lateness, and a throttled background tab fires seconds late.",
);

console.log("Single token refresher contract: PASS");
