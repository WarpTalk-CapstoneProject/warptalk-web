#!/usr/bin/env node
/**
 * Google SSO must send a Google ID token to AuthService.
 *
 * `useGoogleLogin` returns an OAuth access token. AuthService can still verify that token
 * through Google's tokeninfo endpoint as a temporary fallback, but production SSO should not
 * depend on that fragile path. The login surfaces must use the Google Identity credential
 * callback instead, where `credential` is the ID token whose audience AuthService validates.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const AUTH_SURFACES = [
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/register/page.tsx",
  "src/app/desktop-login/page.tsx",
];

const offenders = [];

for (const file of AUTH_SURFACES) {
  const source = readFileSync(file, "utf8");
  if (source.includes("useGoogleLogin")) {
    offenders.push(`${file}: imports or calls useGoogleLogin, which returns access_token`);
  }
  if (/tokenResponse\s*\.\s*access_token/.test(source)) {
    offenders.push(`${file}: sends tokenResponse.access_token to AuthService`);
  }
}

assert.deepEqual(
  offenders,
  [],
  `Google SSO must send Google ID tokens, not OAuth access tokens:\n${offenders.join("\n")}`,
);

console.log("Google ID-token contract passed.");
