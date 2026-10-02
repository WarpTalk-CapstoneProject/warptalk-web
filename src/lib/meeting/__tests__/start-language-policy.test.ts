/**
 * WT-708 — Start narrows a meeting to the workspace's current whitelist, and says so.
 *
 * Pins the two things the web reads off backend#511: the `languagePolicyNotice` on a narrowed
 * Start, and the 403 sentence for a Start with no language left (both sets named). The refusal
 * fixture is TranslationRoomConstants.ErrorStartLanguagesNotAllowed with its placeholders filled.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  readLanguagePolicyNotice,
  readStartLanguagesRefusal,
  StartLanguagesRefusedError,
} from "../start-language-policy.ts";

test("a narrowed Start's notice is read, codes normalized", () => {
  const notice = readLanguagePolicyNotice({
    id: "room-1",
    languagePolicyNotice: {
      requested: ["vi", "en", "ja"],
      effective: ["vi", "en"],
      dropped: ["ja-JP"],
      message: "Your workspace no longer allows ja, so this meeting is running in vi, en only.",
    },
  });

  assert.deepEqual(notice?.dropped, ["ja"]);
  assert.deepEqual(notice?.effective, ["vi", "en"]);
  assert.deepEqual(notice?.requested, ["vi", "en", "ja"]);
  assert.match(notice?.message ?? "", /no longer allows ja/);
});

test("no notice on an ordinary Start", () => {
  assert.equal(readLanguagePolicyNotice({ id: "room-1" }), null);
  assert.equal(readLanguagePolicyNotice({ id: "room-1", languagePolicyNotice: null }), null);
  assert.equal(readLanguagePolicyNotice(null), null);
  assert.equal(readLanguagePolicyNotice(undefined), null);
});

test("a notice that drops nothing, or is not the backend's shape, is not shown", () => {
  assert.equal(
    readLanguagePolicyNotice({
      languagePolicyNotice: { requested: ["vi"], effective: ["vi"], dropped: [], message: "" },
    }),
    null,
  );
  assert.equal(readLanguagePolicyNotice({ languagePolicyNotice: "ja" }), null);
  assert.equal(readLanguagePolicyNotice({ languagePolicyNotice: { dropped: "ja" } }), null);
});

const REFUSED =
  "This meeting's languages (vi, en, ja) are no longer allowed by your workspace, which now allows ko, zh. Edit the meeting's languages, or ask a workspace admin to allow these again.";

test("the no-language-left refusal names both sets", () => {
  assert.deepEqual(readStartLanguagesRefusal(REFUSED), {
    meeting: ["vi", "en", "ja"],
    allowed: ["ko", "zh"],
  });
});

test("other Start refusals keep their own sentence", () => {
  assert.equal(readStartLanguagesRefusal("Only the host can start this meeting."), null);
  assert.equal(
    readStartLanguagesRefusal("Translation stopped: this workspace has run out of credits."),
    null,
  );
  assert.equal(readStartLanguagesRefusal(""), null);
  assert.equal(readStartLanguagesRefusal(undefined), null);
});

test("the rethrown refusal shows its own message and keeps the HTTP failure as cause", () => {
  const original = new Error("Request failed with status code 403");
  const refusal = readStartLanguagesRefusal(REFUSED)!;
  const error = new StartLanguagesRefusedError("localized", refusal, original);

  assert.ok(error instanceof Error);
  assert.equal(error.message, "localized");
  assert.equal(error.cause, original);
  assert.deepEqual(error.refusal.allowed, ["ko", "zh"]);
});
