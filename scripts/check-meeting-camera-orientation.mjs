import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const meetingStage = await readFile(
  path.join(root, "src/components/rooms/live/meeting-stage.tsx"),
  "utf8"
);

const checks = [
  [
    "LiveKit participant camera tiles are not mirrored",
    !meetingStage.includes("[&[data-lk-local-participant=true][data-lk-source=camera]_video]:-scale-x-100"),
  ],
  [
    "LiveKit participant camera tiles do not force participant-specific horizontal scale",
    !meetingStage.includes("[&[data-lk-local-participant=false]_video]:scale-x-100"),
  ],
  [
    "local meeting preview camera is not mirrored",
    !meetingStage.includes('className="h-full w-full object-cover -scale-x-100"'),
  ],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
