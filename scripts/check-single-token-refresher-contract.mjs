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

// This assertion used to require the opposite order, on the reasoning that persistTokens
// writes the in-memory store first so the store can never be staler. That is true of ONE tab.
// zustand's persist middleware does not listen for the storage event, so a second tab's store
// never learns that the first tab rotated the family — it refreshes with a token the server
// has already retired, which is a replay, which revokes the family and logs both tabs out.
// localStorage is the only copy the tabs share, so it is the one to trust; persistTokens now
// writes it synchronously, which is what makes trusting it safe.
const refresherAt = client.indexOf("function getRefreshToken()");
assert.ok(refresherAt > 0, "getRefreshToken must exist.");
const body = client.slice(refresherAt, refresherAt + 1400);
const storeAt = body.indexOf("useAuthStore.getState().refreshToken");
const persistedAt = body.indexOf("getPersistedAuthState()?.refreshToken");
assert.ok(storeAt > 0 && persistedAt > 0, "Both token sources must still be consulted.");
assert.ok(
  persistedAt < storeAt,
  "The shared persisted copy must be preferred — the in-memory store is per-tab and goes stale the moment another tab rotates the family.",
);
assert.match(
  client,
  /function persistTokens\([\s\S]{0,300}writePersistedTokens\(accessToken, refreshToken\)/,
  "persistTokens must write localStorage synchronously — preferring it is only safe if it is not behind.",
);

console.log("Single token refresher contract: PASS");
