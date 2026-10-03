import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CHALLENGE_REUSE_MARGIN_MS,
  bareLanguage,
  challengeErrorKey,
  isChallengeReusable,
  isChallengeSpentBy,
  type VoiceEnrollmentChallenge,
} from "../voice-enrollment-challenge.ts";

const now = Date.parse("2026-10-01T09:00:00Z");

function challenge(overrides: Partial<VoiceEnrollmentChallenge> = {}): VoiceEnrollmentChallenge {
  return {
    challengeId: "c1",
    language: "vi",
    phrase: "con mèo quả cam",
    expiresAt: new Date(now + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

test("bare language strips the region", () => {
  assert.equal(bareLanguage("vi-VN"), "vi");
  assert.equal(bareLanguage("en_US"), "en");
  assert.equal(bareLanguage("ja"), "ja");
});

test("a fresh phrase in the same language is reused for another take", () => {
  assert.equal(isChallengeReusable(challenge(), "vi-VN", now), true);
});

test("a phrase is not reused across a language change", () => {
  assert.equal(isChallengeReusable(challenge(), "en-US", now), false);
});

test("a phrase about to expire is not reused", () => {
  const nearlyGone = challenge({
    expiresAt: new Date(now + CHALLENGE_REUSE_MARGIN_MS - 1).toISOString(),
  });
  assert.equal(isChallengeReusable(nearlyGone, "vi-VN", now), false);
  assert.equal(isChallengeReusable(null, "vi-VN", now), false);
});

test("every server verdict on the recording spends the phrase; a form error does not", () => {
  assert.equal(isChallengeSpentBy("VOICE_CHALLENGE_MISMATCH"), true);
  assert.equal(isChallengeSpentBy("VOICE_CHALLENGE_INVALID"), true);
  assert.equal(isChallengeSpentBy("VOICE_CHALLENGE_REQUIRED"), true);
  assert.equal(isChallengeSpentBy("SERVICE_UNAVAILABLE"), true);
  assert.equal(isChallengeSpentBy("VALIDATION_ERROR"), false);
  assert.equal(isChallengeSpentBy(undefined), false);
});

test("refusal codes map to their explanation", () => {
  assert.equal(challengeErrorKey("VOICE_CHALLENGE_MISMATCH"), "mismatch");
  assert.equal(challengeErrorKey("VOICE_CHALLENGE_INVALID"), "invalid");
  assert.equal(challengeErrorKey("SERVICE_UNAVAILABLE"), "unavailable");
  assert.equal(challengeErrorKey("VALIDATION_ERROR"), null);
});

/**
 * The upload entry point is gone, and must stay gone: a file picker on this dialog is how a
 * recording of somebody else became a voice profile. The server refuses such a file anyway; this
 * keeps the dialog from offering a button that can only ever fail.
 */
test("the create-profile dialog offers no file upload and sends the challenge id", () => {
  const dialog = readFileSync(
    new URL("../../../components/voice/create-voice-profile-dialog.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(dialog, /type="file"/);
  assert.doesNotMatch(dialog, /uploadFile/);
  assert.match(dialog, /challengeId/);

  const service = readFileSync(
    new URL("../../../services/voice-profile.service.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /formData\.append\("challengeId"/);
});
