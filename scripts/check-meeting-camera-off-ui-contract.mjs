import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const meetingStage = await readFile(
  path.join(root, "src/components/rooms/live/meeting-stage.tsx"),
  "utf8",
);

const checks = [
  [
    "camera placeholders distinguish unavailable video from a LiveKit failure",
    meetingStage.includes("isCameraUnavailable(trackRef)"),
  ],
  [
    "camera-off tiles have an explicit UI state",
    meetingStage.includes('data-camera-state="off"') &&
      meetingStage.includes("Camera is off"),
  ],
  [
    "participant tile wrappers fill their grid cell",
    meetingStage.includes("relative h-full min-h-[180px]"),
  ],
  [
    "published LiveKit tracks still render through ParticipantTile",
    meetingStage.includes("<ParticipantTile") &&
      meetingStage.includes("trackRef={trackRef}"),
  ],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
