import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const controlBar = await readFile(
  new URL("../src/components/rooms/live/meeting-control-bar.tsx", import.meta.url),
  "utf8",
);
const roomPage = await readFile(
  new URL("../src/components/rooms/live/persistent-meeting-session.tsx", import.meta.url),
  "utf8",
);
const controlBarEn = JSON.parse(
  await readFile(
    new URL("../messages/en/meetingControlBar.json", import.meta.url),
    "utf8",
  ),
);

assert.match(controlBar, /recordingPending\?: boolean/);
assert.match(controlBar, /disabled=\{recordingPending\}/);
// "Recording request in progress" moved into i18n (t("recording.pending")) — assert the
// component still branches on recordingPending to pick that key, and the English catalog
// still carries the wording.
assert.match(controlBar, /recordingPending\s*\?\s*t\("recording\.pending"\)/);
assert.equal(controlBarEn.recording?.pending, "Recording request in progress");
assert.match(roomPage, /recordingPending=\{setRecordingMutation\.isPending\}/);
assert.match(roomPage, /onSuccess: \(state\) => \{/);
assert.match(roomPage, /setIsRecording\(state\.recording\)/);

// WT-935: the recording (and the lock) are READ when this client joins, not only learned from a
// broadcast. Without the read a reload draws the idle Record button over a running recording and
// the host's next press sends `start` again.
const meetingTypes = await readFile(new URL("../src/types/meeting.ts", import.meta.url), "utf8");
assert.match(meetingTypes, /recording\?: boolean;/, "the join response type must carry `recording`");
assert.match(meetingTypes, /locked\?: boolean;/, "the join response type must carry `locked`");
// Both places a session is received hydrate from it: the first join and the retry/rejoin.
const hydrations = roomPage.match(/hydrateHostStateFromJoin\(session, hostStateAsked\)/g) ?? [];
assert.equal(hydrations.length, 2, "both join paths must hydrate the lock and the recording");
assert.equal(
  (roomPage.match(/setMeetingSession\(session\)/g) ?? []).length,
  hydrations.length,
  "a new place that receives a join response must hydrate from it too",
);
// The decision is the tested pure rule, and hydration is silent: it goes through the raw setter,
// never through the broadcast handler that toasts a transition.
assert.match(roomPage, /setRecordingState\(\(current\) =>\s*hydrateFromJoin\(/);
assert.match(roomPage, /setRoomLockedState\(\(current\) =>\s*hydrateFromJoin\(/);
// The press after a reload: the action is still computed from the (now hydrated) state.
assert.match(roomPage, /const action = isRecording \? "stop" : "start";/);

console.log("Recording control contract passed.");
