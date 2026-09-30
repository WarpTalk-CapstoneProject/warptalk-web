import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const controlBarPath = path.join(
  root,
  "src/components/rooms/live/meeting-control-bar.tsx",
);

assert.ok(
  fs.existsSync(controlBarPath),
  "Meeting control bar must exist.",
);

const controlBar = fs.readFileSync(controlBarPath, "utf8");
const controlBarEn = JSON.parse(
  fs.readFileSync(path.join(root, "messages/en/meetingControlBar.json"), "utf8"),
);

// WT-172 #2: "Copy join link" copies the full link whenever one exists, so a
// participant could never copy the bare room code on its own. Add a
// dedicated control that always copies just the code.
//
// The label and toast text moved into i18n (t("settingsMenu.copyRoomCode") /
// t("settingsMenu.roomCodeToastLabel")) — assert the component still calls those keys, and the
// English catalog still carries the original wording.
assert.match(
  controlBar,
  /label=\{t\("settingsMenu\.copyRoomCode"\)\}[\s\S]{0,150}onClick=\{\(\) => onCopyText\(roomCode, t\("settingsMenu\.roomCodeToastLabel"\)\)\}/,
  "Control bar must offer a dedicated action that copies only the room code.",
);
assert.equal(controlBarEn.settingsMenu?.copyRoomCode, "Copy room code");
assert.equal(controlBarEn.settingsMenu?.roomCodeToastLabel, "Room code");

console.log("Copy room-code contract: PASS");
