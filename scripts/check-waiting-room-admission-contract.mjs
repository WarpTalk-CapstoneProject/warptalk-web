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

// Because that poll is off, SOMETHING has to tell the waiting client it was let in. Approve in
// the People panel is a REST call that invalidates the HOST's participants query and nothing else,
// so before this handler existed the guest sat on the spinner until they pressed Refresh Status.
// It was masked whenever the host pressed Start Translation afterwards — TranslationRoomStarted
// re-joins everyone — so the failure is specific to admit with no subsequent start.
//
// TranslationRoomParticipantService publishes ParticipantAdmitted on the Redis relay channel and
// the Gateway broadcasts it to the room group (see the warptalk-backend tests of the same name).
assert.match(
  liveRoom,
  /connection\.on\(\s*"ParticipantAdmitted"/,
  "The meeting session must listen for ParticipantAdmitted, or an admitted guest is never released from the waiting room.",
);
// Broadcast to the whole group, so every OTHER waiting client must ignore it.
assert.match(
  liveRoom,
  /"ParticipantAdmitted",\s*\(admittedUserId: string\) => \{\s*if \(!user\?\.id \|\| admittedUserId !== user\.id\) return;/,
  "ParticipantAdmitted must only release the client whose own userId was admitted.",
);
// Re-running the join is the point: it is what turns isWaitingRoom false and swaps
// WaitingRoomView for the meeting.
assert.match(
  liveRoom,
  /"ParticipantAdmitted"[\s\S]{0,400}?retryMeetingConnectionRef\.current\(\)/,
  "ParticipantAdmitted must re-run the meeting join, not merely refetch the room.",
);

console.log("Waiting-room admission frontend contract: PASS");
