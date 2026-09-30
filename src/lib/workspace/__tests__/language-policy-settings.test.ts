import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RESTRICT_TARGET_LANGUAGES_FIELD,
  defaultLanguageOptions,
  isDefaultLanguageOutOfPolicy,
  readLanguagePolicy,
  setLanguageRestriction,
  toLanguagePolicyPatch,
  toggleAllowedLanguage,
  type LanguagePolicyState,
} from "../language-policy-settings.ts";

const restricted = (allowed: string[], defaultLanguage = allowed[0]): LanguagePolicyState => ({
  restricted: true,
  allowed,
  defaultLanguage,
});

describe("reading the saved policy", () => {
  it("infers the posture from the list when the server sends no flag", () => {
    assert.equal(readLanguagePolicy({ allowedTargetLanguages: ["en", "vi"] }).restricted, true);
    assert.equal(readLanguagePolicy({ allowedTargetLanguages: [] }).restricted, false);
    assert.equal(readLanguagePolicy({}).restricted, false);
  });

  it("prefers the server's flag over the inference", () => {
    const state = readLanguagePolicy({
      allowedTargetLanguages: ["en", "vi"],
      [RESTRICT_TARGET_LANGUAGES_FIELD]: false,
    });

    assert.equal(state.restricted, false);
    // A stale list under an "allow all" flag must not read as a restriction anywhere.
    assert.deepEqual(state.allowed, []);
  });

  it("folds locale tags and duplicates down to bare codes", () => {
    const state = readLanguagePolicy({
      allowedTargetLanguages: ["vi-VN", "vi", "EN"],
      defaultLanguage: "en-US",
    });

    assert.deepEqual(state.allowed, ["vi", "en"]);
    assert.equal(state.defaultLanguage, "en");
  });
});

describe("the allow-all switch", () => {
  it("empties the list when restriction is turned off", () => {
    const change = setLanguageRestriction(restricted(["en", "vi"]), false);

    assert.equal(change.changed, true);
    assert.equal(change.next.restricted, false);
    assert.deepEqual(change.next.allowed, []);
  });

  it("seeds from the default language when restriction is turned on from nothing", () => {
    const change = setLanguageRestriction(
      { restricted: false, allowed: [], defaultLanguage: "ja" },
      true,
    );

    assert.equal(change.next.restricted, true);
    assert.deepEqual(change.next.allowed, ["ja"]);
    assert.equal(change.notice, "seededFromDefault");
    assert.equal(change.noticeLanguage, "ja");
  });

  it("never turns restriction on with an empty list, whatever the default language is", () => {
    for (const defaultLanguage of ["", "xx", "en"]) {
      const change = setLanguageRestriction({ restricted: false, allowed: [], defaultLanguage }, true);
      assert.ok(
        change.next.allowed.length > 0,
        `restricting with default "${defaultLanguage}" produced the empty list that means "allow all"`,
      );
    }
  });
});

describe("ticking languages while restricted", () => {
  it("refuses to untick the last language instead of silently allowing everything", () => {
    const state = restricted(["en"]);
    const change = toggleAllowedLanguage(state, "en");

    assert.equal(change.blocked, "lastLanguage");
    assert.equal(change.changed, false);
    assert.deepEqual(change.next, state);
  });

  it("adds and removes otherwise", () => {
    const added = toggleAllowedLanguage(restricted(["en"]), "vi");
    assert.deepEqual(added.next.allowed, ["en", "vi"]);
    assert.equal(added.blocked, null);

    const removed = toggleAllowedLanguage(restricted(["en", "vi"], "en"), "vi");
    assert.deepEqual(removed.next.allowed, ["en"]);
    assert.equal(removed.notice, null);
  });

  it("moves the default language when the default is the one unticked", () => {
    const change = toggleAllowedLanguage(restricted(["en", "vi"], "en"), "en");

    assert.deepEqual(change.next.allowed, ["vi"]);
    assert.equal(change.next.defaultLanguage, "vi");
    assert.equal(change.notice, "defaultLanguageMoved");
    assert.equal(change.noticeLanguage, "en");
  });

  it("matches a locale tag against the bare codes the list holds", () => {
    const change = toggleAllowedLanguage(restricted(["en", "vi"], "en"), "vi-VN");
    assert.deepEqual(change.next.allowed, ["en"]);
  });

  it("leaves an unrestricted policy alone", () => {
    const state: LanguagePolicyState = { restricted: false, allowed: [], defaultLanguage: "en" };
    assert.deepEqual(toggleAllowedLanguage(state, "vi").next, state);
  });
});

describe("the default language picker", () => {
  it("offers only permitted languages while restricted", () => {
    const codes = defaultLanguageOptions(restricted(["en", "vi"])).map((l) => l.code);
    // Registry order, not the order the Owner happened to tick them in: this is the same list
    // every other language picker shows, narrowed.
    assert.deepEqual(codes.slice().sort(), ["en", "vi"]);
  });

  it("offers the whole meeting scope when unrestricted", () => {
    const codes = defaultLanguageOptions({
      restricted: false,
      allowed: [],
      defaultLanguage: "en",
    }).map((l) => l.code);

    assert.ok(codes.length > 2, "an unrestricted workspace should see more than a pair of languages");
    assert.ok(codes.includes("ko"));
  });

  it("keeps an out-of-policy saved value visible, and flags it", () => {
    const state = restricted(["en", "vi"], "ja");

    assert.equal(isDefaultLanguageOutOfPolicy(state), true);
    assert.ok(
      defaultLanguageOptions(state).some((l) => l.code === "ja"),
      "dropping the saved value from its own picker is how a setting gets silently rewritten",
    );
  });

  it("flags nothing while unrestricted", () => {
    assert.equal(
      isDefaultLanguageOutOfPolicy({ restricted: false, allowed: [], defaultLanguage: "ja" }),
      false,
    );
  });
});

describe("what gets saved", () => {
  it("sends the flag alongside the list", () => {
    assert.deepEqual(toLanguagePolicyPatch(restricted(["en", "vi"])), {
      [RESTRICT_TARGET_LANGUAGES_FIELD]: true,
      allowedTargetLanguages: ["en", "vi"],
    });
  });

  it("sends an empty list when unrestricted, because that is what every reader already means by it", () => {
    assert.deepEqual(
      toLanguagePolicyPatch({ restricted: false, allowed: ["en"], defaultLanguage: "en" }),
      { [RESTRICT_TARGET_LANGUAGES_FIELD]: false, allowedTargetLanguages: [] },
    );
  });

  it("never saves a restricted policy with an empty list", () => {
    const turnedOn = setLanguageRestriction(
      { restricted: false, allowed: [], defaultLanguage: "en" },
      true,
    );
    const patch = toLanguagePolicyPatch(turnedOn.next);

    assert.equal(patch[RESTRICT_TARGET_LANGUAGES_FIELD], true);
    assert.ok(patch.allowedTargetLanguages.length > 0);
  });
});
