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
// Deliberately anchored on the admission clause only, not on the whole argument list: the
// minimised-session idle reaper adds a further `&& !meetingIsIdleReaped` conjunct (an abandoned
// tab must stop polling too), and that must not read as a regression here. What still has to
// hold is that admission gates the request.
assert.match(
  liveRoom,
  /useTranslationRoomParticipants\(\s*roomId,\s*meetingSession !== null &&\s*!meetingSession\.isWaitingRoom/,
  "Waiting-room clients must not request the protected participant roster before admission.",
);

console.log("Waiting-room admission frontend contract: PASS");
