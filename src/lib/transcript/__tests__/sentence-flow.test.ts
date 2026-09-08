import assert from "node:assert/strict";
import test from "node:test";

import { joinTranscriptText, splitIntoSentences } from "../sentence-flow.ts";

// ── joining two halves of one utterance ─────────────────────────────────────────

test("a partial overlap is said once, not twice", () => {
  // The defect. The old rule caught only a TOTAL overlap, so a shared middle doubled itself.
  // i18n-allow: Vietnamese speech is the DATA this splitter exists for — the overlap it has to
  // survive is a Vietnamese one, and English lorem would not exercise it.
  assert.equal(
    joinTranscriptText("chúng ta sẽ", "ta sẽ bắt đầu"),
    "chúng ta sẽ bắt đầu",
  );
});

test("the longest overlap wins, not the first one found", () => {
  // Taking only "ta" here would leave "sẽ" duplicated.
  assert.equal(joinTranscriptText("hôm nay ta sẽ", "ta sẽ họp"), "hôm nay ta sẽ họp");
});

test("an overlap is matched whatever case each chunk arrived in", () => {
  // Each chunk is transcribed as if it were its own utterance, so the same syllable is
  // capitalised at the start of one and lower-case mid-sentence in the next.
  assert.equal(joinTranscriptText("bắt đầu Thôi", "thôi nào"), "bắt đầu Thôi nào");
});

test("a shared syllable inside two different words is not an overlap", () => {
  // Character-level matching finds "ta" inside "tama" and glues two real words into one that does
  // not exist. Words are the only unit an overlap can be trusted at.
  assert.equal(joinTranscriptText("chúng ta", "tama là gì"), "chúng ta tama là gì");
});

test("no overlap joins with a single space", () => {
  assert.equal(joinTranscriptText("xin chào", "mọi người"), "xin chào mọi người");
});

test("the total-overlap cases still behave as they did", () => {
  assert.equal(joinTranscriptText("xin chào", "xin chào"), "xin chào");
  assert.equal(joinTranscriptText("xin chào mọi người", "mọi người"), "xin chào mọi người");
  assert.equal(joinTranscriptText("xin", "xin chào"), "xin chào");
});

test("an empty half is not a reason to add whitespace", () => {
  assert.equal(joinTranscriptText("", "xin chào"), "xin chào");
  assert.equal(joinTranscriptText("xin chào", ""), "xin chào");
  assert.equal(joinTranscriptText(undefined, undefined), "");
});

test("a right half entirely repeated leaves no trailing space", () => {
  const joined = joinTranscriptText("một hai ba", "hai ba");
  assert.equal(joined, "một hai ba");
  assert.equal(joined, joined.trim());
});

// ── laying a turn out as its sentences ──────────────────────────────────────────

test("a turn with terminal punctuation reads as its sentences", () => {
  assert.deepEqual(
    splitIntoSentences("Chào mọi người. Hôm nay mình review sprint! Ai có ý kiến gì không?"),
    ["Chào mọi người.", "Hôm nay mình review sprint!", "Ai có ý kiến gì không?"],
  );
});

test("a turn with NO terminal punctuation stays one sentence", () => {
  // Production carries lines exactly like this. Guessing a sentence end from length or from a
  // comma would cut mid-clause and read as corruption rather than as prose.
  const line = "Chứm đúng rồi chính là bắt đầu tiếp thôi mà siêu lá luôn";
  assert.deepEqual(splitIntoSentences(line), [line]);
});

test("a decimal is not a sentence boundary", () => {
  assert.deepEqual(splitIntoSentences("Ngân sách là 3.14 tỷ đồng."), ["Ngân sách là 3.14 tỷ đồng."]);
  // Vietnamese writes the decimal separator as a comma, which the comma path must also survive.
  assert.deepEqual(splitIntoSentences("Tăng 3,14 phần trăm."), ["Tăng 3,14 phần trăm."]);
});

test("a title's full stop does not end the sentence", () => {
  assert.deepEqual(
    splitIntoSentences("TS. Vân sẽ trình bày phần này."),
    ["TS. Vân sẽ trình bày phần này."],
  );
});

test("an initial does not end the sentence", () => {
  assert.deepEqual(splitIntoSentences("A. Nguyễn phụ trách."), ["A. Nguyễn phụ trách."]);
});

test("an ellipsis is one boundary, not three", () => {
  assert.deepEqual(splitIntoSentences("Ừ thì... Chưa chắc."), ["Ừ thì...", "Chưa chắc."]);
});

test("a turn cut off mid-sentence keeps its tail", () => {
  // The 6s chunk cap ends turns mid-word all the time; the remainder is still what was said.
  assert.deepEqual(
    splitIntoSentences("Xong phần một. Giờ sang phần"),
    ["Xong phần một.", "Giờ sang phần"],
  );
});

test("empty input is no sentences rather than one empty one", () => {
  assert.deepEqual(splitIntoSentences(""), []);
  assert.deepEqual(splitIntoSentences("   "), []);
});
