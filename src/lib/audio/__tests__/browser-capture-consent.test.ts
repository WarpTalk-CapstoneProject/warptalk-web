/**
 * The bug this guards against is a capture that starts before anyone answered.
 *
 * "Not declined" and "granted" read the same in a hurry, and the difference between them is the
 * whole control: on the render where the answer has not arrived yet, one of them starts listening
 * to somebody's browser.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BRIDGE_RECORD_CHOICE,
  LISTEN_SCOPE_COPY,
  browserCaptureAnswerKey,
  browserCaptureAnswerStorage,
  browserCaptureConsentState,
  mayCaptureBrowser,
  readStoredBrowserCaptureAnswer,
  shouldForgetBrowserCaptureAnswer,
  writeStoredBrowserCaptureAnswer,
  type BrowserCaptureConsentInput,
} from "../browser-capture-consent.ts";

function loopbackHost(overrides: Partial<BrowserCaptureConsentInput> = {}): BrowserCaptureConsentInput {
  return {
    isBridgeRoom: true,
    isHost: true,
    meetingOpen: true,
    hasInboundDevice: false,
    loopbackAvailable: true,
    answer: null,
    ...overrides,
  };
}

test("the loopback path asks, and may not capture until it is answered", () => {
  const state = browserCaptureConsentState(loopbackHost());

  assert.equal(state, "required");
  // The whole point: unanswered is not permission. A `!== "declined"` check would pass here.
  assert.equal(mayCaptureBrowser(state), false);
});

test("a device endpoint never asks", () => {
  // The second virtual device carries the far side and nothing else, so there is nothing to warn
  // about. A prompt here would be noise, and noise is how people learn to dismiss prompts.
  const state = browserCaptureConsentState(loopbackHost({ hasInboundDevice: true }));

  assert.equal(state, "not-required");
  assert.equal(mayCaptureBrowser(state), false);
});

test("granting allows the capture, declining does not", () => {
  assert.equal(mayCaptureBrowser(browserCaptureConsentState(loopbackHost({ answer: true }))), true);
  assert.equal(mayCaptureBrowser(browserCaptureConsentState(loopbackHost({ answer: false }))), false);
  assert.equal(browserCaptureConsentState(loopbackHost({ answer: false })), "declined");
});

test("nothing is asked for a meeting that is not open", () => {
  // A meeting that has ended or been paused is not listening to anybody, so a dialog would
  // arrive with no explanation for why it appeared.
  assert.equal(
    browserCaptureConsentState(loopbackHost({ meetingOpen: false })),
    "not-required",
  );
});

test("WT-828: the ask does not wait for Start Translation", () => {
  // The transcript is saved whenever people speak. The far side of a bridged call speaks from
  // the moment the host joins, and waiting for translation to start kept all of that out of the
  // record. The input no longer knows anything about translation at all.
  assert.equal(browserCaptureConsentState(loopbackHost({ meetingOpen: true })), "required");
});

test("only the host is asked, and only in a bridge room", () => {
  // The stand-in token is host-only, so a participant would be prompted for a capture that could
  // never start. And an ordinary WarpTalk meeting listens to nobody's browser at all.
  assert.equal(browserCaptureConsentState(loopbackHost({ isHost: false })), "not-required");
  assert.equal(browserCaptureConsentState(loopbackHost({ isBridgeRoom: false })), "not-required");
});

test("no loopback path means no ask", () => {
  assert.equal(
    browserCaptureConsentState(loopbackHost({ loopbackAvailable: false })),
    "not-required",
  );
});

// WT-900 — the answer survives a reload of the same room, and nothing else.

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

test("an answer is stored per room and read back after a reload", () => {
  const storage = memoryStorage();
  writeStoredBrowserCaptureAnswer(storage, "room-a", true);
  writeStoredBrowserCaptureAnswer(storage, "room-b", false);
  assert.equal(storage.data.get("warptalk:bridge-capture-answer:room-a"), "granted");
  assert.equal(readStoredBrowserCaptureAnswer(storage, "room-a"), true);
  assert.equal(readStoredBrowserCaptureAnswer(storage, "room-b"), false);
  // Another meeting is another set of open tabs: never inherits an answer.
  assert.equal(readStoredBrowserCaptureAnswer(storage, "room-c"), null);
});

test("asking again forgets the stored answer", () => {
  const storage = memoryStorage();
  writeStoredBrowserCaptureAnswer(storage, "room-a", false);
  writeStoredBrowserCaptureAnswer(storage, "room-a", null);
  assert.equal(readStoredBrowserCaptureAnswer(storage, "room-a"), null);
  assert.equal(storage.data.size, 0);
});

test("anything but a value this code wrote reads as unanswered", () => {
  const storage = memoryStorage({ [browserCaptureAnswerKey("room-a")]: "true" });
  assert.equal(readStoredBrowserCaptureAnswer(storage, "room-a"), null);
});

test("missing or throwing storage never throws, and reads as unanswered", () => {
  assert.equal(readStoredBrowserCaptureAnswer(null, "room-a"), null);
  writeStoredBrowserCaptureAnswer(null, "room-a", true);
  const throwing = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
  assert.equal(readStoredBrowserCaptureAnswer(throwing, "room-a"), null);
  assert.doesNotThrow(() => writeStoredBrowserCaptureAnswer(throwing, "room-a", true));
  assert.doesNotThrow(() => writeStoredBrowserCaptureAnswer(throwing, "room-a", null));
  // No window outside a browser.
  assert.equal(browserCaptureAnswerStorage(), null);
});

test("the stored answer is dropped when the meeting is over, not when it is paused", () => {
  for (const status of ["ended", "ENDED", "cancelled", "expired", "failed", "timeout"]) {
    assert.equal(shouldForgetBrowserCaptureAnswer(status), true, status);
  }
  for (const status of ["live", "paused", "waiting", "", null, undefined]) {
    assert.equal(shouldForgetBrowserCaptureAnswer(status), false, String(status));
  }
});

// WT-910. "Stop listening" was read as "stop WarpTalk": the words beside it named what was allowed
// and never what the press would stop, or what it would leave running.
test("the stop wording names the other side as the scope, and says the user's own speech is untouched", () => {
  for (const sentence of [
    LISTEN_SCOPE_COPY.stopEffect,
    LISTEN_SCOPE_COPY.stopEffectWithCable,
    LISTEN_SCOPE_COPY.declined,
    LISTEN_SCOPE_COPY.declinedWithCable,
  ]) {
    assert.match(sentence, /other side/i, sentence);
    assert.match(sentence, /your own speech/i, sentence);
    assert.match(sentence, /not affected/i, sentence);
    // It is not Stop Translation, and must not be worded as if translation as a whole stopped.
    assert.doesNotMatch(sentence, /translation (is |has )?stopped|stops translation/i, sentence);
  }
});

test("without a cable the effect is spelled out; with one the far side is said to be still heard", () => {
  for (const sentence of [LISTEN_SCOPE_COPY.stopEffect, LISTEN_SCOPE_COPY.declined]) {
    assert.match(sentence, /transcribed, translated or captioned/);
  }
  for (const sentence of [LISTEN_SCOPE_COPY.stopEffectWithCable, LISTEN_SCOPE_COPY.declinedWithCable]) {
    assert.match(sentence, /still heard/);
    assert.doesNotMatch(sentence, /no longer|is not transcribed/);
  }
});

test("the recording line says Stop listening does not stop it, and where to stop it", () => {
  assert.match(LISTEN_SCOPE_COPY.recordingUnaffected, /not stopped/);
  assert.match(LISTEN_SCOPE_COPY.recordingUnaffected, /REC/);
});

test("the recording checkbox says when it starts and that it can be stopped", () => {
  assert.equal(BRIDGE_RECORD_CHOICE.label, "Record this meeting");
  assert.match(BRIDGE_RECORD_CHOICE.hint, /starts when/);
  assert.match(BRIDGE_RECORD_CHOICE.hint, /stopped/);
});
