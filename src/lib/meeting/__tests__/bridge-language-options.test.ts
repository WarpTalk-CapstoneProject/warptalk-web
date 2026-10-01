import test from "node:test";
import assert from "node:assert/strict";

import { bridgeLanguageOptions } from "../bridge-language-options.ts";

// W4b: the popup's "My language" picker and the language hierarchy (L1 workspace ⊇ L2 room).

test("My language lists the room's languages, the far side included", () => {
  const { roomLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en", "vi"],
    canAddLanguages: false,
  });
  assert.deepEqual(roomLanguages, ["vi", "en"]);
});

test("a member is never offered languages outside the room", () => {
  const { otherLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    allowedTargetLanguages: ["vi", "en", "ja"],
    canAddLanguages: false,
  });
  assert.deepEqual(otherLanguages, []);
});

test("the host or capturer is offered what the workspace allows and the room does not", () => {
  const { roomLanguages, otherLanguages } = bridgeLanguageOptions({
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    allowedTargetLanguages: ["vi", "en", "ja"],
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
    canAddLanguages: true,
  });
  assert.deepEqual(roomLanguages, ["vi", "en"]);
  assert.deepEqual(otherLanguages, []);
});
