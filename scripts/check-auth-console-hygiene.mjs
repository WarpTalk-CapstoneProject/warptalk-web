#!/usr/bin/env node
/**
 * The login page printed the whole AuthResponse to the browser console —
 * access token and 7-day refresh token, in plaintext, on every successful
 * Google sign-in. A token read out of console history stays redeemable for a
 * week, and it survives in any screen recording of a demo.
 *
 * This is an *absence* check, which is the one thing a source-text assertion
 * can prove honestly: it does not claim the login page works, only that no
 * file on the auth surface contains a console call. If you need to debug this
 * code, use a breakpoint.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOTS = [
  "src/app/(auth)",
  "src/app/desktop-login",
  "src/services/auth.service.ts",
  "src/hooks/use-auth.ts",
  "src/stores/auth-store.ts",
  "src/lib/auth",
];

const CONSOLE_CALL = /\bconsole\s*\.\s*[a-zA-Z]+\s*\(/;

function collect(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path).flatMap((entry) => collect(join(path, entry)));
}

const offenders = [];
for (const root of ROOTS) {
  for (const file of collect(root)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (CONSOLE_CALL.test(line)) {
          offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
  }
}

assert.deepEqual(
  offenders,
  [],
  `The auth surface must not write to the console — credentials leak through it:\n${offenders.join("\n")}`,
);

console.log("Auth console hygiene contract passed.");
