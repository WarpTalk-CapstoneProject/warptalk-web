import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const controlBar = await readFile(
  new URL("../src/components/rooms/live/meeting-control-bar.tsx", import.meta.url),
  "utf8",
);
const roomPage = await readFile(
  new URL("../src/app/(app)/room/[id]/page.tsx", import.meta.url),
  "utf8",
);

assert.match(controlBar, /recordingPending\?: boolean/);
assert.match(controlBar, /disabled=\{recordingPending\}/);
assert.match(controlBar, /recordingPending\s*\?\s*"Recording request in progress"/);
assert.match(roomPage, /recordingPending=\{setRecordingMutation\.isPending\}/);
assert.match(roomPage, /onSuccess: \(state\) => \{/);
assert.match(roomPage, /setIsRecording\(state\.recording\)/);

console.log("Recording control contract passed.");
