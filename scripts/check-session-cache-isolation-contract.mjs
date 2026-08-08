// A change of signed-in account must not leave the previous account's data on screen.
//
// The bug this guards against showed one user another user's room list. Account A signs in,
// signs out, account B signs in — and A's rooms and workspaces paint for B before B's own
// data arrives, because the TanStack query cache lives as long as the tab and its keys carry
// no identity. `logout()` cleared the auth state, the cookies, the active workspace and the
// presence map, and nothing else.
//
// `src/lib/session-scoped-state.test.ts` proves the reset actually empties a real query
// client and the real stores. What that test cannot see is *wiring*: whether the auth store
// still calls it, whether the provider still hands the query client over, and whether a
// newly added store was ever added to the reset. Those are the assertions here, and they are
// source-level for the same reason the expired-session ones are — the behaviour is spread
// across a store, a provider and a page, and any one of them reverting quietly puts the leak
// back while every type still checks and every test still passes.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(root, rel), "utf8");

const sessionScopedState = await read("src/lib/session-scoped-state.ts");
const authStore = await read("src/stores/auth-store.ts");
const providers = await read("src/app/providers.tsx");
const workspacePage = await read("src/app/(app)/workspace/page.tsx");
const apiClient = await read("src/lib/api/client.ts");

const checks = [];

// ── Every account-scoped store is in the reset ────────────────────────────────
//
// The check that earns this file's existence. Adding a store is routine; remembering that it
// now has to be emptied on sign-out is not. `ui-store` is the one deliberate exclusion —
// sidebar-open and which modal is showing belong to the window, not to the person — and
// `auth-store` is the caller, so it cannot reset itself from inside the reset.
const STORES_EXEMPT_FROM_RESET = new Set(["auth-store.ts", "ui-store.ts"]);

const storeFiles = (await readdir(path.join(root, "src/stores")))
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

checks.push(["src/stores has stores to check", storeFiles.length > 2]);

for (const file of storeFiles) {
  if (STORES_EXEMPT_FROM_RESET.has(file)) continue;
  const moduleName = file.replace(/\.ts$/, "");
  checks.push([
    `${moduleName} is reset when the signed-in account changes`,
    sessionScopedState.includes(`../stores/${moduleName}.ts`),
  ]);
}

for (const exempt of STORES_EXEMPT_FROM_RESET) {
  checks.push([
    `${exempt} is still present, so its exemption is still a real decision`,
    storeFiles.includes(exempt),
  ]);
}

