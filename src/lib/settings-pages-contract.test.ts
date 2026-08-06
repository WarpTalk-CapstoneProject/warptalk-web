import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("workspace settings use queued auto-save and commit numeric values on blur or Enter", () => {
  const source = page("../app/(app)/[workspaceSlug]/settings/page.tsx");

  assert.match(source, /usePatchWorkspaceSettings/);
  assert.match(source, /AutoSaveStatusBadge/);
  assert.match(source, /commitNumericField/);
  assert.match(source, /onBlur=\{\(event\) => commitNumericField/);
  assert.match(source, /onKeyDown=\{\(e\) =>/);
  assert.match(source, /if \(!parsedInput\.ok\) return;/);
  assert.match(source, /if \(lastQueuedValuesRef\.current\[key\] === serializedValue\) return;/);
  assert.doesNotMatch(source, /Save Settings/);
});

test("personal preferences match the backend room-type contract and auto-save controls", () => {
  const source = page(
    "../app/(app)/[workspaceSlug]/settings/account/preferences/page.tsx",
  );

  assert.match(source, /useAutoSaveQueue/);
  assert.match(source, /AutoSaveStatusBadge/);
  assert.match(source, /value=\"instant\"/);
  assert.match(source, /value=\"scheduled\"/);
  assert.match(source, /commitNumericField/);
  assert.match(source, /if \(!parsedInput\.ok\) return;/);
  assert.match(source, /if \(lastQueuedValuesRef\.current\[String\(field\)\] === serializedValue\) return;/);
  assert.doesNotMatch(source, /value=\"webrtc\"/);
  assert.doesNotMatch(source, /value=\"hls\"/);
  assert.doesNotMatch(source, /Save Preferences/);
});

test("profile settings auto-save text fields and select fields without a manual save button", () => {
  const source = page("../app/(app)/[workspaceSlug]/settings/account/profile/page.tsx");

  assert.match(source, /authService\.updateProfile/);
  assert.match(source, /AutoSaveStatusBadge/);
  assert.match(source, /getProfileLanguageOptions/);
  assert.match(source, /getSupportedTimezoneOptions/);
  assert.match(source, /onBlur=\{\(e\) => commitTextField/);
  assert.match(source, /onKeyDown=\{\(e\) =>/);
  assert.match(source, /if \(lastQueuedValuesRef\.current\[field\] === serializedValue\) return;/);
  assert.doesNotMatch(source, /vi-VN/);
  assert.doesNotMatch(source, /Asia\/Ho_Chi_Minh/);
  assert.doesNotMatch(source, /Save Changes/);
});
