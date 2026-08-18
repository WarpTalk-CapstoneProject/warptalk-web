/**
 * One pre-join rule, whichever way you came in. WT-494 + WT-490.
 *
 * The two entry points disagreed twice over: `/join?code=…` asked the user but seeded the
 * dropdowns from a hardcoded vi-VN / en-US pair, ignoring their saved languages; the setup modal
 * honoured their saved languages but asked nothing and showed nothing. And neither narrowed the
 * offered set by the languages the ROOM actually declares, so a workspace permitting four
 * languages offered four in a room that declares two.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePreJoinLanguages, snapPairIntoOptions } from "../prejoin.ts";

const ALL_SIX = ["vi", "en", "ja", "ko", "fr", "es"];

test("the offered set is narrowed by the room, not only by the workspace", () => {
  // The reported case: workspace allows four, room declares two, picker showed four.
  const { options } = resolvePreJoinLanguages({
    allowedTargetLanguages: ["vi", "en", "ja", "ko"],
    roomLanguages: ["vi", "en"],
  });

  assert.deepEqual(
    options.map((option) => option.code),
    ["vi", "en"],
  );
});

test("an empty list from either source means unrestricted, never 'offer nothing'", () => {
  // Both empty is what a half-typed code answers with, and it must show the full scope.
  assert.deepEqual(
    resolvePreJoinLanguages({}).options.map((option) => option.code),
    ALL_SIX,
  );
  // A workspace with no policy, in a room that declares two.
  assert.deepEqual(
    resolvePreJoinLanguages({ roomLanguages: ["ja", "en"] }).options.map((o) => o.code),
    ["en", "ja"],
  );
  // A room whose set is unknown, in a restricted workspace.
  assert.deepEqual(
    resolvePreJoinLanguages({ allowedTargetLanguages: ["ja", "en"] }).options.map((o) => o.code),
    ["en", "ja"],
  );
});

test("the viewer's saved languages are honoured, as the modal always did", () => {
  const { speakLanguage, listenLanguage } = resolvePreJoinLanguages({
    roomLanguages: ["vi", "en", "ja"],
    savedSpeakLanguage: "ja",
    savedListenLanguage: "vi",
  });

  // /join used to ignore these entirely and start on vi-VN / en-US regardless.
  assert.equal(speakLanguage, "ja-JP");
  assert.equal(listenLanguage, "vi-VN");
});

test("a saved language the room does not speak is dropped rather than preselected", () => {
  // The failure this ordering exists to prevent: seeding a value the server would refuse, which
  // the user never chose and cannot see is wrong until the join fails.
  const { speakLanguage, listenLanguage } = resolvePreJoinLanguages({
    roomLanguages: ["ja", "en"],
    savedSpeakLanguage: "vi",
    savedListenLanguage: "vi",
    room: { sourceLanguage: "ja", targetLanguages: ["en"] },
  });

  assert.equal(speakLanguage, "ja-JP", "falls through to the room's source language");
  assert.equal(listenLanguage, "en-US", "falls through to the room's default target");
});

test("the room stands in when the viewer has saved nothing", () => {
  const { speakLanguage, listenLanguage } = resolvePreJoinLanguages({
    room: { sourceLanguage: "vi", targetLanguages: ["ja"] },
    roomLanguages: ["vi", "ja"],
  });

  assert.equal(speakLanguage, "vi-VN");
  assert.equal(listenLanguage, "ja-JP");
});

test("with neither a saved nor a room language, the first offered option is used", () => {
  const { speakLanguage, listenLanguage } = resolvePreJoinLanguages({
    roomLanguages: ["ko"],
  });

  assert.equal(speakLanguage, "ko-KR");
  assert.equal(listenLanguage, "ko-KR");
});

test("no offered language yields an empty pair rather than an invented one", () => {
  // A policy naming only languages that are not meeting-scope. Submit validation is the caller's
  // job; inventing a language here would send one the server refuses.
  const { options, speakLanguage, listenLanguage } = resolvePreJoinLanguages({
    allowedTargetLanguages: ["zh"],
  });

  assert.deepEqual(options, []);
  assert.equal(speakLanguage, "");
  assert.equal(listenLanguage, "");
});

test("a pair the user picked survives a later policy change while it is still offered", () => {
  const { options } = resolvePreJoinLanguages({ roomLanguages: ["vi", "en", "ja"] });

  const kept = snapPairIntoOptions({ speakLanguage: "ja-JP", listenLanguage: "en-US" }, options);
  assert.deepEqual(kept, { speakLanguage: "ja-JP", listenLanguage: "en-US" });
});

test("a pair that the resolved set forbids is snapped to the first offered option", () => {
  // The offered set lands after first paint, so a pair chosen against the unfiltered set has to
  // be re-checked — leaving it would keep a language the room forbids.
  const { options } = resolvePreJoinLanguages({ roomLanguages: ["ja", "en"] });

  const snapped = snapPairIntoOptions({ speakLanguage: "vi-VN", listenLanguage: "en-US" }, options);
  assert.deepEqual(snapped, { speakLanguage: "en-US", listenLanguage: "en-US" });
});
