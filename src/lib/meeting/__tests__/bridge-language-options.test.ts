import test from "node:test";
import assert from "node:assert/strict";

import {
  bridgeFarSideLanguageOptions,
  bridgeLanguageOptions,
  bridgeLanguagePolicyStatus,
} from "../bridge-language-options.ts";

// W4b: the popup's "My language" picker and the language hierarchy (L1 workspace ⊇ L2 room).

test("My language lists the room's languages, the far side included", () => {
  const { roomLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en", "vi"],
    policyStatus: "known",
    canAddLanguages: false,
  });
  assert.deepEqual(roomLanguages, ["vi", "en"]);
});

test("a member is never offered languages outside the room", () => {
  const { otherLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    allowedTargetLanguages: ["vi", "en", "ja"],
    policyStatus: "known",
    canAddLanguages: false,
  });
  assert.deepEqual(otherLanguages, []);
});

test("the host or capturer is offered what the workspace allows and the room does not", () => {
  const { roomLanguages, otherLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    allowedTargetLanguages: ["vi", "en", "ja"],
    policyStatus: "known",
    canAddLanguages: true,
  });
  assert.deepEqual(roomLanguages, ["vi", "en"]);
  assert.deepEqual(otherLanguages, ["ja"]);
});

test("the room's languages are narrowed by the workspace policy", () => {
  const { roomLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en", "ko"],
    allowedTargetLanguages: ["vi", "en"],
    policyStatus: "known",
    canAddLanguages: false,
  });
  assert.deepEqual(roomLanguages, ["vi", "en"]);
});

test("the language in use always stays selectable, even off-room or dropped by policy", () => {
  const { roomLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    current: "ko-KR",
    allowedTargetLanguages: ["vi", "en"],
    policyStatus: "known",
    canAddLanguages: false,
  });
  assert.deepEqual(roomLanguages, ["vi", "en", "ko"]);
});

test("codes are normalized and never listed twice", () => {
  const { roomLanguages, otherLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi-VN",
    targetLanguages: ["VI", "en-US", null],
    current: "vi",
    allowedTargetLanguages: ["vi", "en"],
    policyStatus: "known",
    canAddLanguages: true,
  });
  assert.deepEqual(roomLanguages, ["vi", "en"]);
  assert.deepEqual(otherLanguages, []);
});

// WT-910: a policy that has not been read is not an unrestricted policy.

test("a loaded policy with no list really is unrestricted", () => {
  for (const allowedTargetLanguages of [null, [], undefined]) {
    const { otherLanguages, otherLanguagesWithheld } = bridgeLanguageOptions({
      sourceLanguage: "vi",
      targetLanguages: ["en"],
      allowedTargetLanguages,
      policyStatus: "known",
      canAddLanguages: true,
    });
    assert.ok(otherLanguages.includes("ja"));
    assert.ok(!otherLanguages.includes("vi") && !otherLanguages.includes("en"));
    assert.equal(otherLanguagesWithheld, null);
  }
});

test("while the policy is loading or failed, only the room's languages and the current one are offered", () => {
  for (const policyStatus of ["loading", "error"] as const) {
    const { roomLanguages, otherLanguages, otherLanguagesWithheld } = bridgeLanguageOptions({
      sourceLanguage: "vi",
      targetLanguages: ["en"],
      current: "ko",
      policyStatus,
      canAddLanguages: true,
    });
    assert.deepEqual(roomLanguages, ["vi", "en", "ko"]);
    assert.deepEqual(otherLanguages, []);
    assert.equal(otherLanguagesWithheld, policyStatus);
  }
});

test("a list that arrives without a known status unlocks and narrows nothing", () => {
  // e.g. placeholder data left over from another room's query.
  const { roomLanguages, otherLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    allowedTargetLanguages: ["vi", "ja"],
    policyStatus: "loading",
    canAddLanguages: true,
  });
  assert.deepEqual(roomLanguages, ["vi", "en"]);
  assert.deepEqual(otherLanguages, []);
});

test("a member is told nothing is withheld: they are never offered another language", () => {
  const { otherLanguages, otherLanguagesWithheld } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    policyStatus: "error",
    canAddLanguages: false,
  });
  assert.deepEqual(otherLanguages, []);
  assert.equal(otherLanguagesWithheld, null);
});

test("policy status: only this room's own data counts as known", () => {
  const status = bridgeLanguagePolicyStatus;
  assert.equal(status({ hasData: true, isPlaceholderData: false, isError: false }), "known");
  // Loaded once, then a refetch failed: still a loaded policy.
  assert.equal(status({ hasData: true, isPlaceholderData: false, isError: true }), "known");
  // keepPreviousData: another room's policy standing in.
  assert.equal(status({ hasData: true, isPlaceholderData: true, isError: false }), "loading");
  assert.equal(status({ hasData: true, isPlaceholderData: true, isError: true }), "error");
  // Fetching, or the query is off because there is no room code yet.
  assert.equal(status({ hasData: false, isPlaceholderData: false, isError: false }), "loading");
  assert.equal(status({ hasData: false, isPlaceholderData: false, isError: true }), "error");
});

test("the far-side list is the workspace's languages once the policy is known", () => {
  assert.deepEqual(
    bridgeFarSideLanguageOptions({
      sourceLanguage: "vi",
      targetLanguages: ["en"],
      current: "en",
      allowedTargetLanguages: ["vi", "en", "ja"],
      policyStatus: "known",
    }).sort(),
    ["en", "ja", "vi"],
  );
  // Dropped by the policy since: still listed, first.
  assert.equal(
    bridgeFarSideLanguageOptions({
      current: "ko-KR",
      allowedTargetLanguages: ["vi", "en"],
      policyStatus: "known",
    })[0],
    "ko",
  );
});

test("the far-side list is only the room's languages while the policy is not known", () => {
  for (const policyStatus of ["loading", "error"] as const) {
    assert.deepEqual(
      bridgeFarSideLanguageOptions({
        sourceLanguage: "vi-VN",
        targetLanguages: ["en", "VI"],
        current: "ja",
        policyStatus,
      }),
      ["ja", "vi", "en"],
    );
  }
});
