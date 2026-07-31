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

// WT-172 #2: "Copy join link" copies the full link whenever one exists, so a
// participant could never copy the bare room code on its own. Add a
// dedicated control that always copies just the code.
assert.match(
  controlBar,
  /label="Copy room code"[\s\S]{0,150}onClick=\{\(\) => onCopyText\(roomCode, "Room code"\)\}/,
  "Control bar must offer a dedicated action that copies only the room code.",
);

console.log("Copy room-code contract: PASS");
