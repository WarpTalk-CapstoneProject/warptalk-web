import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldPromptVoiceClone, voiceClonePromptDismissKey } from "../voice-clone-prompt.ts";

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
