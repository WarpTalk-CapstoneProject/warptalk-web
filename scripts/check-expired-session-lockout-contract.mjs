// A dead access token must never read as a live session, and /login must never become
// unreachable.
//
// The bug this guards against locked users out of their own account with no way back. The
// cookie was written with a hardcoded seven-day lifetime around a thirty-minute token, the
// middleware asked only whether the cookie existed, and because it existed the middleware
// redirected every request for /login to /workspace. The user got an infinite spinner on a
// page whose every API call 401'd, and the one page that could have repaired the session
// was the one page they could not reach.
//
// These are source-level assertions on purpose: the behaviour is spread across middleware,
// a cookie writer and four sign-in call sites, and any one of them silently reverting puts
// the lockout back.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(root, rel), "utf8");

const sessionCookie = await read("src/lib/auth/session-cookie.ts");
const proxy = await read("src/proxy.ts");
const client = await read("src/lib/api/client.ts");
const authStore = await read("src/stores/auth-store.ts");
const signalr = await read("src/lib/realtime/signalr.ts");
const landingRedirect = await read("src/lib/auth/landing-redirect.ts");

const callSites = [
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/register/page.tsx",
  "src/app/desktop-login/page.tsx",
  "src/app/(app)/workspace/join/page.tsx",
];
const callSiteSources = Object.fromEntries(
  await Promise.all(callSites.map(async (rel) => [rel, await read(rel)])),
);

const checks = [];

// ── One writer ────────────────────────────────────────────────────────────────
checks.push([
  "the cookie is written in exactly one place",
  sessionCookie.includes("export function setAccessTokenCookie"),
]);

for (const [rel, source] of Object.entries(callSiteSources)) {
  checks.push([
    `${rel} does not define its own cookie writer`,
    !/function setAccessTokenCookie/.test(source),
  ]);
  checks.push([
    `${rel} does not write access_token to document.cookie directly`,
    !/document\.cookie\s*=\s*`access_token=/.test(source),
  ]);
}

for (const source of [client, signalr, authStore]) {
  checks.push([
    "no module re-stamps access_token with a hardcoded lifetime",
    !/document\.cookie\s*=\s*`access_token=[^`]*max-age/.test(source),
  ]);
}

// ── The expiry is derived, never guessed ──────────────────────────────────────
checks.push([
  "expiresAt is a required argument, so a call site cannot omit it",
  /export function setAccessTokenCookie\(\s*accessToken: string,\s*expiresAt: string \| null \| undefined/.test(
    sessionCookie,
  ),
]);
checks.push([
  "the cookie expiry is the earlier of expiresAt and the token's own exp claim",
  sessionCookie.includes("Math.min(fromClaim, fromResponse)"),
]);
checks.push([
  "there is no seven-day fallback anywhere in the cookie writer",
  !/7\s*\*\s*24\s*\*\s*60\s*\*\s*60/.test(
    sessionCookie.slice(sessionCookie.indexOf("export function buildAccessTokenCookie")),
  ),
]);
checks.push([
  "an already expired token is refused rather than written",
  /if \(expiryMs !== null && expiryMs <= nowMs\) return null;/.test(sessionCookie),
]);

for (const [rel, source] of Object.entries(callSiteSources)) {
  const calls = source.match(/setAccessTokenCookie\([^)]*\)/g) ?? [];
  checks.push([`${rel} calls the shared writer at least once`, calls.length > 0]);
  checks.push([
    `${rel} passes expiresAt at every call site`,
    calls.every((call) => call.includes("expiresAt")),
  ]);
}

// ── Middleware gates on validity, not presence ────────────────────────────────
checks.push([
  "middleware decodes the token instead of testing for truthiness",
  proxy.includes("isLiveAccessToken"),
]);
checks.push([
  "the redirect away from /login requires a live token",
  /if \(hasLiveAccessToken && \(isAuthRoute/.test(proxy),
]);
checks.push([
  "a stale cookie is deleted by the response that noticed it",
  proxy.includes("response.cookies.delete(ACCESS_TOKEN_COOKIE)"),
]);
checks.push([
  "route access survives an expired access token via the session marker",
  proxy.includes("SESSION_MARKER_COOKIE") && proxy.includes("hasSession"),
]);
checks.push([
  "workspace-scoped routes do not render a 404 before the client can refresh",
  proxy.includes("isWorkspaceScopedRoute") &&
    proxy.includes("WORKSPACE_GATEWAY_PATH") &&
    /!hasLiveAccessToken && hasSession && isWorkspaceScopedRoute\(pathname\)/.test(proxy),
]);

// ── Nothing stale survives to mislead the next load ───────────────────────────
checks.push([
  "logout clears both session cookies",
  authStore.includes("clearSessionCookies()"),
]);
checks.push([
  "a persisted session with no way to refresh is dropped on rehydrate",
  authStore.includes("onRehydrateStorage") && authStore.includes("isLiveAccessToken"),
]);
checks.push([
  "the landing page asks whether the remembered session is live",
  landingRedirect.includes("isLiveAccessToken"),
]);

// ── The way out of a dead session stays open ──────────────────────────────────
for (const endpoint of [
  "/auth/login",
  "/auth/google-login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
]) {
  checks.push([
    `${endpoint} is exempt from the dead-session latch`,
    client.includes(`"${endpoint}"`),
  ]);
}
checks.push([
  "auth endpoints are matched by path, not by substring",
  !client.includes('url?.includes("/auth/login")'),
]);

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exitCode = 1;
}