// ── The reset actually empties the query cache ────────────────────────────────
checks.push([
  "the query cache is emptied, not merely invalidated (invalidateQueries leaves the data readable)",
  sessionScopedState.includes("removeQueries()") &&
    !/invalidateQueries\(\)/.test(sessionScopedState),
]);
checks.push([
  "in-flight requests are cancelled before the cache is emptied, so a late response cannot refill it",
  sessionScopedState.indexOf("cancelQueries()") < sessionScopedState.indexOf("removeQueries()"),
]);
checks.push([
  "the query client is registered rather than constructed at module scope, which would share it across SSR requests",
  sessionScopedState.includes("export function registerSessionQueryClient") &&
    !/=\s*new QueryClient\(/.test(sessionScopedState),
]);

// ── The wiring ────────────────────────────────────────────────────────────────
checks.push([
  "the provider hands its query client to the reset",
  providers.includes("registerSessionQueryClient(queryClient)"),
]);
checks.push([
  "signing out resets the session-scoped state",
  /logout: \(\) => \{[\s\S]*?resetSessionScopedStateOnLogout\(\)/.test(authStore),
]);
// Scoped to the logout body so it cannot be satisfied by the initial state above it.
const logoutBody = authStore.match(/logout: \(\) => \{([\s\S]*?)\n      \},/)?.[1] ?? "";
checks.push([
  "on sign-out the identity is cleared BEFORE the cache, so a refetch triggered by the removal cannot use the departing account's token",
  logoutBody.includes("isAuthenticated: false,") &&
    logoutBody.indexOf("isAuthenticated: false,") <
      logoutBody.indexOf("resetSessionScopedStateOnLogout()"),
]);
checks.push([
  "signing in resets it too — a session can end without anyone calling logout()",
  /login: \([\s\S]*?resetSessionScopedStateOnLogin\(\)/.test(authStore),
]);
checks.push([
  "the reset runs before the arriving account's identity is installed",
  authStore.indexOf("resetSessionScopedStateOnLogin()") <
    authStore.indexOf("set({ user, accessToken, refreshToken, isAuthenticated: true })"),
]);
checks.push([
  "discarding a rehydrated dead session clears the cache with it",
  /onRehydrateStorage[\s\S]*?resetSessionScopedStateOnLogout\(\)/.test(authStore),
]);
checks.push([
  "a dead session found mid-request goes through the same logout, so it gets the same reset",
  apiClient.includes("useAuthStore.getState().logout()"),
]);

// ── No sign-out path skips it ─────────────────────────────────────────────────
//
// Every sign-out in the UI calls the store's logout() directly. `useLogout()` in
// hooks/use-auth.ts is the only caller that ever cleared the query cache, and nothing in the
// app calls it — which is exactly how the leak survived having a fix already written for it.
// So the reset has to live in the store, and no call site may hand-roll its own teardown.
// topbar.tsx was on this list and has been deleted. It was never rendered by any layout —
// no file imported it — so its sign-out was unreachable and this entry was asserting about
// a screen no user could ever see. Its search, the part that was worth keeping, now lives in
// components/layout/header-search.tsx, which has no sign-out of its own.
const LOGOUT_CALL_SITES = [
  "src/components/layout/linear-sidebar.tsx",
  "src/app/invitations/[token]/page.tsx",
];
for (const rel of LOGOUT_CALL_SITES) {
  const source = await read(rel);
  checks.push([
    `${rel} signs out through the auth store`,
    /useAuthStore\(\((state|s)\) => \1\.logout\)/.test(source),
  ]);
  checks.push([
    `${rel} does not clear the query cache itself instead of going through the store`,
    !source.includes("queryClient.clear()"),
  ]);
}

// ── Bug 2: the onboarding surface is not shown to an account on its way past ──
//
// Same family as the leak — a value rendered before it is safe to trust — but a different
// mechanism, so a separate assertion. The redirect to the account's workspace lives in an
// effect, and effects run after paint, so the create-workspace surface must be withheld
// during render for an account the effect is about to route onward. Not by a delay: an
// account with no workspaces still fails this condition on the first render after the list
// resolves and reaches the create page immediately.
checks.push([
  "the workspace page decides during render whether it is about to redirect",
  workspacePage.includes("const willAutoOpenWorkspace ="),
]);
checks.push([
  "the onboarding surface is withheld while that redirect is pending",
  /if \(\s*\n?\s*!isAuthenticated \|\|[\s\S]{0,400}?willAutoOpenWorkspace\s*\n?\s*\) \{/.test(
    workspacePage,
  ),
]);
checks.push([
  "the redirect condition survives its own side effect — it is not read live from activeWorkspaceId",
  workspacePage.includes("const [arrivedWithoutActiveWorkspace] = useState(() => !activeWorkspaceId)") &&
    /willAutoOpenWorkspace =\s*\n\s*isAuthenticated &&\s*\n\s*arrivedWithoutActiveWorkspace/.test(
      workspacePage,
    ),
]);
checks.push([
  "an account with no workspaces is not held behind a timer",
  !/setTimeout|setInterval/.test(workspacePage),
]);
checks.push([
  "the create and join surfaces are still reachable, so the gate did not simply delete the empty state",
  workspacePage.includes('router.push("/workspace/create")') &&
    workspacePage.includes('router.push("/workspace/join")'),
]);

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exitCode = 1;
}
