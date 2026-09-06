#!/usr/bin/env node
/**
 * WT-605 — Pause Transcript is actually reachable, and says the right thing.
 *
 * WHY THIS EXISTS
 *   The backend half of WT-605 shipped on 2026-09-03 and the web half did not exist at all: no
 *   button, no REST call, no handler. It was invisible for three days because nothing in web CI
 *   fails when a FEATURE is missing — the realtime contract only noticed because the backend
 *   broadcast an event nobody bound, and even that fires on whoever opens the next PR rather than
 *   on the change that caused it. This repo's recurring failure is code wired to nothing, and a
 *   feature spread over six files is six chances to lose it again.
 *
 * THE TWO THINGS THAT MUST NOT DRIFT
 *   1. The hops: endpoint → service → hook → the meeting page → the control → the notice.
 *   2. The MEANING. WT-605 exists because pausing the transcript is NOT stopping the meeting or
 *      the translation. The backend says so in as many words, and copy that blurs the two would
 *      send somebody out of a meeting that is still running perfectly.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Source with `//` and block comments removed, for checks about code rather than prose. */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const endpoints = read("src/lib/api/endpoints.ts");
const service = read("src/services/transcript.service.ts");
const hooks = read("src/hooks/use-transcripts.ts");
const rule = read("src/lib/meeting/transcript-pause.ts");
const session = read("src/components/rooms/live/persistent-meeting-session.tsx");
const controlBar = read("src/components/rooms/live/meeting-control-bar.tsx");
const sidePanel = read("src/components/rooms/live/side-panel/meeting-side-panel.tsx");
const panel = read("src/components/rooms/live/side-panel/transcript-panel.tsx");

// ── hop 1: the endpoints exist, keyed by ROOM as the controller declares them ──

for (const [name, path] of [
  ["pauseByRoom", "/pause"],
  ["resumeByRoom", "/resume"],
  ["pauseWindows", "/pause-windows"],
]) {
  assert.match(
    endpoints,
    new RegExp(`${name}:[\\s\\S]{0,160}\`/transcripts/by-room/\\$\\{translationRoomId\\}${path}\``),
    `endpoints.ts must declare transcripts.${name} against /transcripts/by-room/{id}${path} — TranscriptsController keys all three by room, not by transcript id.`,
  );
}

// ── hop 2: the service calls them ────────────────────────────────────────────

for (const method of ["pauseByRoom", "resumeByRoom", "pauseWindows"]) {
  assert.match(
    service,
    new RegExp(`${method}\\(translationRoomId: string\\)`),
    `transcriptService.${method} must exist — an endpoint nothing calls is the shape this ticket was in.`,
  );
}

// ── hop 3: the hooks, and the read that a mid-pause joiner depends on ────────

assert.match(
  hooks,
  /export function useTranscriptPauseWindows\(/,
  "The window list must have a hook. It is the ONLY way somebody who joins while the transcript is already paused can learn that — the broadcast fired before they were in the group.",
);
assert.match(
  hooks,
  /export function useSetTranscriptPaused\(/,
  "Pausing and resuming must go through one hook, so the window-list invalidation cannot be forgotten on one of them.",
);
assert.doesNotMatch(
  withoutComments(hooks),
  /onMutate|optimisticUpdate/,
  "No optimistic flip: the room learns the state from the broadcast, and a local guess would put the host's screen ahead of everybody else's — and would survive a 409 saying the state was never what we assumed.",
);

// ── hop 4: the meeting page binds BOTH broadcasts ───────────────────────────

for (const event of ["TranscriptPaused", "TranscriptResumed"]) {
  assert.match(
    session,
    new RegExp(`connection\\.on\\("${event}"`),
    `The meeting page must bind ${event}. The gateway broadcasts it to the whole translationRoom group precisely so every participant learns it, not only the host who pressed the button.`,
  );
}

// The obligation the decision module hands to its caller, in the module's own words. Events that
// fired while the socket was down were never delivered, so a held one is a claim this client can
// no longer make — without this the panel keeps a stale pause for the rest of the meeting.
assert.match(
  withoutComments(session),
  /onreconnected\([\s\S]{0,400}?setTranscriptPauseEvent\(null\)/,
  "On reconnect the last pause broadcast must be forgotten and the window list re-read — see resolveTranscriptPause's header.",
);

// ── hop 5: the control is host-only, the STATE is not ───────────────────────

assert.match(
  withoutComments(session),
  /onToggleTranscriptPause=\{\s*isRoomHost \?/,
  "The switch must gate on isRoomHost, not isHost: TranscriptRecordingService gates on IsRoomHostAsync, so a workspace admin would be handed a button that answers 403.",
);
assert.match(
  withoutComments(controlBar),
  /onToggleTranscriptPause \?/,
  "The control bar must hide the control when no handler is passed — that is how it is kept host-only.",
);
assert.match(
  withoutComments(session),
  /transcriptPause=\{[\s\S]{0,200}?transcriptPause\.known/,
  "The side panel must receive the pause state — and only once it is KNOWN, since 'nothing has told us yet' is not 'the transcript is running'.",
);
assert.match(
  withoutComments(sidePanel),
  /transcriptPause=\{transcriptPause\}/,
  "The side panel must pass the state through to the transcript panel; stopping at the side panel is a prop that goes nowhere.",
);
assert.match(
  withoutComments(panel),
  /TranscriptPausedNotice/,
  "The transcript panel must render the notice — the state is for every participant, not only the host.",
);

// A host can pause before anybody has spoken. If the notice sits below the empty-transcript
// early return, the only thing the panel says in that state is "Start WarpTalk to see live
// translation here", which is the opposite of what is happening.
assert.match(
  withoutComments(panel),
  /pausedNotice[\s\S]{0,400}?if \(!segments\.length\)/,
  "The paused notice must be computed BEFORE the empty-transcript early return, or it disappears exactly when the transcript is empty because it was paused.",
);

// ── the meaning: this is not Stop Translation ──────────────────────────────

assert.match(
  panel,
  /translation, dubbing and subtitles are\s*\n?\s*still running/i,
  "The notice must say that translation, dubbing and subtitles keep running. WT-605 introduced a separate event pair specifically so this cannot be read as the meeting stopping.",
);
for (const [source, name] of [
  [panel, "the transcript panel"],
  [controlBar, "the control bar"],
]) {
  assert.doesNotMatch(
    withoutComments(source),
    /Meeting paused|Pause meeting|Pause translation/i,
    `Copy in ${name} must not call this pausing the meeting or the translation — they are different switches and the backend refuses to conflate them.`,
  );
}

// The rule stays a tested module rather than an if in the page: its two inputs disagree in a way
// that has a direction, and getting it backwards claims words are being written down that are not.
assert.match(
  rule,
  /export function resolveTranscriptPause\(/,
  "The precedence between the broadcast and the window list belongs in lib/meeting/transcript-pause, where it is tested.",
);
assert.doesNotMatch(
  withoutComments(session),
  /transcriptPauseFromWindows\(/,
  "The meeting page must go through resolveTranscriptPause, not read the windows itself — reading them directly is exactly the race the module exists to settle.",
);

console.log("Transcript pause contract OK (5 hops + meaning checked)");
