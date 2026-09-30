import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRANSCRIPT_VIEW_MODE,
  TRANSCRIPT_VIEW_MODE_STORAGE_KEY,
  anchorSegmentIds,
  buildCleanTranscriptView,
  cleanBubbleLines,
  isCleanSentenceStale,
  isFillerOnlySegment,
  mergeCleanSentences,
  parseTranscriptViewMode,
  rawTextForSegmentIds,
  readTranscriptViewMode,
  segmentCleanText,
  transcriptBubbleLines,
  upsertCleanSentence,
  withAbsorbedSegmentIds,
  writeTranscriptViewMode,
  type CleanSentence,
} from "../clean-transcript.ts";

type Seg = {
  id: string;
  speaker: string;
  originalText: string;
  cleanText?: string | null;
  cleanFlags?: string[];
  isCorrected?: boolean;
  updatedAt?: string | null;
  startTimeMs: number;
  endTimeMs: number;
  translations?: Record<string, string>;
};

function seg(id: string, originalText: string, extra: Partial<Seg> = {}, at = 0): Seg {
  return { id, speaker: "a", originalText, startTimeMs: at, endTimeMs: at + 900, ...extra };
}

function sentence(id: string, segmentIds: string[], cleanText: string, extra: Partial<CleanSentence> = {}): CleanSentence {
  return { id, segmentIds, cleanText, flags: [], revision: 1, ...extra };
}

const idOf = (segment: Seg) => segment.id;

// ── view mode persistence ───────────────────────────────────────────────────────────────────

class MemoryStorage {
  entries = new Map<string, string>();
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
}

test("the view mode defaults to clean and survives a round trip through storage", () => {
  const storage = new MemoryStorage();
  assert.equal(DEFAULT_TRANSCRIPT_VIEW_MODE, "clean");
  assert.equal(readTranscriptViewMode(storage), "clean");

  writeTranscriptViewMode("verbatim", storage);
  assert.equal(storage.entries.get(TRANSCRIPT_VIEW_MODE_STORAGE_KEY), "verbatim");
  assert.equal(readTranscriptViewMode(storage), "verbatim");

  writeTranscriptViewMode("clean", storage);
  assert.equal(readTranscriptViewMode(storage), "clean");
});

test("an unknown stored value, no storage, or a throwing storage all read as clean", () => {
  assert.equal(parseTranscriptViewMode("Verbatim"), "clean");
  assert.equal(parseTranscriptViewMode(null), "clean");
  assert.equal(readTranscriptViewMode(null), "clean");
  const throwing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readTranscriptViewMode(throwing), "clean");
  assert.doesNotThrow(() => writeTranscriptViewMode("verbatim", throwing));
});

// ── revision upsert ─────────────────────────────────────────────────────────────────────────

test("a higher revision replaces, a lower one is ignored, and a new id is appended", () => {
  const first = sentence("s1", ["a"], "One.", { revision: 1 });
  let list = upsertCleanSentence([], first);
  list = upsertCleanSentence(list, sentence("s1", ["a"], "One!", { revision: 3 }));
  assert.equal(list.length, 1);
  assert.equal(list[0].cleanText, "One!");

  const unchanged = upsertCleanSentence(list, sentence("s1", ["a"], "stale", { revision: 2 }));
  assert.equal(unchanged, list, "an older revision must return the same array");

  list = upsertCleanSentence(list, sentence("s2", ["b"], "Two."));
  assert.deepEqual(list.map((item) => item.id), ["s1", "s2"]);
});

test("a realtime redelivery keeps the updatedAt the REST copy carried", () => {
  const saved = sentence("s1", ["a"], "One.", { revision: 2, updatedAt: "2026-09-18T10:00:00Z" });
  const live = sentence("s1", ["a"], "One.", { revision: 2 });
  const [merged] = mergeCleanSentences([saved], [live]);
  assert.equal(merged.updatedAt, "2026-09-18T10:00:00Z");
});

// ── per-segment cleaning ────────────────────────────────────────────────────────────────────

test("cleanText null falls back to the original; empty string is filler-only", () => {
  assert.equal(segmentCleanText({ originalText: "um hello", cleanText: null }), "um hello");
  assert.equal(segmentCleanText({ originalText: "um hello" }), "um hello");
  assert.equal(segmentCleanText({ originalText: "um hello", cleanText: "Hello." }), "Hello.");
  assert.equal(isFillerOnlySegment({ cleanText: "" }), true);
  assert.equal(isFillerOnlySegment({ cleanText: null }), false);
  assert.equal(isFillerOnlySegment({}), false);
});

