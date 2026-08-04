import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const hooks = fs.readFileSync(
  path.join(root, "src/hooks/use-translationRooms.ts"),
  "utf8",
);
const liveRoom = fs.readFileSync(
  path.join(root, "src/components/rooms/live/persistent-meeting-session.tsx"),
  "utf8",
);

assert.match(
  hooks,
  /useTranslationRoomParticipants\(roomId: string, enabled = true\)/,
  "Participant polling hook must allow callers to defer protected participant requests.",
);
assert.match(
  hooks,
  /enabled: Boolean\(roomId\) && enabled/,
  "Participant polling must honor the caller's authorization-ready state.",
);
assert.match(
  liveRoom,
  /useTranslationRoomParticipants\(\s*roomId,\s*meetingSession !== null && !meetingSession\.isWaitingRoom,\s*\)/,
  "Waiting-room clients must not request the protected participant roster before admission.",
);

console.log("Waiting-room admission frontend contract: PASS");
