import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("workspace settings use queued auto-save and commit numeric values on blur or Enter", () => {
  const source = page("../../../app/(app)/[workspaceSlug]/settings/page.tsx");

  assert.match(source, /usePatchWorkspaceSettings/);
  assert.match(source, /AutoSaveStatusBadge/);
  assert.match(source, /commitNumericField/);
  assert.match(source, /onBlur=\{\(event\) => commitNumericField/);
  // `(event)`, not `(e)`. This line is named for the numeric fields and those have always
  // spelled it `(event)` — the `(e)` spelling it used to match belonged to the DLP keyword
  // input, which moved to Settings › Security on 2026-09-16. So the assertion was passing on a
  // different element from the one its own test name describes, and would have gone on passing
  // if every numeric field had lost its Enter handler.
  assert.match(source, /onKeyDown=\{\(event\) =>/);
  assert.match(source, /if \(!parsedInput\.ok\) return;/);
  assert.match(source, /if \(lastQueuedValuesRef\.current\[key\] === serializedValue\) return;/);
  assert.doesNotMatch(source, /Save Settings/);
  assert.doesNotMatch(source, /translationTone/);
  assert.doesNotMatch(source, /vietnameseHonorificStyle/);
  assert.doesNotMatch(source, /japaneseHonorificStyle/);
});

test("personal preferences match the backend room-type contract, auto-save controls, and error retry state", () => {
  const source = page(
    "../../../app/(app)/[workspaceSlug]/settings/account/preferences/page.tsx",
  );

  assert.match(source, /useAutoSaveQueue/);
  assert.match(source, /AutoSaveStatusBadge/);
  assert.match(source, /useTheme/);
  assert.match(source, /value=\"instant\"/);
  assert.match(source, /value=\"scheduled\"/);
  assert.match(source, /commitNumericField/);
  assert.match(source, /refetch/);
  assert.match(source, /Retry/);
  assert.match(source, /if \(!parsedInput\.ok\) return;/);
  assert.match(source, /if \(lastQueuedValuesRef\.current\[String\(field\)\] === serializedValue\) return;/);
  assert.doesNotMatch(source, /value=\"webrtc\"/);
  assert.doesNotMatch(source, /value=\"hls\"/);
  assert.doesNotMatch(source, /Save Preferences/);
  assert.doesNotMatch(source, /transcriptFontSize/);
  assert.doesNotMatch(source, /showOriginalTranscript/);
  assert.doesNotMatch(source, /showTranslatedTranscript/);
  assert.doesNotMatch(source, /highContrast/);
  assert.doesNotMatch(source, /screenReaderMode/);
});

/**
 * Security is the page the access settings were gathered onto, and the permission split is the
 * reason it can hold them. An Owner adds verified domains — which decides who counts as Internal
 * for everyone who joins afterwards — and an Admin only reads them; the danger zone is not
 * rendered for an Admin at all. None of that is enforced by a type, so it is pinned here.
 */
test("workspace security gates domains and the danger zone on owner, and auto-saves the rest", () => {
  const source = page("../../../app/(app)/[workspaceSlug]/settings/security/page.tsx");

  // Saves the same way the other settings pages do — no manual save button.
  assert.match(source, /useAutoSaveQueue/);
  assert.match(source, /AutoSaveStatusBadge/);
  assert.match(source, /parseIntegerInRange/);
  assert.doesNotMatch(source, /Save Settings/);

  // The four things it gathered, each still here.
  assert.match(source, /allowExternalCollaboration/);
  assert.match(source, /invitationExpiryDays/);
  assert.match(source, /redactPii/);
  assert.match(source, /keywordsBlacklist/);

  // Owner-only: the editor for domains, and the danger zone as a whole.
  assert.match(source, /isOwner \? \(\s*<VerifiedDomainsManager/);
  assert.match(source, /\{isOwner && \(/);
  assert.match(source, /useTransferWorkspaceOwnership/);
  assert.match(source, /useDeleteWorkspace/);

  // The flag is written out, never carried by a spread: DlpDto requires `enabled` while
  // AiUsagePolicyDto.dlp is optional, so `{ ...policy.dlp }` alone does not typecheck.
  assert.match(source, /enabled: policy\.dlp\?\.enabled \?\? true/);
});

test("profile settings auto-save text fields and select fields without a manual save button", () => {
  const source = page("../../../app/(app)/[workspaceSlug]/settings/account/profile/page.tsx");
  const executableSource = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  assert.match(source, /authService\.updateProfile/);
  assert.match(source, /AutoSaveStatusBadge/);
  assert.match(source, /getProfileLanguageOptions/);
  assert.match(source, /getSupportedTimezoneOptions/);
  assert.match(source, /onBlur=\{\(e\) => commitTextField/);
  assert.match(source, /onKeyDown=\{\(e\) =>/);
  assert.match(source, /if \(lastQueuedValuesRef\.current\[field\] === serializedValue\) return;/);
  assert.doesNotMatch(executableSource, /vi-VN/);
  assert.doesNotMatch(executableSource, /Asia\/Ho_Chi_Minh/);
  assert.doesNotMatch(source, /Save Changes/);
});
