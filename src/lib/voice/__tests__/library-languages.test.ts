/**
 * The voice library is browsed only in languages this workspace can be dubbed into.
 *
 * The line that must not be got wrong is the first test: an EMPTY policy means unrestricted. The
 * server disables its whitelist when the list is empty, so a filter reading empty as "nothing
 * permitted" would give every workspace that never set a policy an empty picker.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { resolveLibraryLanguage, voiceLibraryLanguages } from "../library-languages.ts";

const codes = (list: readonly { code: string }[]) => list.map((language) => language.code);

test("an empty policy is unrestricted, never empty", () => {
  for (const policy of [undefined, null, []]) {
    assert.deepEqual(codes(voiceLibraryLanguages(policy)), ["vi", "en", "ja", "ko", "fr", "es"]);
  }
});

test("a policy narrows the picker to what the workspace allows", () => {
  // The workspace in the report: Vietnamese and English allowed, the rest not.
  assert.deepEqual(codes(voiceLibraryLanguages(["vi", "en"])), ["vi", "en"]);
});

test("locale tags in the policy match bare codes in the registry", () => {
  // The setting stores bare codes but other writers have stored tags; comparing the two shapes
  // directly is how a whitelist silently matches nothing.
  assert.deepEqual(codes(voiceLibraryLanguages(["vi-VN", "en-US"])), ["vi", "en"]);
});

test("a policy naming no voice-library language leaves nothing to browse", () => {
  // Chinese is known to the registry but has no voice-library scope.
  assert.deepEqual(codes(voiceLibraryLanguages(["zh"])), []);
});

test("a permitted current language is kept", () => {
  const options = voiceLibraryLanguages(["vi", "en"]);
  assert.equal(resolveLibraryLanguage("en", options), "en");
  // Normalised, so the react-query key cannot split on spelling.
  assert.equal(resolveLibraryLanguage("en-US", options), "en");
});

test("the Vietnamese default snaps away when the workspace does not allow it", () => {
  // The page defaults to "vi". On a workspace allowing only Japanese, fetching "vi" would pull a
  // catalogue the picker does not even offer — snapped before anything is fetched.
  const options = voiceLibraryLanguages(["ja"]);
  assert.equal(resolveLibraryLanguage("vi", options), "ja");
});

test("no permitted language resolves to null, which the page must not fetch", () => {
  assert.equal(resolveLibraryLanguage("vi", voiceLibraryLanguages(["zh"])), null);
});
