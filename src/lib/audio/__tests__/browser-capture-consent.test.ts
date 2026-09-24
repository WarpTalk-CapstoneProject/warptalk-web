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
  browserCaptureConsentState,
  mayCaptureBrowser,
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
