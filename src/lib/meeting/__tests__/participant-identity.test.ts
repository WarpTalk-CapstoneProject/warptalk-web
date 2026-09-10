import assert from "node:assert/strict";
import test from "node:test";

import {
  buildParticipantIdentities,
  describeParticipantLanguage,
  getInitials,
  identityFor,
} from "../participant-identity.ts";

const SELF = {
  id: "self-id",
  fullName: "Huynh Thai Tu",
  email: "tu@example.com",
  avatarUrl: "https://cdn.example.com/self.png",
};

test("the avatar comes from the workspace member row, because the participant API carries none", () => {
  const identities = buildParticipantIdentities({
    participants: [
      { userId: "other-id", displayName: "Ngo Xuan Hanh Nhi", speakLanguage: "vi-VN" },
    ],
    members: [
      {
        userId: "other-id",
        fullName: "Ngo Xuan Hanh Nhi",
        email: "nhi@example.com",
        avatarUrl: "https://cdn.example.com/nhi.png",
      },
    ],
  });

  assert.equal(identities["other-id"].avatarUrl, "https://cdn.example.com/nhi.png");
  assert.equal(identities["other-id"].name, "Ngo Xuan Hanh Nhi");
  assert.equal(identities["other-id"].initials, "NX");
});

test("a participant with no member row keeps their name and falls back to initials", () => {
  const identities = buildParticipantIdentities({
    participants: [{ userId: "guest-id", displayName: "Bridge Guest" }],
    members: [],
  });

  assert.equal(identities["guest-id"].avatarUrl, undefined);
  assert.equal(identities["guest-id"].initials, "BG");
});

test("the current user's own avatar and languages beat the roster copy", () => {
  const identities = buildParticipantIdentities({
    participants: [
      {
        userId: "self-id",
        displayName: "Huynh Thai Tu",
        speakLanguage: "en-US",
        listenLanguage: "en-US",
      },
    ],
    members: [
      {
        userId: "self-id",
        fullName: "Huynh Thai Tu",
        email: "tu@example.com",
        avatarUrl: "https://cdn.example.com/stale.png",
      },
    ],
    self: SELF,
    selfLanguages: { speak: "vi-VN", listen: "vi-VN" },
  });

  assert.equal(identities["self-id"].avatarUrl, "https://cdn.example.com/self.png");
  assert.equal(identities["self-id"].speakLanguage, "vi-VN");
  assert.equal(identities["self-id"].listenLanguage, "vi-VN");
});

test("the local user is present before their participant row has been read back", () => {
  const identities = buildParticipantIdentities({
    participants: [],
    members: [],
    self: SELF,
    selfLanguages: { speak: "vi-VN" },
  });

  assert.equal(identities["self-id"].name, "Huynh Thai Tu");
  assert.equal(identities["self-id"].avatarUrl, "https://cdn.example.com/self.png");
  assert.equal(identities["self-id"].speakLanguage, "vi-VN");
});

test("identityFor always answers, using the caller's fallback name for an unknown id", () => {
  const identity = identityFor({}, "unknown-id", "AI Interpreter");

  assert.equal(identity.name, "AI Interpreter");
  assert.equal(identity.initials, "AI");
});

test("initials never come back empty", () => {
  assert.equal(getInitials(""), "?");
  assert.equal(getInitials(undefined), "?");
  assert.equal(getInitials("  Tu  "), "T");
});

test("the language badge is a language code and a language name, nothing else", () => {
  const badge = describeParticipantLanguage("vi-VN", "vi-VN");

  assert.equal(badge?.code, "VI");
  assert.equal(badge?.label, "Vietnamese");
});

test("a split profile shows the language the person chose to hear", () => {
  const badge = describeParticipantLanguage("vi", "en-US");

  // The `code` key is WT-661's; the ENGLISH value is development's listen-first ordering, and
  // it is what this test's own name asks for — the branch asserted Vietnamese, which is the
  // language this person SPEAKS, not the one they chose to hear.
  assert.equal(badge?.code, "EN");
  assert.equal(badge?.label, "English");
});

test("the speak language stands in when nobody said what they want to hear", () => {
  const badge = describeParticipantLanguage("ja-JP", null);

  assert.equal(badge?.code, "JA");
  assert.equal(badge?.label, "Japanese");
});

test("no languages means no badge at all", () => {
  assert.equal(describeParticipantLanguage(null, undefined), null);
});
