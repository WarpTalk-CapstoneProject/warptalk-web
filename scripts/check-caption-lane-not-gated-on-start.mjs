#!/usr/bin/env node
/**
 * The caption lane renders because CC is on — not because somebody pressed Start.
 *
 * Reported from production: a participant turned CC on in a live meeting and saw nothing at all
 * until translation was started. Two independent gates produced that one symptom, and this
 * script pins the web half.
 *
 * `meetingLive` is `room.status === "in_progress"`, which since WT-339 means "somebody pressed
 * Start", NOT "there is a meeting happening" — people join and talk before that. It was in the
 * lane's `enabled` prop, so the lane was not rendered at all and CC had nothing to toggle. Being
 * past the waiting-room branch in persistent-meeting-session.tsx already means this viewer is in
 * the call; that is the whole of the question.
 *
 * The lane's OWN behaviour before Start is a separate, already-correct decision:
 * `translationActive={translationStarted}` tells captionTextForReader to show what was said
 * rather than hold the line for a translation nobody ordered. That prop must stay.
 *
 * If the lane is ever deliberately hidden before Start again, rewrite this check to assert the
 * new rule — do not delete it.
 */

import { readFileSync } from "node:fs";

const FILE = "src/components/rooms/live/persistent-meeting-session.tsx";
const source = readFileSync(FILE, "utf8");

const failures = [];

const enabledProps = [...source.matchAll(/enabled=\{([^}]*)\}/g)].map((m) => m[1]);
const laneEnabled = enabledProps.filter((expression) => /subtitlesEnabled/.test(expression));

if (laneEnabled.length === 0) {
  failures.push(`could not find the caption lane's enabled={...} prop in ${FILE}`);
}

for (const expression of laneEnabled) {
  if (/meetingLive/.test(expression)) {
    failures.push(
      `the caption lane is gated on meetingLive (enabled={${expression.trim()}}) — that is ` +
        '"somebody pressed Start", not "this viewer is in a meeting", and it leaves CC with ' +
        "nothing to show for the first half of a call",
    );
  }
}

// The lane must still be TOLD whether translation is running; that is what keeps it filled with
// the original instead of holding every line for a translation that is not coming.
const translationActiveCount = (source.match(/translationActive=\{translationStarted\}/g) ?? [])
  .length;
if (translationActiveCount < laneEnabled.length) {
  failures.push(
    `${laneEnabled.length} caption lane(s) but only ${translationActiveCount} ` +
      "translationActive={translationStarted} prop(s) — a lane without it holds every line " +
      "back until translation starts",
  );
}

// The render gate was only the visible half. The SignalR handlers dropped the segments before
// they ever reached the store, so a lane that DID render would still have had nothing in it.
if (/if \(!meetingLiveRef\.current\) return;/.test(source)) {
  failures.push(
    "a transcript broadcast handler is gated on meetingLiveRef — that drops every segment " +
      "for a room whose meeting nobody has pressed Start on yet, which is most of the minutes " +
      "people actually complain about",
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${FILE}\n     ${failure}`);
  process.exit(1);
}

console.log("PASS the caption lane follows CC and the call, not Start Translation");
