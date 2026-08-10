// A rejected refresh token must end the session, no matter which interceptor notices.
//
// The failure this guards against is silent and only appears in production: the request
// interceptor refreshes the access token BEFORE a request is sent, so when the server
// rejects the refresh token that error never reaches the response interceptor — the only
// place that used to log out. The app then kept isAuthenticated: true in localStorage,
// retried forever, and never showed a login screen. Every deploy that restarts
// auth-service can put a user in exactly that state.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = await readFile(path.join(root, "src/lib/api/client.ts"), "utf8");

const requestInterceptor = client.slice(
  client.indexOf("apiClient.interceptors.request.use"),
  client.indexOf("apiClient.interceptors.response.use"),
);
const responseInterceptor = client.slice(
  client.indexOf("apiClient.interceptors.response.use"),
);

const checks = [
  [
    "a dead session is ended in one shared place",
    client.includes("function endDeadSession(")
      && client.includes("useAuthStore.getState().logout()"),
  ],
  [
    "only a server rejection (4xx) counts as a dead session",
    client.includes("function isRefreshRejectedByServer")
      && client.includes("status < 400 || status >= 500"),
  ],
  [
    "the redirect cannot loop on the login page itself",
    client.includes('!window.location.pathname.startsWith("/login")'),
  ],
  [
    "the request interceptor catches a failed pre-flight refresh",
    requestInterceptor.includes("try {")
      && requestInterceptor.includes("getUsableAccessToken()")
      && requestInterceptor.includes("isRefreshRejectedByServer"),
  ],
  [
    "the request interceptor ends the session on that failure",
    requestInterceptor.includes("endDeadSession(describeRefreshFailure(error))"),
  ],
  [
    "the response interceptor still ends the session on a failed retry refresh",
    responseInterceptor.includes("isRefreshRejectedByServer")
      && responseInterceptor.includes("endDeadSession(describeRefreshFailure(refreshError))"),
  ],
  [
    "a network error or 5xx does not log the user out",
    client.includes("Do not log out on network errors or 5xx server errors"),
  ],
  // WT-344: users were signed out of production by our own rolling deploys. The auth service
  // answered a transient database failure with 400, and "any 4xx" read that as a verdict on the
  // refresh token. These two pin the client half of the fix.
  [
    "a 4xx that is not about the token does not log the user out",
    client.includes("const TRANSIENT_REFRESH_STATUSES = new Set([404, 408, 425, 429])")
      && client.includes("!TRANSIENT_REFRESH_STATUSES.has(status)"),
  ],
  [
    "the teardown breadcrumb names the cause instead of erasing it",
    client.includes("function describeRefreshFailure")
      && client.includes("`client-declared-session-dead(${cause})`")
      && client.includes('return `http-${error.response.status}`'),
  ],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
