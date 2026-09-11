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
import { orbBackground, orbPalette } from "../voice-orb.ts";

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

test("an orb is the same every time for the same voice", () => {
  // The whole point: a voice has to be recognisable again next week, on another screen.
  assert.deepEqual(orbPalette("voice-abc"), orbPalette("voice-abc"));
  assert.equal(orbBackground("voice-abc"), orbBackground("voice-abc"));
});

test("different voices get visibly different orbs", () => {
  const ids = Array.from({ length: 60 }, (_, index) => `voice-${index}`);
  const hues = new Set(ids.map((id) => orbPalette(id).hues[0]));
  // Not a promise of uniqueness — sixty ids into 360 hues will collide — only that the hash
  // actually spreads them rather than piling every voice onto a few colours.
  assert.ok(hues.size > 40, `only ${hues.size} distinct base hues across 60 voices`);
});

test("an orb stays one family of colours, not a rainbow", () => {
  // Three unrelated hues on one sphere stops reading as a sphere.
  for (const id of ["a", "b", "voice-1", "0192f6a1-0000-7000-8000-000000000000"]) {
    const [first, , third] = orbPalette(id).hues;
    const distance = Math.min(Math.abs(third - first), 360 - Math.abs(third - first));
    assert.ok(distance <= 220, `hues spread ${distance}° for ${id}`);
  }
});

test("an empty id still draws an orb rather than throwing", () => {
  assert.match(orbBackground(""), /conic-gradient/);
});
