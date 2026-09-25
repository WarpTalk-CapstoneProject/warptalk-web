import test from "node:test";
import assert from "node:assert/strict";

import {
  BRIDGE_STAND_IN_USER_ID,
  defaultFarSideLanguage,
  farSideLanguageProblem,
  planBridgeRoomLanguages,
} from "../bridge-far-side-language.ts";

test("the stand-in id is the backend's ExternalBridgeConstants.ParticipantUserId", () => {
  assert.equal(BRIDGE_STAND_IN_USER_ID, "00000000-0000-0000-0000-00000000b21d");
});

test("default: the first allowed language that is not the host's", () => {
  assert.deepEqual(defaultFarSideLanguage("vi", ["vi", "ja", "en"]), { language: "ja", translatable: true });
  assert.deepEqual(defaultFarSideLanguage("ja-JP", ["JA", "vi-VN"]), { language: "vi", translatable: true });
});

test("default: an unrestricted workspace gets English, or Vietnamese for an English speaker", () => {
  assert.deepEqual(defaultFarSideLanguage("vi", []), { language: "en", translatable: true });
  assert.deepEqual(defaultFarSideLanguage("ko", []), { language: "en", translatable: true });
  assert.deepEqual(defaultFarSideLanguage("en-US", []), { language: "vi", translatable: true });
});

test("default: a one-language workspace falls back to that language and says it cannot translate", () => {
  assert.deepEqual(defaultFarSideLanguage("vi", ["vi"]), { language: "vi", translatable: false });
});

test("create dialog: a declared second language is the far side, whatever its position", () => {
  const plan = planBridgeRoomLanguages({
    speak: "vi-VN",
    candidates: ["vi-VN", "en-US"],
    allowedLanguages: [],
  });
  assert.deepEqual(plan, {
    sourceLanguage: "vi",
    targetLanguages: ["en", "vi"],
    externalMeetingLanguage: "en",
    translatable: true,
  });
});

test("create dialog: only the host's language declared falls back to the default", () => {
  const plan = planBridgeRoomLanguages({ speak: "en-US", candidates: ["en-US"], allowedLanguages: [] });
  assert.equal(plan.externalMeetingLanguage, "vi");
  assert.deepEqual(plan.targetLanguages, ["vi", "en"]);
});

test("create dialog: a declared language the workspace forbids is not chosen for the far side", () => {
  const plan = planBridgeRoomLanguages({ speak: "vi", candidates: ["vi", "ko"], allowedLanguages: ["vi", "ja"] });
  assert.equal(plan.externalMeetingLanguage, "ja");
});

test("the far side always leads the targets, for a server that still reads targetLanguages[0]", () => {
  const plan = planBridgeRoomLanguages({ speak: "vi", candidates: ["vi", "ja", "en"], allowedLanguages: [] });
  assert.equal(plan.targetLanguages[0], plan.externalMeetingLanguage);
  assert.deepEqual(plan.targetLanguages, ["ja", "vi", "en"]);
});

test("problem: none while either side is unknown or the two differ", () => {
  assert.equal(farSideLanguageProblem({ hostLanguage: null, farSideLanguage: "vi", allowedLanguages: [] }), null);
  assert.equal(farSideLanguageProblem({ hostLanguage: "vi", farSideLanguage: null, allowedLanguages: [] }), null);
  assert.equal(farSideLanguageProblem({ hostLanguage: "vi", farSideLanguage: "en", allowedLanguages: [] }), null);
});

test("problem: same language, with a second one available to pick", () => {
  assert.equal(
    farSideLanguageProblem({ hostLanguage: "vi-VN", farSideLanguage: "vi", allowedLanguages: [] }),
    "same-language",
  );
  assert.equal(
    farSideLanguageProblem({ hostLanguage: "vi", farSideLanguage: "vi", allowedLanguages: ["vi", "en"] }),
    "same-language",
  );
});

test("problem: the workspace allows only the one language both sides are on", () => {
  assert.equal(
    farSideLanguageProblem({ hostLanguage: "vi", farSideLanguage: "vi", allowedLanguages: ["VI"] }),
    "single-language-workspace",
  );
});
