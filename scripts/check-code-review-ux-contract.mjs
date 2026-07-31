import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [setup, chat, stage, invite, adjust] = await Promise.all([
  read("src/components/rooms/setup-room-modal.tsx"),
  read("src/components/rooms/live/chat-panel.tsx"),
  read("src/components/rooms/live/meeting-stage.tsx"),
  read("src/components/rooms/create/invite-people-picker.tsx"),
  read("src/components/admin/AdjustCreditModal.tsx"),
]);

assert.match(setup, /mediaGenerationRef/, "media preview must invalidate stale starts");
assert.match(chat, /shouldAutoScrollRef/, "chat must preserve manual scroll position");
assert.match(
  chat,
  /setSelectedTargetLanguage\(targetLanguage\)/,
  "chat translation target must follow the viewer language",
);
assert.match(stage, /layoutMode,/, "meeting stage must consume the selected layout");
assert.match(stage, /layoutMode === "grid"/, "grid mode needs distinct behavior");
assert.match(stage, /layoutMode === "sidebar"/, "sidebar mode needs distinct behavior");
assert.match(invite, /isValidInviteEmail/, "invites need complete email validation");
assert.match(
  invite,
  /activeWorkspaceId/,
  "member suggestions must use the active workspace",
);
assert.doesNotMatch(
  invite,
  /member\.email \|\| member\.userId/,
  "member IDs must never be submitted as email addresses",
);
assert.match(
  adjust,
  /MAX_CREDIT_ADJUSTMENT/,
  "credit changes need a bounded amount",
);
assert.match(adjust, /Number\.isFinite/, "credit changes must reject non-finite values");
assert.match(adjust, /confirmation/, "credit changes need an explicit confirmation step");

console.log("Code-review UX contracts passed.");
