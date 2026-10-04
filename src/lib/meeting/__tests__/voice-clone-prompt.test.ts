import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OWN_VOICE_PICK_TIMEOUT_MS,
  judgeOwnVoicePick,
  planOwnVoicePick,
  shouldPromptVoiceClone,
  voiceClonePromptDismissKey,
} from "../voice-clone-prompt.ts";

test("the popup asks before turning My voice on without the account consent", () => {
  assert.equal(planOwnVoicePick({ enabling: true, accountConsent: false }), "ask");
});

test("the popup sends the pick when the consent is given, or not known yet", () => {
  assert.equal(planOwnVoicePick({ enabling: true, accountConsent: true }), "send");
  assert.equal(planOwnVoicePick({ enabling: true, accountConsent: undefined }), "send");
});

test("turning My voice off never asks", () => {
  assert.equal(planOwnVoicePick({ enabling: false, accountConsent: false }), "send");
});

test("a pick the main window took back is a failure", () => {
  assert.equal(
    judgeOwnVoicePick({ requestedAtMs: 0, nowMs: 800, sawEnabled: true, enabled: false }),
    "failed",
  );
});

test("a pick the main window never reported is lost after the timeout, not before", () => {
  const base = { requestedAtMs: 0, sawEnabled: false, enabled: false };
  assert.equal(judgeOwnVoicePick({ ...base, nowMs: OWN_VOICE_PICK_TIMEOUT_MS - 1 }), "pending");
  assert.equal(judgeOwnVoicePick({ ...base, nowMs: OWN_VOICE_PICK_TIMEOUT_MS }), "failed");
});

test("a pick still on after the timeout took", () => {
  const base = { requestedAtMs: 0, sawEnabled: true, enabled: true };
  assert.equal(judgeOwnVoicePick({ ...base, nowMs: 500 }), "pending");
  assert.equal(judgeOwnVoicePick({ ...base, nowMs: OWN_VOICE_PICK_TIMEOUT_MS }), "on");
});

test("asks when the pipeline says this speaker is not opted in", () => {
  assert.equal(
    shouldPromptVoiceClone({ cloneReason: "not_opted_in", dubVoiceId: null, dismissed: false }),
    true,
  );
});

test("does not ask once they said not now in this meeting", () => {
  assert.equal(
    shouldPromptVoiceClone({ cloneReason: "not_opted_in", dubVoiceId: null, dismissed: true }),
    false,
  );
});

test("does not ask someone dubbed in a voice they picked", () => {
  assert.equal(
    shouldPromptVoiceClone({ cloneReason: "not_opted_in", dubVoiceId: "voice-1", dismissed: false }),
    false,
  );
});

test("says nothing for any other state", () => {
  for (const reason of [null, undefined, "no_routes", "routes_unknown", "capturing", "cloned", "carried_over"]) {
    assert.equal(
      shouldPromptVoiceClone({ cloneReason: reason, dubVoiceId: null, dismissed: false }),
      false,
      String(reason),
    );
  }
});

test("dismissal is per meeting", () => {
  assert.notEqual(voiceClonePromptDismissKey("a"), voiceClonePromptDismissKey("b"));
});
