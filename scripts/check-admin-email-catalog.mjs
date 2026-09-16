#!/usr/bin/env node
/**
 * The admin "Email templates" page describes emails that live in warptalk-backend, so it can go
 * stale without a single line of this repo changing. This check holds it to the backend.
 *
 *  1. Every catalog entry's `subjectLiteral` is still found in its `sourcePath`. A renamed subject
 *     or a moved sender fails here instead of leaving the admin page quietly wrong.
 *  2. The page's central claim — that `notification_templates` is not read by any sender, so an
 *     editor over it would change nothing — is re-checked. If a reader appears, this fails, and
 *     the page should become the editor it declined to be.
 *  3. The meeting reminder is still uncalled. If something starts calling it, it is no longer
 *     dormant and the catalog must say so.
 *
 * Needs the backend source. It reads WARPTALK_BACKEND_ROOT (CI checks the backend out beside
 * this repo for the realtime contract), else a sibling `../warptalk-backend`. With neither, it
 * reports SKIP and passes — the catalog's shape is still checked.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogSource = readFileSync(join(root, "src/lib/admin/email-catalog.ts"), "utf8");

const checks = [];

const entries = [
  ...catalogSource.matchAll(
    /key: "([^"]+)",[\s\S]*?status: "(live|dormant)",[\s\S]*?sourcePath:\s*"([^"]+)",\s*subjectLiteral: `([^`]+)`/g,
  ),
].map(([, key, status, sourcePath, subjectLiteral]) => ({ key, status, sourcePath, subjectLiteral }));

checks.push(["the catalog was parsed", entries.length >= 5]);
checks.push([
  "catalog keys are unique",
  new Set(entries.map((entry) => entry.key)).size === entries.length,
]);

const backendRoot = [
  process.env.WARPTALK_BACKEND_ROOT,
  join(root, "..", "warptalk-backend"),
].find((candidate) => candidate && existsSync(join(candidate, "notification")));

function csFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name === "bin" || name === "obj" || name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...csFiles(full));
    else if (name.endsWith(".cs")) found.push(full);
  }
  return found;
}

if (!backendRoot) {
  console.log("SKIP backend drift checks: set WARPTALK_BACKEND_ROOT to a warptalk-backend checkout");
} else {
  for (const entry of entries) {
    const file = join(backendRoot, entry.sourcePath);
    const source = existsSync(file) ? readFileSync(file, "utf8") : "";
    checks.push([
      `${entry.key}: ${entry.subjectLiteral} is still in ${entry.sourcePath}`,
      source.includes(entry.subjectLiteral),
    ]);
  }

  const production = csFiles(backendRoot).filter(
    (file) => !/[\\/]tests?[\\/]|Tests?[\\/]|[\\/]Migrations[\\/]/.test(relative(backendRoot, file)),
  );

  // The repository's own definition, its interface, and the UnitOfWork accessor are the only
  // places the table may be named. Anything else is a reader.
  const TEMPLATE_PLUMBING = /NotificationTemplate(Repository)?\.cs$|IUnitOfWork\.cs$|UnitOfWork\.cs$|NotificationDbContext\.cs$/;
  const templateReaders = production
    .filter((file) => !TEMPLATE_PLUMBING.test(file))
    .filter((file) => /NotificationTemplate(s|Repository)\b/.test(readFileSync(file, "utf8")))
    .map((file) => relative(backendRoot, file));
  checks.push([
    templateReaders.length
      ? `notification_templates has no reader — found in ${templateReaders.join(", ")}`
      : "notification_templates has no reader, so a template editor would change nothing",
    templateReaders.length === 0,
  ]);

  const reminderCallers = production
    .filter((file) => !/IEmailService\.cs$|SmtpEmailService\.cs$/.test(file))
    .filter((file) => readFileSync(file, "utf8").includes("SendMeetingReminderAsync"))
    .map((file) => relative(backendRoot, file));
  checks.push([
    reminderCallers.length
      ? `the meeting reminder email is still uncalled — called from ${reminderCallers.join(", ")}`
      : "the meeting reminder email is still uncalled",
    reminderCallers.length === 0,
  ]);
}

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

const failures = checks.filter(([, passed]) => !passed);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exitCode = 1;
}
