#!/usr/bin/env node
/**
 * One Meeting record, rendered by both routes.
 *
 * WHY THIS EXISTS
 *   `MeetingRecordSection` was declared inside rooms/[id]/page.tsx, so it was reachable from
 *   exactly one route. The room's /ended page — where a host is sent the instant they end a
 *   meeting — hand-rolled a worse third of it: the same three tab buttons, but its transcript tab
 *   read the export FILE's plain text instead of the saved segments, so a summary point had
 *   nothing to scroll to. The publish control and the regenerate control were not there at all.
 *
 *   So the host, the person most likely to want to regenerate a summary and publish it, was the
 *   one person who could reach neither. Both had been built; both were wired to one route.
 *
 *   That page's own docstring already claimed the opposite — "The panels are the SAME components
 *   the room page uses, so a fix to either lands on both". True of the panels, false of everything
 *   wrapped around them.
 *
 * THE RULE
 *   The section lives in src/components/rooms/, both routes render it, and neither route re-declares
 *   it. A second copy is how the two screens drift apart again, and the drift is invisible until
 *   somebody ends a meeting and looks for a button.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SHARED = "src/components/rooms/meeting-record-section.tsx";
const ROUTES = [
  "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx",
  "src/app/(app)/[workspaceSlug]/rooms/[id]/ended/page.tsx",
];

const failures = [];

const shared = readFileSync(join(root, SHARED), "utf8");
for (const name of ["MeetingRecordSection", "MeetingTranscriptArtifact", "useMeetingTranscript"]) {
  if (!new RegExp(`export function ${name}\\b`).test(shared)) {
    failures.push(`${SHARED}: does not export ${name}. Both routes import it from here.`);
  }
}

for (const route of ROUTES) {
  const source = readFileSync(join(root, route), "utf8");

  if (!/<MeetingRecordSection\b/.test(source)) {
    failures.push(
      `${route}: does not render <MeetingRecordSection>. Whatever it renders instead is a second `
        + "implementation of the meeting record, which is what this check exists to prevent.",
    );
  }

  if (/^(export )?function MeetingRecordSection\b/m.test(source)) {
    failures.push(
      `${route}: declares its own MeetingRecordSection. It belongs in ${SHARED} so both routes get `
        + "the same publish, regenerate and jump-to-moment behaviour.",
    );
  }

  // The jump only works against saved SEGMENTS. Reading the export file's text instead is exactly
  // how /ended had tabs that looked right and a summary citation that went nowhere.
  if (!/useMeetingTranscript\(/.test(source)) {
    failures.push(
      `${route}: does not call useMeetingTranscript. Without the saved segments, a summary point `
        + "has no line to scroll to.",
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log("PASS both room routes render the one shared Meeting record");
