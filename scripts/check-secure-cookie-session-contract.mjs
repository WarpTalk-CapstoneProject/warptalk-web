import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const client = read("src/lib/api/client.ts");
const authStore = read("src/stores/auth-store.ts");
const authService = read("src/services/auth.service.ts");
const authTypes = read("src/types/auth.ts");
const signalr = read("src/lib/signalr.ts");
const useAuth = read("src/hooks/use-auth.ts");
const loginPage = read("src/app/(auth)/login/page.tsx");
const registerPage = read("src/app/(auth)/register/page.tsx");
const desktopLoginPage = read("src/app/desktop-login/page.tsx");
const workspaceJoinPage = read("src/app/(app)/workspace/join/page.tsx");
const proxy = read("src/proxy.ts");

assert.match(client, /withCredentials:\s*true/);
assert.match(client, /\/auth\/refresh[\s\S]*?withCredentials:\s*true/);
assert.doesNotMatch(client, /getRefreshToken/);
assert.doesNotMatch(client, /document\.cookie\s*=\s*`access_token=/);

assert.doesNotMatch(authStore, /refreshToken:\s*string\s*\|\s*null/);
assert.match(authStore, /version:\s*2/);
assert.match(authStore, /migrate:[\s\S]*accessToken:\s*null/);
assert.doesNotMatch(authStore, /partialize:[\s\S]*accessToken/);
assert.doesNotMatch(authStore, /partialize:[\s\S]*refreshToken/);

assert.doesNotMatch(authTypes, /interface AuthResponse[\s\S]*refreshToken:/);
assert.match(authService, /refresh\(\)\s*\{/);
assert.match(authService, /logout\(\)\s*\{/);
assert.doesNotMatch(useAuth, /res\.refreshToken|\{\s*refreshToken\s*,\s*logout\s*\}/);

assert.match(signalr, /credentials:\s*"include"/);
assert.doesNotMatch(signalr, /JSON\.stringify\(\{\s*refreshToken\s*\}\)/);

// Every surface that authenticates. The workspace join page is here because it
// grew its own document.cookie writer independently of the login pages, which
// is exactly the drift this contract exists to catch.
for (const source of [loginPage, registerPage, desktopLoginPage, workspaceJoinPage]) {
  assert.doesNotMatch(source, /document\.cookie\s*=\s*`access_token=/);
  assert.doesNotMatch(source, /res\.data[\s\S]{0,120}refreshToken/);
}

assert.match(proxy, /request\.cookies\.get\("warptalk_session"\)/);
assert.doesNotMatch(proxy, /request\.cookies\.get\("access_token"\)/);

console.log("PASS secure cookie session contract");