test("filler-only segments are hidden in the clean view and parked on a neighbour for anchors", () => {
  const segments = [
    seg("f0", "ờ", { cleanText: "", cleanFlags: ["filler_only"] }, 0),
    seg("a", "ừm chúng ta bắt đầu", { cleanText: "Chúng ta bắt đầu." }, 1000),
    seg("f1", "um", { cleanText: "" }, 2000),
    seg("b", "old line"),
  ];
  const view = buildCleanTranscriptView(segments, [], { idOf });
  assert.deepEqual(view.segments.map((item) => item.id), ["a", "b"]);
  assert.equal(view.segments[0].originalText, "Chúng ta bắt đầu.");
  assert.equal(view.segments[1].originalText, "old line", "an uncleaned line reads as it was said");
  assert.deepEqual(view.hiddenByAnchor.get("a"), ["f0", "f1"]);
  assert.deepEqual(anchorSegmentIds({ mergedSegmentIds: ["a"] }, "a", view), ["a", "f0", "f1"]);
});

// ── sentences replace the segments they cover ───────────────────────────────────────────────

test("a sentence is drawn once, at its first segment, spanning every covered segment", () => {
  const segments = [
    seg("a", "họp thứ hai", { cleanText: "Họp thứ hai" }, 0),
    seg("b", "à không", { cleanText: "" }, 1000),
    seg("c", "thứ ba", { cleanText: "thứ ba." }, 2000),
    seg("d", "ok", { cleanText: "OK." }, 5000),
  ];
  const view = buildCleanTranscriptView(
    segments,
    [sentence("s1", ["a", "b", "c"], "Họp thứ ba.", { flags: ["self_repair"] })],
    { idOf },
  );

  assert.deepEqual(view.segments.map((item) => item.id), ["a", "d"]);
  assert.equal(view.segments[0].originalText, "Họp thứ ba.");
  assert.equal(view.segments[0].startTimeMs, 0);
  assert.equal(view.segments[0].endTimeMs, 2900);
  assert.deepEqual(view.absorbedByHead.get("a"), ["b", "c"]);

  const line = view.sentenceByHead.get("a")!;
  assert.equal(line.selfRepair, true);
  assert.equal(line.rawText, "họp thứ hai à không thứ ba");
  assert.deepEqual(line.segmentIds, ["a", "b", "c"]);
});

test("segment order, not the order ids were listed in, decides the anchor", () => {
  const segments = [seg("a", "one", {}, 0), seg("b", "two", {}, 1000)];
  const view = buildCleanTranscriptView(segments, [sentence("s", ["b", "a"], "One two.")], { idOf });
  assert.deepEqual(view.segments.map((item) => item.id), ["a"]);
  assert.deepEqual(view.absorbedByHead.get("a"), ["b"]);
});

test("absorbed segments are folded in through the caller's absorb, so live translations survive", () => {
  const segments = [
    seg("a", "one", { translations: { vi: "một" } }, 0),
    seg("b", "two", { translations: { vi: "hai" } }, 1000),
  ];
  const view = buildCleanTranscriptView(segments, [sentence("s", ["a", "b"], "One, two.")], {
    idOf,
    absorb: (head, absorbed) => ({
      ...head,
      translations: { vi: `${head.translations?.vi} ${absorbed.translations?.vi}` },
    }),
  });
  assert.equal(view.segments[0].translations?.vi, "một hai");
});

test("mergedSegmentIds get the absorbed ids back, after their head", () => {
  const view = buildCleanTranscriptView(
    [seg("a", "x", {}, 0), seg("b", "y", {}, 500), seg("c", "z", {}, 1000)],
    [sentence("s", ["a", "b"], "X y.")],
    { idOf },
  );
  const rows = withAbsorbedSegmentIds([{ id: "a", mergedSegmentIds: ["a", "c"] }], view);
  assert.deepEqual(rows[0].mergedSegmentIds, ["a", "b", "c"]);
});

test("a sentence that cleaned to nothing hides every segment it covers", () => {
  const view = buildCleanTranscriptView(
    [seg("a", "keep"), seg("b", "um"), seg("c", "uh")],
    [sentence("s", ["b", "c"], "")],
    { idOf },
  );
  assert.deepEqual(view.segments.map((item) => item.id), ["a"]);
  assert.deepEqual(view.hiddenByAnchor.get("a"), ["b", "c"]);
});

