import assert from "node:assert/strict";
import test from "node:test";

import { planVoicePanel, type VoicePanelInput } from "../voice-panel.ts";

/**
 * One Voice panel, rendered by the meeting control bar and by the bridge popup.
 *
 * The meeting half of these tests pins the control bar to what it has always shown: the panel was
 * moved out of the bar so a second surface could reuse it, and moving it must not change it. The
 * bridge half pins the three rules that are wrong to inherit in a room whose "stand-in" is the far
 * side of a Google Meet call — see the header of voice-panel.ts.
 */

const ALL_HANDLERS = { canToggleVoice: true, canPickDubVoice: true, canConsentClone: true };

function plan(overrides: Partial<VoicePanelInput>) {
  return planVoicePanel({ mode: "meeting", ...ALL_HANDLERS, ...overrides });
}

test("meeting, voice on: the switch, then Your voice, then Stand-in voice with its caveat", () => {
  const result = plan({ voiceEnabled: true });

  assert.equal(result.voiceSwitch?.label, "Voice");
  assert.equal(result.voiceSwitch?.detail, "On — translations are spoken to you.");
  assert.equal(result.voiceSwitch?.ariaLabel, "Hear translated voice");
  assert.deepEqual(result.yourVoice, { heading: "Your voice", note: null });
  assert.deepEqual(result.listenVoice, {
    heading: {
      title: "Stand-in voice",
      note: "Only applies to people who have not chosen a voice of their own.",
    },
    automaticDetail: "Assigned, not matched to your voice",
    pickWithdrawsConsent: true,
  });
  assert.equal(result.dividerAfterSwitch, true);
  assert.equal(result.summaryReadsVoiceEnabled, true);
});

test("meeting, voice off: only the switch, exactly as the control bar has always rendered it", () => {
  const result = plan({ voiceEnabled: false });

  assert.equal(result.voiceSwitch?.detail, "Off — you read translations instead of hearing them.");
  assert.equal(result.yourVoice, null);
  assert.equal(result.listenVoice, null);
  assert.equal(result.dividerAfterSwitch, false);
});

test("meeting: an unset voiceEnabled counts as on, as the bar's `!== false` always has", () => {
  const result = plan({ voiceEnabled: undefined });

  assert.ok(result.yourVoice);
  assert.ok(result.listenVoice);
});

test("meeting: no handler, no control", () => {
  const result = plan({
    voiceEnabled: true,
    canToggleVoice: false,
    canPickDubVoice: false,
    canConsentClone: false,
  });

  assert.equal(result.voiceSwitch, null);
  assert.equal(result.yourVoice, null);
  // The listen list is still offered, without the heading that only ever sat under Your voice.
  assert.equal(result.listenVoice?.heading, null);
});

test("bridge: never a Voice switch — hearing them is the dock's button", () => {
  for (const voiceEnabled of [true, false, undefined]) {
    assert.equal(plan({ mode: "bridge", voiceEnabled }).voiceSwitch, null);
  }
});

test("bridge: Your voice is shown whatever voiceEnabled says, because it is what Meet hears", () => {
  for (const voiceEnabled of [true, false, undefined]) {
    assert.deepEqual(plan({ mode: "bridge", voiceEnabled }).yourVoice, {
      heading: "Your voice",
      note: "What they hear in Meet.",
    });
  }
});

test("bridge: Their voice only while hearing their translation", () => {
  assert.deepEqual(plan({ mode: "bridge", voiceEnabled: true }).listenVoice, {
    heading: { title: "Their voice", note: "The voice you hear them in." },
    automaticDetail: "Assigned, not matched to their voice",
    pickWithdrawsConsent: false,
  });
  // Text only is the dock's default, so an unset value must not show voices that change nothing.
  assert.equal(plan({ mode: "bridge", voiceEnabled: false }).listenVoice, null);
  assert.equal(plan({ mode: "bridge", voiceEnabled: undefined }).listenVoice, null);
});

test("bridge: no label says stand-in — there it is the far side's seat, not a voice", () => {
  const result = plan({ mode: "bridge", voiceEnabled: true });
  const text = JSON.stringify(result).toLowerCase();

  assert.doesNotMatch(text, /stand-in/);
});

test("bridge: the closing sentence describes how you sound, never transcript-only", () => {
  // There is no switch on this surface for that sentence to be reporting.
  assert.equal(plan({ mode: "bridge", voiceEnabled: false }).summaryReadsVoiceEnabled, false);
});

test("meeting keeps its rule: a listen pick withdraws clone consent, as it always has", () => {
  assert.equal(plan({ voiceEnabled: true }).listenVoice?.pickWithdrawsConsent, true);
});

test("bridge: choosing how you hear them never withdraws the clone Meet hears", () => {
  // This list is the far side's voice. They are never cloned (the stand-in has no consent record),
  // so a pick here can only ever replace their stock voice — and taking the host's consent away on
  // the same click would switch what Meet hears from the host's own voice to a stock one.
  assert.equal(plan({ mode: "bridge", voiceEnabled: true }).listenVoice?.pickWithdrawsConsent, false);
});

test("bridge: Your voice still needs a handler to be offered", () => {
  const result = plan({ mode: "bridge", canPickDubVoice: false, canConsentClone: false });

  assert.equal(result.yourVoice, null);
});
