import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const meetingStage = await readFile(
  path.join(root, "src/components/rooms/live/meeting-stage.tsx"),
  "utf8",
);

// WT-245: pinning a camera-off participant made the stage flip between them and whoever was on
// camera. Their TrackReference is not stable — LiveKit swaps between a muted publication and the
// withPlaceholder entry — and a missed lookup used to fall straight through to the generic
// layouts below, which feature somebody else.
//
// The fix keys the pin to the person rather than to a publication, and is purely derived: an
// earlier attempt held the last reference in a ref, which React's lint rejects because reading a
// ref during render neither triggers nor reflects a re-render.
const checks = [
  [
    "the pinned participant is resolved from the room, not from the track list",
    meetingStage.includes("featuredParticipant") &&
      meetingStage.includes("room.remoteParticipants.values()"),
  ],
  [
    "a pin with no publication this tick still renders that person's camera placeholder",
    /featuredParticipant\s*\n?\s*\?\s*\{\s*\n?\s*participant: featuredParticipant/.test(
      meetingStage,
    ),
  ],
  [
    "the pin is derived, never held across renders in a ref",
    !meetingStage.includes("heldFeaturedRef"),
  ],
  [
    "the featured participant is excluded from thumbnails by identity, not just by object",
    meetingStage.includes(
      "trackRef.participant.identity !== featuredTrack.participant.identity",
    ),
  ],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