test("two sentences claiming one segment: the first in conversation order wins", () => {
  const view = buildCleanTranscriptView(
    [seg("a", "x", {}, 0), seg("b", "y", {}, 500)],
    [sentence("s1", ["a", "b"], "First."), sentence("s2", ["b"], "Second.")],
    { idOf },
  );
  assert.equal(view.segments.length, 1);
  assert.equal(view.segments[0].originalText, "First.");
});

// ── staleness ───────────────────────────────────────────────────────────────────────────────

test("a corrected segment makes its sentence stale, and the segments render on their own", () => {
  const segments = [
    seg("a", "họp thứ hai", { cleanText: "Họp thứ hai" }, 0),
    seg("b", "thứ tư", { cleanText: null, isCorrected: true }, 1000),
  ];
  const view = buildCleanTranscriptView(segments, [sentence("s", ["a", "b"], "Họp thứ ba.")], { idOf });
  assert.deepEqual(view.segments.map((item) => item.originalText), ["Họp thứ hai", "thứ tư"]);
  assert.equal(view.sentenceByHead.size, 0);
});

test("a segment changed after the sentence was written makes it stale; one changed before does not", () => {
  const byId = new Map([
    ["a", { updatedAt: "2026-09-18T10:05:00Z" }],
    ["b", { updatedAt: "2026-09-18T09:00:00Z" }],
  ]);
  assert.equal(isCleanSentenceStale({ segmentIds: ["a"], updatedAt: "2026-09-18T10:00:00Z" }, byId), true);
  assert.equal(isCleanSentenceStale({ segmentIds: ["b"], updatedAt: "2026-09-18T10:00:00Z" }, byId), false);
  // No time on the sentence (the realtime event): nothing to compare, so not stale on that ground.
  assert.equal(isCleanSentenceStale({ segmentIds: ["a"] }, byId), false);
});

test("a sentence covering a segment that is not present falls back", () => {
  assert.equal(isCleanSentenceStale({ segmentIds: ["a", "missing"] }, new Map([["a", {}]])), true);
  assert.equal(isCleanSentenceStale({ segmentIds: [] }, new Map()), true);
  const view = buildCleanTranscriptView([seg("a", "one")], [sentence("s", ["a", "later"], "One two.")], { idOf });
  assert.equal(view.segments[0].originalText, "one");
});

// ── lines inside a bubble ───────────────────────────────────────────────────────────────────

test("a clean bubble puts each sentence on its own line and lays loose segments out verbatim-style", () => {
  const segments = [
    seg("a", "hello", { cleanText: "Hello." }, 0),
    seg("b", "how are you", { cleanText: "How are you?" }, 500),
    seg("c", "i am um fine", { cleanText: "I am fine." }, 1000),
    seg("d", "thanks", { cleanText: "Thanks. Bye." }, 5000),
  ];
  const view = buildCleanTranscriptView(segments, [sentence("s", ["c"], "I'm fine, thanks for asking.")], { idOf });
  const lines = cleanBubbleLines({ mergedSegmentIds: ["a", "b", "c", "d"] }, view);
  assert.deepEqual(
    lines.map((line) => [line.text, Boolean(line.sentence)]),
    [
      ["Hello.", false],
      ["How are you?", false],
      ["I'm fine, thanks for asking.", true],
      ["Thanks.", false],
      ["Bye.", false],
    ],
  );
  assert.equal(new Set(lines.map((line) => line.key)).size, lines.length, "keys are unique");
});

test("a Japanese question keeps its full-width question mark as a line end", () => {
  const view = buildCleanTranscriptView(
    [seg("a", "えーと 大丈夫 ですか", { cleanText: "大丈夫ですか？" }), seg("b", "はい", { cleanText: "はい。" }, 200)],
    [],
    { idOf },
  );
  const lines = cleanBubbleLines({ mergedSegmentIds: ["a", "b"] }, view);
  assert.deepEqual(lines.map((line) => line.text), ["大丈夫ですか？", "はい。"]);
});

test("a null view is verbatim: the existing paragraph-then-punctuation split", () => {
  const lines = transcriptBubbleLines(
    { mergedSegmentIds: ["a"], paragraphs: ["One. Two", "Three"], originalText: "One. Two Three" },
    null,
    "a",
  );
  assert.deepEqual(lines.map((line) => line.text), ["One.", "Two", "Three"]);
});

test("the correction editor is seeded with the raw words of every segment a line stands for", () => {
  const rows = new Map([
    ["a", { originalText: "ừm họp thứ hai" }],
    ["b", { originalText: "à không thứ ba" }],
  ]);
  assert.equal(rawTextForSegmentIds(["a", "b", "gone"], rows), "ừm họp thứ hai à không thứ ba");
});
