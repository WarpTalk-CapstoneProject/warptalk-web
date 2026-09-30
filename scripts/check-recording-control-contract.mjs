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

console.log("Recording control contract passed.");
