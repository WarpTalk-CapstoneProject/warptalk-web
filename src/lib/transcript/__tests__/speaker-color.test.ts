import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTranscriptSpeaker,
  speakerColorIndex,
  speakerColorVar,
  speakerInitials,
  SPEAKER_COLOR_COUNT,
} from "../speaker-color.ts";

const TU = "019f0d00-0de0-7000-9000-000000000001";
const TUAN = "019f0d00-0de0-7000-9000-000000000002";

test("the same person is the same colour every time", () => {
  // The colour is derived rather than stored, and that is the whole reason it can be consistent
  // across meetings, devices and readers with nothing to keep in step.
  assert.equal(speakerColorIndex(TU), speakerColorIndex(TU));
  assert.equal(speakerColorVar(TU), speakerColorVar(TU));
});

test("two people in one meeting are told apart", () => {
  // UUIDv7 ids minted moments apart share a long prefix and differ only near the end. A hash that
  // weights position poorly collapses a whole room onto one colour, and the failure looks exactly
  // like the feature not being wired.
  assert.notEqual(speakerColorIndex(TU), speakerColorIndex(TUAN));
});

test("ids that differ in one character land differently across a real room", () => {
  const ids = Array.from(
    { length: 8 },
    (_, index) => `019f0d00-0de0-7000-9000-00000000000${index}`,
  );
  const colours = new Set(ids.map(speakerColorIndex));

  // Not "all different" — six colours cannot hold eight people, and pretending otherwise would be
  // a test that fails for being honest. Four or more is a spread, not a collapse.
  assert.ok(colours.size >= 4, `expected a spread, got ${colours.size} colours for 8 speakers`);
});

test("every colour is one the theme actually defines", () => {
  for (const id of [TU, TUAN, "", "x", "System"]) {
    const index = speakerColorIndex(id);
    assert.ok(index >= 1 && index <= SPEAKER_COLOR_COUNT, `${id} produced index ${index}`);
  }
});

test("a line with no speaker id still renders something", () => {
  // "System" segments carry a null participant id. A crash or a blank colour there would break
  // the rail for the whole meeting around it.
  assert.equal(speakerColorVar(null), "var(--speaker-1)");
  assert.equal(speakerColorVar(undefined), "var(--speaker-1)");
});

test("initials come from the end of a name, not the start", () => {
  // Vietnamese names put the given name last: "Huỳnh Thái Tú" is Tú, and "HT" would be the family
  // name and a middle name — two letters that identify nobody in a room of Huỳnhs.
  assert.equal(speakerInitials("Huỳnh Thái Tú"), "TT");
  assert.equal(speakerInitials("Trần Mạnh Tuấn"), "MT");
  assert.equal(speakerInitials("Madonna"), "M");
  assert.equal(speakerInitials(""), "?");
  assert.equal(speakerInitials(null), "?");
});

test("the recorded name wins over the directory's", () => {
  // What the person was called IN that meeting. A display name changed since would otherwise
  // rewrite the record of who spoke, silently and retroactively.
  const speaker = resolveTranscriptSpeaker(TU, "Huỳnh Thái Tú", {
    [TU]: { fullName: "Tu Huynh (he/him)", avatarUrl: "https://example.test/a.png" },
  });

  assert.equal(speaker.name, "Huỳnh Thái Tú");
  assert.equal(speaker.avatarUrl, "https://example.test/a.png");
});

test("somebody the workspace has never heard of keeps their name and gets no face", () => {
  // An external guest or a bridge holds no member row. Initials are the correct answer for them,
  // not a degraded one.
  const speaker = resolveTranscriptSpeaker("outsider", "Guest", {});

  assert.equal(speaker.name, "Guest");
  assert.equal(speaker.avatarUrl, undefined);
});

test("an empty avatar string is the same as having none", () => {
  // The column is nullable AND has empty strings in it, and an <img src=""> resolves against the
  // page URL — a failed request logged on every render, behind a broken-image icon.
  const speaker = resolveTranscriptSpeaker(TU, "Tú", { [TU]: { avatarUrl: "   " } });

  assert.equal(speaker.avatarUrl, undefined);
});

test("a line with neither a name nor a directory entry still says something", () => {
  const speaker = resolveTranscriptSpeaker(null, null);

  assert.equal(speaker.name, "Unknown speaker");
  assert.equal(speaker.id, null);
});
