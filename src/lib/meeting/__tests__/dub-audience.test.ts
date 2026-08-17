import assert from "node:assert/strict";
import test from "node:test";

import { hasDubAudience, type DubAudienceParticipant } from "../dub-audience.ts";

/**
 * The report: "nó hiển thị 2 cái đều bật trong khi chả nói được voice clone gì, đầu bên kia
 * vẫn nghe giọng gốc của tôi." Both switches read on, and the other side still hears the
 * speaker's real voice.
 *
 * Nothing was broken. Production, meeting 01a003d5, every route ever created for it:
 *
 *   src=..0002 -> tgt=..0001   en -> vi   voice_clone_enabled=true   COMPLETED
 *
 * One route, pointing the other way. Routes exist per (speaker, listener) pair and only where
 * the languages differ, so 0001 had no outgoing route: nothing they said was translated, so
 * there was no dub for their cloned voice to appear in. The setting was saved, honoured, and
 * irrelevant — and the UI said "My voice" throughout.
 */

const ME = "019f0d00-0de0-7000-9000-000000000001";
const THEM = "019f0d00-0de0-7000-9000-000000000002";

function participant(overrides: Partial<DubAudienceParticipant> = {}): DubAudienceParticipant {
  return { userId: THEM, listenLanguage: "en", status: "joined", ...overrides };
}

test("the production case: everyone listens in the language I speak, so nothing of mine is dubbed", () => {
  // 0001 speaks Vietnamese; the only other person is listening in Vietnamese too.
  const audience = hasDubAudience("vi", ME, [participant({ listenLanguage: "vi" })]);

  assert.equal(
    audience,
    false,
    "Voice Clone reported 'My voice' in exactly this room shape while the other side heard " +
      "the speaker's real voice, because no route out of them can exist.",
  );
});

test("somebody listening in another language is a real audience", () => {
  assert.equal(hasDubAudience("vi", ME, [participant({ listenLanguage: "en" })]), true);
});

test("my own listen language is not an audience for my own voice", () => {
  // The self row is the easiest way to get this wrong: a Vietnamese speaker listening in
  // English would otherwise look like their own audience and the row would promise a dub
  // that no route produces.
  const audience = hasDubAudience("vi", ME, [
    { userId: ME, listenLanguage: "en", status: "joined" },
  ]);

  assert.equal(audience, false, "the speaker was counted as their own dub audience");
});

test("locale tags are compared on the base language", () => {
  // "vi-VN" and "vi" are one language; a route is not generated between them. Treating them
  // as different would claim an audience that does not exist.
  assert.equal(hasDubAudience("vi-VN", ME, [participant({ listenLanguage: "vi" })]), false);
  assert.equal(hasDubAudience("vi", ME, [participant({ listenLanguage: "VI-vn" })]), false);
  assert.equal(hasDubAudience("vi-VN", ME, [participant({ listenLanguage: "en-US" })]), true);
});

test("somebody who has not arrived is not an audience", () => {
  // Counting an invitee would tell someone their voice is being dubbed for a person who is
  // not in the room.
  for (const status of ["invited", "waiting", "left", "removed", "kicked", "disconnected"]) {
    assert.equal(
      hasDubAudience("vi", ME, [participant({ listenLanguage: "en", status })]),
      false,
      `status ${status} was treated as present`,
    );
  }
  assert.equal(hasDubAudience("vi", ME, [participant({ status: "connected" })]), true);
});

test("one listener in another language is enough, among many who are not", () => {
  const audience = hasDubAudience("vi", ME, [
    participant({ userId: "a", listenLanguage: "vi" }),
    participant({ userId: "b", listenLanguage: "vi" }),
    participant({ userId: "c", listenLanguage: "ja" }),
  ]);

  assert.equal(audience, true);
});

test("an unknown speak language promises nothing", () => {
  // It cannot be said to differ from anything, so the honest answer is "do not claim a dub".
  assert.equal(hasDubAudience(null, ME, [participant({ listenLanguage: "en" })]), false);
  assert.equal(hasDubAudience("", ME, [participant({ listenLanguage: "en" })]), false);
  assert.equal(hasDubAudience("   ", ME, [participant({ listenLanguage: "en" })]), false);
});

test("an empty or missing room is not an audience", () => {
  assert.equal(hasDubAudience("vi", ME, []), false);
  assert.equal(hasDubAudience("vi", ME, null), false);
  assert.equal(hasDubAudience("vi", ME, undefined), false);
});

test("a participant with no declared listen language is not counted", () => {
  assert.equal(hasDubAudience("vi", ME, [participant({ listenLanguage: null })]), false);
  assert.equal(hasDubAudience("vi", ME, [participant({ listenLanguage: "" })]), false);
});
