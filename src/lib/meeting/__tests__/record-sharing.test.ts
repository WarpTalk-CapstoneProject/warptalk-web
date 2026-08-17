/**
 * What the meeting-record header says, and to whom. WT-480.
 *
 * `artifactAccess` has existed and been enforced on the server for the whole life of the feature,
 * with nothing in the product able to turn it on — so every meeting sat on its default, host
 * only, and a participant reading the record of a meeting they attended was refused with a flat
 * "Unauthorized".
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ARTIFACT_ACCESS,
  describeRecordSharing,
  isRecordShared,
  nextArtifactAccess,
} from "../record-sharing.ts";

test("only the stored shared level counts as shared", () => {
  assert.equal(isRecordShared(ARTIFACT_ACCESS.allParticipants), true);
  assert.equal(isRecordShared(ARTIFACT_ACCESS.hostOnly), false);
});

test("an unknown or absent level reads as NOT shared", () => {
  // The same direction the server's guard fails in. Guessing "shared" from a value this build
  // does not recognise would put a reassuring sentence on screen about a decision nobody made.
  assert.equal(isRecordShared(undefined), false);
  assert.equal(isRecordShared(null), false);
  assert.equal(isRecordShared(""), false);
  assert.equal(isRecordShared("WORKSPACE"), false);
  assert.equal(isRecordShared("all_participants"), false, "levels are case-sensitive tokens");
});

test("the button sends the opposite of the current level", () => {
  assert.equal(nextArtifactAccess(ARTIFACT_ACCESS.hostOnly), ARTIFACT_ACCESS.allParticipants);
  assert.equal(nextArtifactAccess(ARTIFACT_ACCESS.allParticipants), ARTIFACT_ACCESS.hostOnly);
  // An unrecognised level is not shared, so the offer is to share it.
  assert.equal(nextArtifactAccess(undefined), ARTIFACT_ACCESS.allParticipants);
});

test("a host with an unshared record is told who cannot see it", () => {
  const view = describeRecordSharing({ artifactAccess: ARTIFACT_ACCESS.hostOnly, isHost: true });

  assert.equal(view.badge, "Draft");
  assert.equal(view.tone, "draft");
  assert.equal(view.action, "Publish to participants");
  assert.match(view.message ?? "", /Only you can see/);
  // The button names all three things it shares — artifactAccess governs them together, so a
  // host pressing "publish the transcript" would be sharing the recording without being told.
  assert.match(view.message ?? "", /recording/);
});

test("a host with a shared record is told edits are now visible to others", () => {
  const view = describeRecordSharing({
    artifactAccess: ARTIFACT_ACCESS.allParticipants,
    isHost: true,
  });

  assert.equal(view.badge, "Published");
  assert.equal(view.tone, "shared");
  assert.equal(view.action, "Unpublish");
  assert.match(view.message ?? "", /still edit/);
});

test("a participant waiting on the host gets a sentence, not a refusal", () => {
  const view = describeRecordSharing({ artifactAccess: ARTIFACT_ACCESS.hostOnly, isHost: false });

  assert.equal(view.badge, "Not shared yet");
  assert.equal(view.tone, "withheld");
  assert.equal(view.action, null, "a participant has nothing to publish");
  assert.match(view.message ?? "", /host has not shared/);
  assert.doesNotMatch(view.message ?? "", /nauthoriz/, "the old sentence read as a broken page");
});

test("a participant with a shared record is shown no banner at all", () => {
  const view = describeRecordSharing({
    artifactAccess: ARTIFACT_ACCESS.allParticipants,
    isHost: false,
  });

  assert.equal(view.badge, "Shared by host");
  assert.equal(view.tone, null);
  assert.equal(view.message, null, "explaining that they may read what is in front of them is noise");
  assert.equal(view.action, null);
});

test("the badge and the banner never disagree", () => {
  // The reason all four pieces come from one function: derived separately at their own call
  // sites, a "Draft" badge can end up beside a banner saying everybody can read it.
  for (const isHost of [true, false]) {
    for (const level of [ARTIFACT_ACCESS.hostOnly, ARTIFACT_ACCESS.allParticipants, undefined]) {
      const view = describeRecordSharing({ artifactAccess: level, isHost });
      const shared = isRecordShared(level);
      const saysShared = /Published|Shared by host/.test(view.badge);
      assert.equal(saysShared, shared, `badge disagreed for ${String(level)} / host=${isHost}`);
      if (view.tone === "withheld" || view.tone === "draft") {
        assert.equal(shared, false, "a withheld/draft tone over a shared record");
      }
    }
  }
});

test("only a host is offered a sharing control", () => {
  for (const level of [ARTIFACT_ACCESS.hostOnly, ARTIFACT_ACCESS.allParticipants]) {
    assert.equal(describeRecordSharing({ artifactAccess: level, isHost: false }).action, null);
    assert.notEqual(describeRecordSharing({ artifactAccess: level, isHost: true }).action, null);
  }
});
