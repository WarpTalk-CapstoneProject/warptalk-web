import assert from "node:assert/strict";
import test from "node:test";

import {
  appendParagraph,
  joinTranscriptText,
  splitIntoSentences,
  startsNewParagraph,
} from "../sentence-flow.ts";

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

// ── the pause the speaker actually made ─────────────────────────────────────────

test("the 6s cap cutting mid-word is never a paragraph break", () => {
  // Gap ~0: the chunk_duration_ms cap ended the chunk while the speaker was still talking. This
  // is the exact case the utterance merge exists to repair, so breaking here would undo it.
  assert.equal(startsNewParagraph(6_000, 6_010), false);
});

test("a breath is not a paragraph break", () => {
  // A Vietnamese speaker draws breath mid-sentence at 300–700ms. A threshold inside that range
  // would put a line break in the middle of every sentence.
  assert.equal(startsNewParagraph(1_000, 1_300), false);
  assert.equal(startsNewParagraph(1_000, 1_700), false);
});

test("a VAD hangover alone is not a paragraph break", () => {
  // vad_silence_hangover_ms (576) and vad_short_turn_hangover_ms (864) are what CLOSE a chunk, so
  // a cross-chunk seam is at least that long by construction. Breaking there would mean one
  // paragraph per chunk — the fragmentation this whole line of work removed.
  assert.equal(startsNewParagraph(1_000, 1_576), false);
  assert.equal(startsNewParagraph(1_000, 1_864), false);
});

test("stopping for over a second is a paragraph break", () => {
  assert.equal(startsNewParagraph(1_000, 2_000), true);
  assert.equal(startsNewParagraph(1_000, 2_400), true);
});

test("an overlap is one continuous stretch of speech, never a break", () => {
  // Overlapping segments are why the merge accepts a negative gap at all.
  assert.equal(startsNewParagraph(6_000, 1_200), false);
});

test("a paragraph absorbs a continuation and dedupes its overlap", () => {
  // The two mechanisms compose: continuing a paragraph goes through the same overlap-aware join.
  assert.deepEqual(
    appendParagraph(["chúng ta sẽ"], "ta sẽ bắt đầu", false),
    ["chúng ta sẽ bắt đầu"],
  );
});

test("a real stop starts a paragraph instead of extending one", () => {
  assert.deepEqual(
    appendParagraph(["Xong phần một"], "Giờ sang phần hai", true),
    ["Xong phần một", "Giờ sang phần hai"],
  );
});

test("appending returns a new array rather than editing the old one", () => {
  // The caller replaces its grouped utterance wholesale; mutating would edit an object React may
  // already have rendered.
  const before = ["một"];
  const after = appendParagraph(before, "hai", true);
  assert.deepEqual(before, ["một"]);
  assert.deepEqual(after, ["một", "hai"]);
});

test("empty incoming text neither starts nor extends a paragraph", () => {
  assert.deepEqual(appendParagraph(["một"], "   ", true), ["một"]);
  assert.deepEqual(appendParagraph([], "   ", false), []);
});

test("Japanese sentences split without needing a space after the stop", () => {
  // Found by looking at the rendered preview, not by reading the regex: Japanese is written
  // without spaces, so a Latin-style "stop followed by whitespace" rule never fires and a whole
  // turn came back as one undivided line.
  // i18n-allow: Japanese speech is the DATA — the writing system is the thing under test.
  assert.deepEqual(
    splitIntoSentences("はじめまして、私はトゥアンです。よろしくお願いします。"),
    ["はじめまして、私はトゥアンです。", "よろしくお願いします。"],
  );
});

test("a Latin stop still needs whitespace after it, which is what keeps a decimal whole", () => {
  assert.deepEqual(splitIntoSentences("Ngân sách 3.14 tỷ"), ["Ngân sách 3.14 tỷ"]);
});
