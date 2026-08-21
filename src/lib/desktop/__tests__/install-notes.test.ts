/**
 * The two install notes, and the one difference between them that is easy to get wrong.
 *
 * The macOS note is scaffolding: it exists only while the desktop builds are unnotarized, and
 * warptalk-desktop PR #14 already wired the signing that ends it. The Windows note is permanent —
 * SmartScreen warns about every low-reputation installer and code signing no longer buys an
 * instant bypass. A change that makes them behave alike is a bug in one direction or the other,
 * so both directions are pinned here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstallNotes,
  compareVersions,
  macBuildIsNotarized,
  MAC_NOTARIZED_FROM_VERSION,
} from "../install-notes.ts";

const release = (overrides: Partial<Parameters<typeof buildInstallNotes>[0]> = {}) => ({
  version: "0.3.3",
  hasMacAsset: true,
  hasWindowsAsset: true,
  ...overrides,
});

test("an unnotarized release gets the macOS note", () => {
  const notes = buildInstallNotes(release());
  const mac = notes.find((note) => note.platform === "mac");
  assert.ok(mac, "macOS visitors are handed a .dmg that will not open on the first try");
  assert.match(mac.steps.join(" "), /Open Anyway/);
  assert.match(mac.steps.join(" "), /Privacy & Security/);
});

test("the macOS note never teaches a visitor to strip the quarantine flag", () => {
  // It works, and it is in warptalk-desktop/README.md for the team. On a public download page it
  // is a shell command that disarms Gatekeeper, pasted by people who cannot audit it.
  const text = JSON.stringify(buildInstallNotes(release()));
  assert.doesNotMatch(text, /xattr/i);
  assert.doesNotMatch(text, /quarantine/i);
  assert.doesNotMatch(text, /sudo/i);
});

test("the macOS note disappears the moment notarized builds ship", () => {
  // The whole removal procedure is setting MAC_NOTARIZED_FROM_VERSION. Proving the gate works
  // while it is still null takes reproducing it, since the constant cannot be reassigned.
  const notarizedFrom = "1.0.0";
  const gate = (version: string) => compareVersions(version, notarizedFrom) >= 0;

  assert.equal(gate("0.3.3"), false);
  assert.equal(gate("1.0.0"), true);
  assert.equal(gate("1.0.1"), true);
  assert.equal(gate("1.0.0-rc.1"), false, "a prerelease of the notarized version is not it yet");
});

test("today's constant still shows the note, and says so honestly", () => {
  // If this fails because someone set the constant, the release it names must actually answer
  // `source=Notarized Developer ID` to spctl. Setting it early hides a dialog users still get.
  assert.equal(MAC_NOTARIZED_FROM_VERSION, null);
  assert.equal(macBuildIsNotarized("0.3.3"), false);
  assert.equal(macBuildIsNotarized(null), false);
});

test("the Windows note is not gated on anything and does not promise an end", () => {
  // EV code signing stopped granting an instant SmartScreen bypass in 2024; reputation is earned
  // per-file over downloads. There is no WarpTalk version where a fresh release stops warning.
  const notes = buildInstallNotes(release({ version: "99.0.0" }));
  const windows = notes.find((note) => note.platform === "windows");
  assert.ok(windows, "a future version must not silently drop the Windows note");
  assert.match(windows.steps.join(" "), /Run anyway/);
  assert.match(windows.steps.join(" "), /Windows protected your PC/);
  assert.doesNotMatch(windows.summary + windows.footnote, /\byet\b/);
});

test("the Windows note admits the case its own steps cannot fix", () => {
  // A managed machine can block the file with no Run anyway button at all. Claiming otherwise
  // sends someone in a loop against a policy no download page can argue with.
  const windows = buildInstallNotes(release()).find((note) => note.platform === "windows");
  assert.ok(windows);
  assert.match(windows.footnote, /manage/i);
  assert.ok(windows.link, "and offers the browser, which needs no installer at all");
});

test("a platform with nothing to download gets no note", () => {
  // /download lists every platform to everyone, so the notes follow the published assets rather
  // than a guess at the visitor's OS. A release with no Windows build must not explain SmartScreen.
  const macOnly = buildInstallNotes(release({ hasWindowsAsset: false }));
  assert.deepEqual(
    macOnly.map((note) => note.platform),
    ["mac"],
  );

  const nothing = buildInstallNotes(
    release({ version: null, hasMacAsset: false, hasWindowsAsset: false }),
  );
  assert.deepEqual(nothing, []);
});

test("version ordering survives the tags electron-builder actually cuts", () => {
  assert.equal(compareVersions("0.3.3", "0.3.10") < 0, true, "0.3.10 is not 0.3.1");
  assert.equal(compareVersions("v1.2.0", "1.2.0"), 0, "a leading v is a tag artefact");
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(compareVersions("1.0.0-beta.2", "1.0.0-beta.10") < 0, true);
});
