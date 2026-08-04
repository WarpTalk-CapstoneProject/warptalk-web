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
const checks = [
  [
    "the featured tile is resolved through the holding lookup, not a bare find",
    meetingStage.includes("resolveFeaturedTrack()") &&
      !/const featuredTrack = featuredIdentity\s*\n?\s*\? visibleTracks\.find/.test(
        meetingStage,
      ),
  ],
  [
    "a pinned participant's last known tile is held across a gap",
    meetingStage.includes("heldFeaturedRef"),
  ],
  [
    "the hold is released when that participant leaves the room",
    meetingStage.includes("featuredStillInRoom"),
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
