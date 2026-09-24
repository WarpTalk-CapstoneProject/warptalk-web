import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const peoplePanel = fs.readFileSync(
  path.join(
    root,
    "src/components/rooms/live/side-panel/people-panel.tsx",
  ),
  "utf8",
);

assert.match(
  peoplePanel,
  /participant\.status === "waiting"[\s\S]*?<Button[\s\S]*?disabled=\{admit\.isPending\}[\s\S]*?\{admit\.isPending \? "Approving\.\.\." : "Approve"\}/,
  "Waiting participants must have a visible, labelled Approve button with a pending state.",
);

// WT-699 / TC2402: Reject is a MeetingService route, and MeetingService speaks USER ids — the same
// id kick, mute and transfer-host send beside it. Sending the room service's participant ROW id
// (right for Approve, which is a room-service route) matched nobody, so the knock stayed in the
// lobby while the host was told it had been rejected.
assert.match(
  peoplePanel,
  /action === "reject"\)\s*\{[\s\S]*?reject\.mutateAsync\(participant\.userId\)/,
  "Reject must send the participant's userId, not the room-service participant row id.",
);
assert.doesNotMatch(
  peoplePanel,
  /reject\.mutateAsync\(participant\.id\)/,
  "Reject must never send participant.id (the room-service row id) to the MeetingService route.",
);

// WT-699 / TC2103: a second Kick answers 409 "already removed". That is information for the
// host, not a failure to retry, and must not be shown as one.
assert.match(
  peoplePanel,
  /async function handleKick\(\)[\s\S]*?getErrorStatus\(error\) === 409[\s\S]*?toast\.info\(/,
  "A 409 from Kick (already removed) must be shown as information, not as a failure.",
);

console.log("Participant approval UI contract: PASS");
