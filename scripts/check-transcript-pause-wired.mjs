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
 * THE THREE THINGS THAT MUST NOT DRIFT
 *   1. The hops: endpoint → service → hook → the meeting page → the control → the notice.
 *   2. The MEANING. WT-605 exists because pausing the transcript is NOT stopping the meeting or
 *      the translation. The backend says so in as many words, and copy that blurs the two would
 *      send somebody out of a meeting that is still running perfectly.
 *   3. What paused actually DOES. Everything above was true and the feature was still broken:
 *      every link in the chain existed, the banner appeared on cue, and the transcript went on
 *      printing every word anybody said. The five hops only ever asserted that the parts were
 *      connected, never that pausing stopped anything — which is precisely why the bug walked
 *      through CI. The behaviour section at the bottom is the half that was missing, and it has
 *      two halves of its own, because the rule is not "show less" but "show less HERE": the
 *      transcript panel stops, the caption lane deliberately does not.
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
const savedPanel = read("src/components/rooms/meeting-transcript-panel.tsx");
const display = read("src/lib/transcript/transcript-display.ts");
const displayTests = read("src/lib/transcript/__tests__/transcript-display.test.ts");
const overlay = read("src/components/rooms/live/live-subtitle-overlay.tsx");

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
  withoutComments(sidePanel),
  /onToggleTranscriptPause && mode === "transcript"/,
  "The switch lives in the Transcript panel's tab row and must be hidden when no handler is passed (that is how it stays host-only) AND when another tab is showing — a Pause button over the People list changes something off screen.",
);

// Somebody sitting in Chat or People cannot see the control, so the tab itself has to carry the
// state. This one is for EVERY participant, not only the host who can toggle it.
assert.match(
  withoutComments(sidePanel),
  /marked=\{Boolean\(transcriptPause\?\.paused\)\}/,
  "The Transcript tab must show a paused marker, or moving the control into the panel hides the fact from anyone on another tab.",
);

// Icon-only was the product owner's ask ("nút chỉ gồm icon"), which makes the accessible name the
// only name this control has. An icon button with no aria-label announces as "button".
assert.match(
  withoutComments(sidePanel),
  /aria-label=\{label\}[\s\S]{0,120}?title=\{label\}/,
  "The icon-only pause control must carry an aria-label, and the same string as its tooltip — the tooltip is the only place the words appear, so the two must not be able to drift.",
);
for (const copy of ["Pause transcript", "Resume transcript", "Transcript request in progress"]) {
  assert.ok(
    sidePanel.includes(copy),
    `The pause control's tooltip must still offer "${copy}" — the state language is the whole label, since the button shows no text.`,
  );
}

// Below `lg` the side panel is an overlay drawer that can be closed, so the dock keeps one way
// back in. It must OPEN the panel first: a dock control that only fires the mutation changes the
// record with nothing on screen to show for it.
assert.match(
  withoutComments(controlBar),
  /onToggleTranscriptPauseInPanel \?/,
  "The control bar must keep an entrance to the switch, hidden when no handler is passed — below lg the side panel is a drawer the host may have shut.",
);
assert.match(
  withoutComments(session),
  /function handleToggleTranscriptPauseFromDock\(\)\s*\{[\s\S]{0,400}?setSidePanelMode\("transcript"\)[\s\S]{0,200}?setRightSidebarOpen\(true\)[\s\S]{0,200}?handleToggleTranscriptPause\(\)/,
  "The dock entrance must open the drawer on the Transcript tab BEFORE toggling, so the host sees the notice, the divider and the control they just used.",
);
assert.doesNotMatch(
  withoutComments(controlBar),
  /onToggleTranscriptPause\b/,
  "The control bar must not take a handler that toggles the transcript directly — only onToggleTranscriptPauseInPanel, which opens the panel first. A direct one is how the switch walks back into the dock row.",
);
assert.match(
  withoutComments(controlBar),
  /<SettingsRow[\s\S]{0,400}?PauseCircle/,
  "The dock's entrance must be a row in the Settings menu, not a button back in the control row: it sat between Stop Translation, Record and CC — three switches about the meeting, one about a panel — which is the confusion this ticket forbids.",
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
  // Added when WT-605 moved the switch out of the dock: the words a host reads before pressing
  // are now written HERE, so this is where the confusion would be introduced next.
  [sidePanel, "the side panel"],
]) {
  assert.doesNotMatch(
    withoutComments(source),
    /Meeting paused|Pause meeting|Pause translation/i,
    `Copy in ${name} must not call this pausing the meeting or the translation — they are different switches and the backend refuses to conflate them.`,
  );
}

