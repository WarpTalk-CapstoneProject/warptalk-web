#!/usr/bin/env node
/**
 * The CC button must not claim to control the transcript.
 *
 * WT-408. A CC glyph is conventionally read as "captions and transcript", so QA turned it off and
 * expected recording to stop. It never did: onToggleSubtitles only flips local visibility,
 * TranscriptSegmentReceived still appends, and the transcript is still persisted and exportable.
 *
 * Two rules, and the second is the one that matters. The button may only ever be described in
 * terms of CAPTIONS, and while it says "hide" it must also say the transcript keeps running —
 * otherwise the privacy misunderstanding this ticket is about comes straight back the next time
 * somebody "tidies up" the wording.
 *
 * If CC is ever promoted into a real consent control (WT-408 option B), this check should be
 * rewritten to assert the gate exists, not deleted.
 */

import { readFileSync } from "node:fs";

const FILE = "src/components/rooms/live/meeting-control-bar.tsx";
const source = readFileSync(FILE, "utf8");

const failures = [];

// The label expression for the CC control, whatever its exact wording.
const labelMatch = source.match(
  /subtitlesEnabled\s*\n?\s*\?\s*"([^"]+)"\s*\n?\s*:\s*"([^"]+)"/,
);

if (!labelMatch) {
  failures.push(`could not find the CC control's label expression in ${FILE}`);
} else {
  const [, whenOn, whenOff] = labelMatch;

  if (!/transcript/i.test(whenOn)) {
    failures.push(
      `the "hide" label is "${whenOn}" — it must state that the transcript keeps recording, ` +
        "because turning this off does NOT stop transcript capture",
    );
  }

  for (const [state, label] of [["on", whenOn], ["off", whenOff]]) {
    if (/\bstop\b|\brecord(ing)? off\b|\bdisable transcript\b/i.test(label)) {
      failures.push(`the "${state}" label "${label}" implies it stops recording; it does not`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${FILE}\n     ${failure}`);
  process.exit(1);
}

console.log("PASS the caption toggle does not claim to control the transcript");
