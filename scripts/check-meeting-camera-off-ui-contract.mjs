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
  // WT-321(1): the grid floor above is exactly what clipped the filmstrip. A thumbnail is not
  // a grid cell — it must be sized by its own rule and must never inherit min-h-[180px].
  [
    "filmstrip thumbnails are sized independently of the grid-cell floor",
    /isThumbnail \? THUMBNAIL_SIZING : GRID_TILE_SIZING/.test(meetingStage),
  ],
  [
    "a thumbnail derives its width from one height, not from conflicting w/h/max-w rules",
    /const THUMBNAIL_SIZING =\s*\n?\s*"relative aspect-video h-\[clamp\([^\]]*\)\] w-auto shrink-0"/.test(
      meetingStage,
    ) && !meetingStage.includes("aspect-video h-32 w-64"),
  ],
  [
    "the thumbnail strip is not capped shorter than the thumbnails it holds",
    !/flex max-h-\[clamp\([^\]]*\)\] items-end/.test(meetingStage),
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