// ── the pause is legible AFTERWARDS, not only while it is on ───────────────
//
// The live banner says "paused, right now". It says nothing to somebody reading the transcript
// back tomorrow, and a transcript with a silent hole in it is the thing that makes a record
// untrustworthy — you cannot tell a pause from nobody having spoken. So each window is also
// drawn INTO the transcript, on both panels: the live one and the saved one.
assert.match(
  display,
  /export function resolveTranscriptPauseGaps\(/,
  "Pause windows must be resolvable to meeting-relative positions, or no panel can place a divider.",
);
assert.match(
  display,
  /export function splitSegmentsAroundPauseGaps[<(]/,
  "Segments must be splittable around the gaps — this is the transcript-pause counterpart to groupSegmentsByTranslationSession.",
);
for (const [name, source] of [
  ["the live transcript panel", panel],
  ["the saved transcript panel", savedPanel],
]) {
  assert.match(
    source,
    /splitSegmentsAroundPauseGaps\(/,
    `${name} must draw the pause dividers. A pause that leaves no mark in the record is indistinguishable from silence.`,
  );
}
// Distinct wording from the "Translation N" divider beside it. A room can pause translation and
// pause the transcript at unrelated moments, and two dividers reading alike would merge in the
// reader's mind into one thing that happened once.
assert.match(
  panel,
  /Transcript paused ·/,
  "The divider must name itself as a TRANSCRIPT pause, distinct from the translation-session divider it sits among.",
);

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

// ── what PAUSED actually does, which everything above passed without ever asking ───────────
//
// The tester's report: press Pause, the banner appears exactly as designed, and the transcript
// keeps printing every word. Every assertion above was green throughout. So: the panel must drop
// what is said while a window is still open.

assert.match(
  display,
  /export function withoutSegmentsInOpenPauseGaps[<(]/,
  "The 'do not render what was said while paused' rule must be an exported function here, not an inline filter in a component: it can fail in the direction that DELETES recorded speech, which is worse than the bug it fixes and completely silent.",
);
assert.match(
  displayTests,
  /withoutSegmentsInOpenPauseGaps/,
  "That rule must be exercised by the transcript-display tests. A rule with a dangerous failure direction and no test is the shape this ticket keeps coming back in.",
);
assert.match(
  withoutComments(panel),
  /withoutSegmentsInOpenPauseGaps\(segments, pauseGaps\)/,
  "The live transcript panel must filter the segments through that rule. Rendering the store unfiltered is the reported bug.",
);
// Before the grouping, not after. groupTranscriptSegments merges consecutive chunks of one
// speaker into one bubble, so a line spoken after Pause that lands within MAX_UTTERANCE_GAP_MS of
// the previous one stops being a segment and becomes part of an earlier line's TEXT — where no
// later filter can reach it.
assert.match(
  withoutComments(panel),
  /withoutSegmentsInOpenPauseGaps\([\s\S]{0,400}?groupTranscriptSegments\(/,
  "The filter must run BEFORE groupTranscriptSegments, or a paused chunk is merged into the previous bubble's text and no downstream filter can find it again.",
);
// Dropping lines silently is how the fix becomes the next bug report. A panel that stops moving
// while the room is visibly talking looks broken, which is the exact sentence the tester wrote.
assert.match(
  withoutComments(panel),
  /recorded\.hiddenCount > 0 \?/,
  "The live panel must say something where the dropped lines would have been. An absence with no explanation is indistinguishable from a transcript that has failed.",
);

// The other half of the rule, and the one a later tidy-up is most likely to "fix". The caption
// lane reads the SAME transcriptSegments store as the panel, and the product decision of
// 2026-09-09 is that captions keep running through a pause — which is also the sentence the
// paused banner prints two inches away. Filtering here would make that banner a lie.
assert.match(
  withoutComments(overlay),
  /state\.transcriptSegments/,
  "The caption lane must keep reading the transcript store directly. Captions run through a pause; that is the promise the paused notice makes to the room.",
);
assert.doesNotMatch(
  withoutComments(overlay),
  /PauseGap|pauseWindow|transcriptPause/i,
  "The caption lane must NOT be gated on the transcript pause. Pausing stops the written record only — translation, dubbing and subtitles keep running, and gating this lane is how that promise gets quietly withdrawn while every other check stays green.",
);

// One pause, one divider — however many translation sessions the meeting had. Both panels used
// to call splitSegmentsAroundPauseGaps(block.segments, pauseGaps) inside their blocks.map, with
// every block handed the WHOLE list, so the trailing pass redrew every late gap once per session.
assert.match(
  display,
  /export function distributePauseGapsAcrossBlocks[<(]/,
  "Assigning each pause window to ONE session block must be a function here — it is the only place that can see every block at once, which is exactly what the per-block call cannot.",
);
assert.match(
  displayTests,
  /distributePauseGapsAcrossBlocks/,
  "The one-divider-per-pause rule must be tested; the duplicate was invisible until a meeting happened to have two translation sessions.",
);
for (const [name, source] of [
  ["the live transcript panel", panel],
  ["the saved transcript panel", savedPanel],
]) {
  // Matched on `blocks.map(` rather than on an exact argument list because the function is fed
  // start TIMES, not the blocks — the shape of that projection is the module's business and may
  // change. What must not change is that the decision is made once, across ALL the blocks, before
  // any single one of them is split.
  assert.match(
    withoutComments(source),
    /distributePauseGapsAcrossBlocks\(\s*blocks\.map\(/,
    `${name} must narrow the gaps per block, across every block at once, before splitting.`,
  );
  assert.match(
    withoutComments(source),
    /splitSegmentsAroundPauseGaps\(block\.segments, gapsPerBlock\[blockIndex\]/,
    `${name} must split each block against ITS OWN gaps.`,
  );
  assert.doesNotMatch(
    withoutComments(source),
    /splitSegmentsAroundPauseGaps\(block\.segments, pauseGaps\)/,
    `${name} must not hand every session block the whole gap list — that is what drew one pause once per session.`,
  );
}

// The divider's own label, which was three separate small lies: a sub-minute pause printed
// "10:15 PM–10:15 PM", two pauses with nothing said between them stacked as two rules with
// nothing in between, and an unclosed window said "now" on the record of a meeting that ended
// months ago.
assert.match(
  display,
  /export function formatTranscriptPauseGapRun\(/,
  "The divider's time label must be built here, where the sub-minute, merged-run and 'now' cases are decided once and tested.",
);
assert.match(
  withoutComments(savedPanel),
  /formatTranscriptPauseGapRun\(gaps, \{ meetingEnded \}\)/,
  "The saved panel must tell the label the meeting is over: 'now' on a record of a finished meeting is a claim about the reader's present that nothing on that page can support.",
);

console.log(
  "Transcript pause contract OK (5 hops + meaning + dividers + paused behaviour checked)",
);
