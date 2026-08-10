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
// The target used to be state, synced to the viewer's language by an effect, and this
// asserted the sync call. It is derived now — there is no second copy that can drift — so what
// is pinned is the derivation itself, plus the absence of the header dropdown that offered a
// competing answer above a thread most people never translate.
assert.match(
  chat,
  /const suggestedTargetLanguage = targetLanguage \|\| "en"/,
  "chat translation target must follow the viewer language",
);
// Matched against the markup, not the prose: the first version of this assertion searched for
// the words "Translate to" and was tripped by the comment explaining why they were removed.
assert.doesNotMatch(
  chat,
  /<select\b/,
  "the per-message button is the only way to translate; a header dropdown duplicates it",
);
// Stale translations must still be dropped when the viewer changes what they listen in,
// otherwise a re-opened message shows the old language's text under the new language's label.
assert.match(
  chat,
  /previousTargetLanguageRef\.current = targetLanguage;[\s\S]{0,400}?setTranslations\(\{\}\)/,
  "changing the viewer language must discard translations fetched under the previous one",
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
