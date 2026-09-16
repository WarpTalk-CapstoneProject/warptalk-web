/**
 * Linking to a moment in a meeting. WT-655.
 *
 * The failure worth guarding against here is not a crash, it is a CONFIDENT WRONG ANSWER. A `?t=`
 * that arrives mangled — broken across two lines in a chat client, or with a markdown auto-linker's
 * bracket stuck to the end — must do nothing at all. The tempting reading of an unparseable value is
 * zero, and zero is a real moment: the reader would be dropped at the top of the meeting and told,
 * by the page's own behaviour, that this is where the link pointed.
 *
 * So most of what is below is about what does NOT parse, and about the round trip: a link that is
 * opened and re-shared must still name the same second.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MOMENT_PARAM,
  formatMomentParam,
  parseMomentParam,
  withMomentParam,
} from "../moment-link.ts";

test("a whole number of seconds is a moment in meeting milliseconds", () => {
  // Seconds in the URL because a person may read or hand-edit it; milliseconds out because that is
  // what every consumer of a moment on this page already speaks.
  assert.equal(parseMomentParam("0"), 0);
  assert.equal(parseMomentParam("90"), 90_000);
  assert.equal(parseMomentParam("3600"), 3_600_000);
});

test("surrounding whitespace is not part of anybody's intent", () => {
  // A link pasted out of an email arrives with space round it more often than it arrives clean.
  assert.equal(parseMomentParam(" 90 "), 90_000);
  assert.equal(parseMomentParam("\n90"), 90_000);
});

test("a fraction is floored, not refused — it names the second that contains the moment", () => {
  // We never mint one, so it can only be hand-typed, and somebody who types 90.5 meant a moment.
  assert.equal(parseMomentParam("90.5"), 90_000);
  assert.equal(parseMomentParam("0.9"), 0);
});

test("a malformed value is nothing, and nothing is not zero", () => {
  // THE failure this module exists to prevent. Every one of these parses to 0 or to a number under
  // `Number()`, and every one of them would drop the reader at the top of the meeting as if that is
  // where the link pointed.
  assert.equal(parseMomentParam(""), null);
  assert.equal(parseMomentParam("   "), null);
  assert.equal(parseMomentParam("abc"), null);
  assert.equal(parseMomentParam("90s"), null);
  assert.equal(parseMomentParam("1:30"), null);
  assert.equal(parseMomentParam("0x10"), null);
  assert.equal(parseMomentParam("1e3"), null);
  assert.equal(parseMomentParam("+5"), null);
  // Markdown auto-linkers and chat clients both do this to a URL at the end of a sentence.
  assert.equal(parseMomentParam("90)"), null);
  assert.equal(parseMomentParam("90."), null);
});

test("a negative or non-finite value is refused", () => {
  // A moment before the meeting began is not a moment in it. Clamping to 0 would be the same lie
  // recording-seek.ts refuses to tell for a moment before the recording began.
  assert.equal(parseMomentParam("-1"), null);
  assert.equal(parseMomentParam("-0.5"), null);
  assert.equal(parseMomentParam("Infinity"), null);
  assert.equal(parseMomentParam("NaN"), null);
});

test("a value too large to survive the conversion to milliseconds is refused", () => {
  // Past this, `seconds * 1000` loses integer precision and the moment silently becomes a different
  // moment — which is worse than refusing, because it still looks like a working link.
  assert.equal(parseMomentParam("9".repeat(20)), null);
  assert.equal(parseMomentParam(String(Number.MAX_SAFE_INTEGER)), null);
});

test("an absent parameter is not a lookup", () => {
  assert.equal(parseMomentParam(null), null);
  assert.equal(parseMomentParam(undefined), null);
});

test("a moment is written as whole seconds", () => {
  assert.equal(formatMomentParam(0), "0");
  assert.equal(formatMomentParam(90_000), "90");
  // Floored, so what is read back names the same second rather than drifting a fraction each time a
  // link is opened and re-shared.
  assert.equal(formatMomentParam(90_600), "90");
});

test("there is nothing to write for a moment that is not one", () => {
  assert.equal(formatMomentParam(-1), null);
  assert.equal(formatMomentParam(Number.NaN), null);
  assert.equal(formatMomentParam(Number.POSITIVE_INFINITY), null);
});

test("a shared link, opened and re-shared, still names the same second", () => {
  // The round trip is the whole promise of the feature: the reader who arrives at a moment and then
  // copies their own address bar must hand on the moment they were looking at.
  for (const seconds of ["0", "7", "90", "3600", "86399"]) {
    const atMs = parseMomentParam(seconds);
    assert.notEqual(atMs, null);
    assert.equal(formatMomentParam(atMs as number), seconds);
  }
});

test("setting the moment leaves every other parameter alone", () => {
  // A reader's URL is not ours to tidy. Dropping what else was in the address bar would make
  // sharing a moment quietly destructive.
  assert.equal(withMomentParam("?tab=summary", 90_000), "tab=summary&t=90");
  assert.equal(withMomentParam("tab=summary", 90_000), "tab=summary&t=90");
  assert.equal(withMomentParam("", 90_000), "t=90");
});

test("setting the moment twice replaces it rather than repeating it", () => {
  // Two `t` values would be read back as the first one, so a second seek would silently re-share
  // the moment the reader had already left.
  assert.equal(withMomentParam("?t=12", 90_000), "t=90");
});

test("removing the moment leaves an empty query, not a stray parameter", () => {
  // The parameter is stripped after it has been honoured once. One that lingers re-fires on every
  // internal navigation back to this page.
  assert.equal(withMomentParam("?t=90", null), "");
  assert.equal(withMomentParam("?t=90&tab=summary", null), "tab=summary");
  assert.equal(withMomentParam("", null), "");
});

test("a moment that cannot be written is removed rather than written as garbage", () => {
  // formatMomentParam refusing and the caller asking to clear are the same outcome: no parameter.
  assert.equal(withMomentParam("?t=90", Number.NaN), "");
  assert.equal(withMomentParam("?t=90", -5), "");
});

test("the parameter's name lives in one place", () => {
  // A reader and a writer that spell it differently is a link that is written and never read.
  assert.equal(MOMENT_PARAM, "t");
  assert.equal(withMomentParam("", 1_000), `${MOMENT_PARAM}=1`);
  assert.equal(parseMomentParam(new URLSearchParams("t=1").get(MOMENT_PARAM)), 1_000);
});
