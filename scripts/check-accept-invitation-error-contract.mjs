#!/usr/bin/env node
/**
 * WT-624: the onboarding gate's Accept button must say why an invitation was refused.
 *
 * handleAcceptInvitation awaited the mutation with no catch, so every refusal the server
 * explains in words (already used, policy moved, already internal elsewhere) became an
 * unhandled rejection: nothing rendered, the button snapped back to "Accept", and the
 * only trace was `Uncaught (in promise) AxiosError` in the console.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/app/(app)/workspace/page.tsx"), "utf8");

const handler = page.match(/async function handleAcceptInvitation\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
assert.ok(handler, "handleAcceptInvitation must exist on the workspace onboarding gate.");

assert.match(
  handler[1],
  /try\s*\{[\s\S]*acceptInvitation\.mutateAsync\([\s\S]*\}\s*catch\s*\(\s*\w+\s*\)\s*\{[\s\S]*toast\.error\(\s*getErrorMessage\(/,
  "handleAcceptInvitation must catch a refused acceptance and show the server's reason (getErrorMessage) in a toast.",
);

console.log("Accept-invitation error contract: PASS");
