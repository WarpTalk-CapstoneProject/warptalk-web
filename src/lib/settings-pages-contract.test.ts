import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const settingsPage = readFileSync(
  "src/app/(app)/[workspaceSlug]/settings/page.tsx",
  "utf8",
);

test("workspace settings validates artifact retention from one day", () => {
  assert.match(settingsPage, /\.min\(1,\s*"Retention must be at least 1 day"\)/);
  assert.match(settingsPage, /Use 1 - 3650 days\./);
  assert.match(settingsPage, /min=\{1\}/);
  assert.doesNotMatch(settingsPage, /Retention must be 0/);
  assert.doesNotMatch(settingsPage, /Set to 0 for indefinite retention/);
});

test("verified-domain editing is disabled when strict domain mode is off", () => {
  assert.match(
    settingsPage,
    /const isVerifiedDomainEditingDisabled =\s*isSubmitting \|\| !watchAll\.requireVerifiedDomainForInternal;/,
  );
  assert.match(settingsPage, /disabled=\{isVerifiedDomainEditingDisabled\}/);
  assert.match(settingsPage, /disabled=\{isVerifiedDomainEditingDisabled \|\| !newDomain\.trim\(\)\}/);
});
