#!/usr/bin/env node
/**
 * The recording template must be reachable without a session. WT-686.
 *
 * WHAT HAPPENED
 *
 * The backend starts every meeting recording as a LiveKit RoomComposite egress with
 * `custom_base_url` pointing at /egress/composite (LiveKit:Egress:TemplateBaseUrl). LiveKit opens
 * that URL in a headless Chrome and waits for the page to call EgressHelper.startRecording().
 *
 * The page was written when the app had no middleware, and says so. src/proxy.ts came later and
 * did not list it, so the recorder — which has no session — was answered 307 -> /login. A login
 * page is a working page, so nothing errored: LiveKit simply never received the start signal and
 * aborted every egress with EGRESS_ABORTED "Start signal not received". Meetings ended with a
 * transcript and a summary and no recording, and the only trace was one warning line in
 * meeting-service.
 *
 * Nothing in CI could see it, because the break was between two files that each looked right on
 * their own. This script is that check.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

/** 1. The template the backend points LiveKit at still exists. */
const PAGE = "src/app/egress/composite/page.tsx";
const page = read(PAGE);
if (!page) {
  failures.push(
    `${PAGE} is missing. The backend sends LiveKit to /egress/composite for every recording; ` +
      `without the page every egress records nothing.`,
  );
} else if (!page.includes("startRecording(")) {
  failures.push(
    `${PAGE} no longer calls EgressHelper.startRecording(). LiveKit waits for that signal and ` +
      `aborts the egress when it never comes.`,
  );
}

/** 2. The session gate lets the recorder — a browser with no session — reach it. */
const proxy = read("src/proxy.ts");
if (!proxy) {
  failures.push("src/proxy.ts is missing; cannot verify /egress is public.");
} else {
  const publicBlock = proxy.match(/const PUBLIC_ROUTES\s*=\s*\[([\s\S]*?)\]/);
  if (!publicBlock) {
    failures.push("Could not find PUBLIC_ROUTES in src/proxy.ts.");
  } else if (!/["']\/egress["']/.test(publicBlock[1])) {
    failures.push(
      `"/egress" is not in PUBLIC_ROUTES. LiveKit's recorder has no session, so the gate would ` +
        `redirect it to /login, startRecording() would never run, and every recording would be ` +
        `aborted with "Start signal not received".`,
    );
  }
}

if (failures.length > 0) {
  console.error("Egress template contract failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Egress template contract passed.");
