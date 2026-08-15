import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareLanguageCatalog, primarySubtag } from "../catalog-drift.ts";
import { SUPPORTED_LANGUAGES } from "../languages.ts";
import type { ServerLanguage } from "../catalog-drift.ts";

function serverLanguage(code: string, isActive = true): ServerLanguage {
  return { code, name: code.toUpperCase(), nativeName: null, isActive };
}

/** What the seed actually installs today. */
const SEEDED = ["vi", "en", "ja", "ko", "zh", "fr", "es"].map((code) => serverLanguage(code));

describe("primarySubtag", () => {
  it("reduces a locale tag to its language", () => {
    // The same reduction the server does. Demanding exact equality would report drift between
    // "en-US" and "en" that does not exist — the catalog has been seeded in both spellings.
    assert.equal(primarySubtag("en-US"), "en");
    assert.equal(primarySubtag("en"), "en");
    assert.equal(primarySubtag(" VI-vn "), "vi");
  });
});

describe("compareLanguageCatalog", () => {
  it("marks a server language this app has never heard of", () => {
    // This is the case that prints a raw code at the user: the room stores "de", and every
    // getLanguageName("de") falls through to its fallback.
    const { rows } = compareLanguageCatalog([...SEEDED, serverLanguage("de")]);

    const german = rows.find((row) => row.code === "de");
    assert.equal(german?.shippedInApp, false);

    const vietnamese = rows.find((row) => row.code === "vi");
    assert.equal(vietnamese?.shippedInApp, true);
  });

  it("matches across spellings rather than reporting false drift", () => {
    const { rows } = compareLanguageCatalog([serverLanguage("en-US")]);

    assert.equal(rows[0].shippedInApp, true);
  });

  it("names a language the picker offers that the server will reject", () => {
    // The other direction, and the one a user actually hits: the picker offers it, room creation
    // answers "Source language is not supported."
    const withoutKorean = SEEDED.filter((language) => language.code !== "ko");

    const { offeredButNotSupported } = compareLanguageCatalog(withoutKorean);

    assert.deepEqual(
      offeredButNotSupported.map((entry) => entry.code),
      ["ko"],
    );
  });

  it("treats a switched-off language as unsupported, because the user still gets rejected", () => {
    const koreanOff = SEEDED.map((language) =>
      language.code === "ko" ? { ...language, isActive: false } : language,
    );

    const { offeredButNotSupported, rows } = compareLanguageCatalog(koreanOff);

    assert.deepEqual(
      offeredButNotSupported.map((entry) => entry.code),
      ["ko"],
    );
    // The row is still listed — present and switched off is a different fix from absent.
    assert.equal(
      rows.find((row) => row.code === "ko")?.isActive,
      false,
    );
  });

  it("does not report a language this app knows but never offers for meetings", () => {
    // Chinese is chatTarget-only. Knowing a language and offering it as a room language are
    // separate decisions, and only the second one can produce a rejection.
    const withoutChinese = SEEDED.filter((language) => language.code !== "zh");

    const { offeredButNotSupported } = compareLanguageCatalog(withoutChinese);

    assert.equal(
      offeredButNotSupported.some((entry) => entry.code === "zh"),
      false,
    );
  });

  it("reports no drift against the catalog as it is seeded today", () => {
    // A canary. If someone adds a meeting language to languages.ts without seeding it, or the
    // seed drops one, this fails and names it — which is exactly what nothing checked before.
    const { offeredButNotSupported } = compareLanguageCatalog(SEEDED);

    assert.deepEqual(offeredButNotSupported, []);
  });

  it("covers every meeting language the app ships", () => {
    const meetingLanguages = SUPPORTED_LANGUAGES.filter((language) =>
      language.scopes.includes("meeting"),
    );

    assert.ok(meetingLanguages.length > 0);
    const { rows } = compareLanguageCatalog(SEEDED);
    for (const language of meetingLanguages) {
      const row = rows.find((r) => primarySubtag(r.code) === primarySubtag(language.code));
      assert.ok(row, `${language.code} has no server row in the seeded catalog`);
      assert.equal(row.offeredForMeetings, true);
    }
  });
});
