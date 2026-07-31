import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const accessPolicyPath = path.join(
  root,
  "src/lib/translation-room-access.ts",
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

assert.match(
  roomDetail,
  /canJoinTranslationRoom\(room\.status\)/,
  "Room detail must derive whether the current room can be joined.",
);
assert.match(
  roomDetail,
  /disabled=\{!canJoinRoom\}/,
  "Room detail must disable the Join meeting CTA for terminal rooms.",
);
assert.match(
  setupModal,
  /if \(!canJoinTranslationRoom\(room\.status\)\)/,
  "Setup modal must guard the API call if a room becomes terminal while open.",
);

console.log("Terminal translation-room join contract: PASS");
