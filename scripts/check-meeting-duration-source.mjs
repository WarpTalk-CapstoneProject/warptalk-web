#!/usr/bin/env node
/**
 * Every screen must derive a meeting's duration from the same place.
 *
 * WT-407. `resolveMeetingDurationSeconds` exists precisely to refuse the `createdAt` fallback —
 * its docstring cites "14h for a 20-minute meeting" as the reason it was written. But only
 * room-history.service.ts routed through it. my-meetings.service.ts still computed
 * `startedAt ?? createdAt` → `endedAt`, so the Meetings tab and the History tab disagreed about
 * the same meeting, and a cancelled recurring occurrence — created days before its slot, ended
 * on cancellation, never started — reported 50h 8m.
 *
 * A unit test could not catch this: the resolver was already correct and already tested. What
 * was wrong was that a second reader of the same rooms did not call it. That is a source-level
 * fact, so this is a source-level check.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SERVICES_DIR = "src/services";

/**
 * `createdAt` may legitimately appear in these files — it is a real field and is displayed. What
 * must never happen is it being used as a DURATION endpoint, which is what the `??` fallback did.
 */
const FORBIDDEN = [
  {
    pattern: /calculateMeetingDurationSeconds\s*\([^)]*createdAt/s,
    why: "computes a duration from createdAt — that is when the ROW was inserted, not when the meeting started",
  },
  {
    // Only the DURATION assignment. `startedAt: room.startedAt ?? room.createdAt` is a display
    // field and is fine — room-history.service.ts does exactly that and still resolves its
    // duration correctly, so a looser pattern flags the compliant file and teaches everyone to
    // ignore this check.
    pattern: /durationSeconds:[^,]*createdAt/s,
    why: "assigns a durationSeconds derived from createdAt",
  },
];

let failures = 0;

for (const file of readdirSync(SERVICES_DIR).filter((f) => f.endsWith(".ts"))) {
  const path = join(SERVICES_DIR, file);
  const source = readFileSync(path, "utf8");

  for (const { pattern, why } of FORBIDDEN) {
    if (pattern.test(source)) {
      console.error(`FAIL ${path}\n     ${why}`);
      failures += 1;
    }
  }
}

// The resolver must still be the thing services reach for, or the rule above is vacuous.
const myMeetings = readFileSync(join(SERVICES_DIR, "my-meetings.service.ts"), "utf8");
if (!myMeetings.includes("resolveMeetingDurationSeconds")) {
  console.error(
    "FAIL src/services/my-meetings.service.ts\n" +
      "     does not use resolveMeetingDurationSeconds — it is the second reader of the same rooms " +
      "as room-history.service.ts and must agree with it",
  );
  failures += 1;
}

if (failures > 0) {
  console.error(`\n${failures} meeting-duration source violation(s).`);
  process.exit(1);
}

console.log("PASS every service derives meeting duration from resolveMeetingDurationSeconds");
