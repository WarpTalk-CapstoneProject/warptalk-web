import test from "node:test";
import assert from "node:assert/strict";

import {
  disableDecision,
  normalizeLanguageCode,
  validateLanguageDraft,
} from "../admin-language-form.ts";

const catalog = [{ code: "en-US" }, { code: "vi-VN" }, { code: "ko-KR" }];

test("codes are normalised the way the server stores them", () => {
  assert.equal(normalizeLanguageCode("de"), "de");
  assert.equal(normalizeLanguageCode(" DE_de "), "de-DE");
  assert.equal(normalizeLanguageCode("fil-PH"), "fil-PH");
  for (const bad of ["", "english", "en-Latn-US", "e", "en-USA", "12"]) {
    assert.equal(normalizeLanguageCode(bad), null, bad);
  }
});

test("a language already in the catalog is refused, including a second region of it", () => {
  assert.deepEqual(validateLanguageDraft({ code: "EN-us", name: "English", nativeName: "" }, catalog), {
    error: "codeTaken",
  });
  // Room validation matches on "en", so en-GB would be indistinguishable from en-US.
  assert.deepEqual(validateLanguageDraft({ code: "en-GB", name: "English", nativeName: "" }, catalog), {
    error: "codeCovered",
    coveredBy: "en-US",
  });
});

test("names are required and bounded; editing skips the code checks", () => {
  assert.equal(validateLanguageDraft({ code: "de", name: "  ", nativeName: "" }, catalog)?.error, "nameRequired");
  assert.equal(
    validateLanguageDraft({ code: "de", name: "x".repeat(101), nativeName: "" }, catalog)?.error,
    "nameTooLong",
  );
  assert.equal(validateLanguageDraft({ code: "de", name: "German", nativeName: "Deutsch" }, catalog), null);
  assert.equal(validateLanguageDraft({ code: "ko-KR", name: "Korean", nativeName: "" }, catalog, true), null);
});

test("disabling: live use blocks, scheduled use needs confirmation, the last language stays", () => {
  assert.deepEqual(disableDecision({ isActive: true, liveMeetings: 2, upcomingMeetings: 5 }, 7), {
    kind: "blocked",
    live: 2,
  });
  assert.deepEqual(disableDecision({ isActive: true, liveMeetings: 0, upcomingMeetings: 3 }, 7), {
    kind: "confirm",
    upcoming: 3,
  });
  assert.deepEqual(disableDecision({ isActive: true }, 1), { kind: "last" });
  assert.deepEqual(disableDecision({ isActive: true, liveMeetings: 0, upcomingMeetings: 0 }, 7), {
    kind: "free",
  });
  // An older backend sends no counts: nothing to block on, the server still decides.
  assert.deepEqual(disableDecision({ isActive: true }, 7), { kind: "free" });
});
