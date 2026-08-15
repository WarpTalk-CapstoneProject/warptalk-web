import assert from "node:assert/strict";
import test from "node:test";

import {
  applySingleLanguageChoice,
  describeLanguageChoice,
  isSingleLanguageChoice,
} from "../language-choice.ts";

/**
 * One language per person.
 *
 * The meeting bar asked for "I speak" and "I hear" separately, which exposed the routing plumbing
 * instead of the one fact a participant knows about themselves. In the 15 Aug test the team tried
 * every combination looking for voice clone, concluded it was broken, and were reading a healthy
 * pipeline the whole time — the pairs they built simply had no routes.
 */

test("picking one language moves both sides", () => {
  // The whole behavioural change. The mesh reads speak and hear independently, so a pick that
  // wrote only one column would recreate the split-brain state this removes.
  assert.deepEqual(applySingleLanguageChoice("vi"), { speak: "vi", hear: "vi" });
});

test("a pick is normalized before it is applied", () => {
  // The gateway normalizes with Split('-')[0].ToLowerInvariant(); an unnormalized value would
  // never compare equal to the mesh's copy.
  assert.deepEqual(applySingleLanguageChoice("en-US"), { speak: "en", hear: "en" });
});

test("a matched pair reads as one choice", () => {
  assert.equal(isSingleLanguageChoice("vi", "vi"), true);
  assert.equal(isSingleLanguageChoice("vi", "VI"), true);
  assert.equal(isSingleLanguageChoice("en-GB", "en-US"), true);
});

test("a deliberate split is not flattened", () => {
  // The negative control. Somebody who speaks Vietnamese and follows English better asked for
  // this, and the backend supports it — collapsing it would delete a working capability.
  assert.equal(isSingleLanguageChoice("vi", "en"), false);
});

test("a half-resolved choice is not shown as a split", () => {
  // The participants query can still be in flight during the first seconds of a join. Showing the
  // two-column form because one side has not landed yet is how the old bar taught people that
  // this was a two-part decision.
  assert.equal(isSingleLanguageChoice("vi", null), true);
  assert.equal(isSingleLanguageChoice(null, "vi"), true);
  assert.equal(isSingleLanguageChoice(null, null), true);
});

test("the label collapses to one language when the pair match", () => {
  assert.deepEqual(describeLanguageChoice("vi", "vi"), { mode: "single", speak: "vi", hear: "vi" });
});

test("the label keeps the arrow when the user asked for a split", () => {
  // Hiding a divergence the user chose would make the control lie about the state it is in.
  assert.deepEqual(describeLanguageChoice("vi", "en"), { mode: "split", speak: "vi", hear: "en" });
});

test("whichever side resolved first stands in for both", () => {
  assert.deepEqual(describeLanguageChoice("vi", null), { mode: "single", speak: "vi", hear: "vi" });
  assert.deepEqual(describeLanguageChoice(null, "en"), { mode: "single", speak: "en", hear: "en" });
});

test("nothing chosen is its own state, not a language", () => {
  assert.equal(describeLanguageChoice(null, null).mode, "unset");
  assert.equal(describeLanguageChoice("", "").mode, "unset");
});
