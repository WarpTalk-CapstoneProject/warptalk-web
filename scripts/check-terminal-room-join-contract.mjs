import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const accessPolicyPath = path.join(
  root,
  "src/lib/meeting/translation-room-access.ts",
);
const roomDetailPath = path.join(
  root,
  "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx",
);
const setupModalPath = path.join(
  root,
  "src/components/rooms/setup-room-modal.tsx",
);

assert.ok(
  fs.existsSync(accessPolicyPath),
  "Translation-room access policy must exist so terminal rooms cannot open the join flow.",
);

const accessPolicy = fs.readFileSync(accessPolicyPath, "utf8");
const roomDetail = fs.readFileSync(roomDetailPath, "utf8");
const setupModal = fs.readFileSync(setupModalPath, "utf8");

for (const status of ["ended", "cancelled", "expired", "failed", "timeout"]) {
  assert.match(
    accessPolicy,
    new RegExp(`["']${status}["']`),
    `Terminal status ${status} must be blocked by the access policy.`,
  );
}

// WT-273/WT-197: the room detail page no longer calls canJoinTranslationRoom itself. It asks
// resolveRoomEntryIntent, which consults canJoinTranslationRoom first and reports a terminal
// room as mode "unavailable" with isActionable false. The guarantee below is unchanged — a
// terminal room cannot open the join flow — only the place it is decided moved, so that the
// promoted header CTA and the "Meeting access" CTA cannot disagree about it.
assert.match(
  accessPolicy,
  /if \(!canJoinTranslationRoom\(input\.status\)\) \{[\s\S]{0,200}?mode: "unavailable"[\s\S]{0,120}?isActionable: false/,
  "The access policy must report a terminal room as unavailable and not actionable.",
);
assert.match(
  roomDetail,
  /resolveRoomEntryIntent\(\{/,
  "Room detail must derive whether the current room can be joined.",
);
assert.match(
  roomDetail,
  /disabled=\{!intent\.isActionable \|\| pending\}/,
  "Room detail must disable the Join meeting CTA for terminal rooms.",
);
assert.match(
  setupModal,
  /if \(!canJoinTranslationRoom\(room\.status\)\)/,
  "Setup modal must guard the API call if a room becomes terminal while open.",
);

console.log("Terminal translation-room join contract: PASS");
