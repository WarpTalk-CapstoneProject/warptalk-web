/**
 * WT-705 — the post-meeting picker contract.
 *
 * Reading existing content is never filtered; generating new language content is allowed only
 * in the server's WT-703 set, with the meeting's own languages as a fallback when the server
 * does not say, and nothing at all when a finished room's set could not be computed.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  artifactLanguageGroups,
  canGenerateIn,
  resolveGeneratableLanguages,
} from "../artifact-languages.ts";

test("acceptance: server set vi/en/es offers no fr/ja/ko/zh", () => {
  const result = resolveGeneratableLanguages({
    status: "ended",
    sourceLanguage: "en",
    targetLanguages: ["vi", "fr", "ja", "ko", "zh", "es"],
    artifactLanguages: { generatable: ["vi", "en", "es"] },
  });
  assert.equal(result.source, "server");
  assert.deepEqual(result.codes, ["vi", "en", "es"]);
  for (const code of ["fr", "ja", "ko", "zh"]) {
    assert.equal(canGenerateIn(code, result.codes), false, code);
  }
});

test("server set is normalized and deduped, order kept", () => {
  const result = resolveGeneratableLanguages({
    status: "ended",
    artifactLanguages: { generatable: ["en-US", "vi", "en", "VI_vn", ""] },
  });
  assert.deepEqual(result.codes, ["en", "vi"]);
});

test("no room is unavailable", () => {
  assert.deepEqual(resolveGeneratableLanguages(null), { codes: [], source: "unavailable" });
  assert.deepEqual(resolveGeneratableLanguages(undefined), { codes: [], source: "unavailable" });
});

test("field absent (older backend) falls back to the meeting set", () => {
  const result = resolveGeneratableLanguages({
    status: "ended",
    sourceLanguage: "en-US",
    targetLanguages: ["en", "vi"],
  });
  assert.deepEqual(result, { codes: ["en", "vi"], source: "meeting-fallback" });
});

test("null on a live room falls back to the meeting set", () => {
  const result = resolveGeneratableLanguages({
    status: "in_progress",
    sourceLanguage: "vi",
    targetLanguages: ["ja"],
    artifactLanguages: null,
  });
  assert.deepEqual(result, { codes: ["vi", "ja"], source: "meeting-fallback" });
});

test("null on a finished room fails closed", () => {
  for (const status of ["ended", "CANCELLED", "expired", "failed", "Timeout"]) {
    const result = resolveGeneratableLanguages({
      status,
      sourceLanguage: "vi",
      targetLanguages: ["ja"],
      artifactLanguages: null,
    });
    assert.deepEqual(result, { codes: [], source: "unavailable" }, status);
  }
});

test("existing languages are removed from the generatable group", () => {
  const groups = artifactLanguageGroups(["fr", "en-US", null, "", "fr"], ["en", "vi", "es"]);
  assert.deepEqual(groups.existing, ["fr", "en"]);
  assert.deepEqual(groups.generatable, ["vi", "es"]);
});

test("existing content stays readable even outside the generatable set", () => {
  const groups = artifactLanguageGroups(["ja"], ["vi"]);
  assert.deepEqual(groups.existing, ["ja"]);
  assert.deepEqual(groups.generatable, ["vi"]);
});

test("canGenerateIn normalizes both sides", () => {
  assert.equal(canGenerateIn("en-US", ["en"]), true);
  assert.equal(canGenerateIn("vi", ["vi-VN"]), true);
  assert.equal(canGenerateIn("fr", ["en"]), false);
  assert.equal(canGenerateIn("", ["en"]), false);
  assert.equal(canGenerateIn(null, ["en"]), false);
  assert.equal(canGenerateIn(undefined, []), false);
});
