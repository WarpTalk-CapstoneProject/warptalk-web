import assert from "node:assert/strict";
import test from "node:test";

import { planLineCorrection, type CorrectableSegment } from "../merged-correction.ts";
import { groupSavedTranscriptSegments } from "../transcript-display.ts";

function row(id: string, originalText: string, at: number) {
  return {
    id,
    speakerName: "Ngọc Kỳ",
    originalText,
    originalLanguage: "vi",
    startTimeMs: at * 1000,
    endTimeMs: at * 1000 + 500,
    sequenceOrder: at,
    isCorrected: false,
  };
}

type Row = ReturnType<typeof row>;

/** Posts the plan the way the server applies it, then reads the line back through the merge. */
function saveAndReload(rows: Row[], correctedText: string) {
  const [line] = groupSavedTranscriptSegments(rows as never);
  const parts = line.mergedSegmentIds.map((id) => rows.find((r) => r.id === id) as CorrectableSegment);
  const plan = planLineCorrection(parts, correctedText);
  assert.ok(plan, "the edit should be savable");
  const byId = new Map(plan.map((p) => [p.segmentId, p.correctedText]));
  const saved = rows.map((r) => (byId.has(r.id) ? { ...r, originalText: byId.get(r.id)! } : r));
  const reloaded = groupSavedTranscriptSegments(saved as never);
  return { line, plan, reloaded };
}

const PRODUCTION_LINE = [
  row("a", "Đây là lúc khoảng 85% các câu hỏi thường gặp.", 1),
  row("b", "Tuy nhiên với câu hỏi quá dài hoặc dùng từ Lắm, lúc đôi khi hiểu sai hoặc trả lời không liên quan.", 2),
];

test("fixing a word in the second sentence of a merged line reads back once, not twice", () => {
  const [line] = groupSavedTranscriptSegments(PRODUCTION_LINE as never);
  const { plan, reloaded } = saveAndReload(PRODUCTION_LINE, line.originalText.replace("Lắm", "LLM"));

  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].originalText, line.originalText.replace("Lắm", "LLM"));
  // Only the row that held the word is revised — the first row's translations are still right.
  assert.deepEqual(plan.map((p) => p.segmentId), ["b"]);
});

test("the plan carries each row's own text as the original, not the merged line's", () => {
  const [line] = groupSavedTranscriptSegments(PRODUCTION_LINE as never);
  const { plan } = saveAndReload(PRODUCTION_LINE, `${line.originalText} Cảm ơn.`);
  assert.deepEqual(plan, [
    {
      segmentId: "b",
      originalText: PRODUCTION_LINE[1].originalText,
      correctedText: `${PRODUCTION_LINE[1].originalText} Cảm ơn.`,
    },
  ]);
});

test("an unchanged merged line posts nothing", () => {
  const [line] = groupSavedTranscriptSegments(PRODUCTION_LINE as never);
  assert.deepEqual(planLineCorrection(PRODUCTION_LINE, `  ${line.originalText} `), []);
});

test("a row whose words were all deleted keeps one borrowed word and the line still reads right", () => {
  const rows = [row("a", "Chào ạ.", 1), row("b", "Chào lecturer Kenji,", 2), row("c", "kết quả khả quan.", 3)];
  const { plan, reloaded } = saveAndReload(rows, "Chào ạ. kết quả khả quan.");
  assert.equal(reloaded[0].originalText, "Chào ạ. kết quả khả quan.");
  assert.ok(plan.every((p) => p.correctedText.length > 0));
});

test("a row the merge was hiding as an overlap is rewritten too, so it cannot reappear", () => {
  const rows = [row("a", "chúng ta sẽ bắt đầu", 1), row("b", "ta sẽ bắt đầu", 2)];
  const { line, reloaded } = saveAndReload(rows, "chúng ta sẽ bắt đầu nhé");
  assert.equal(line.originalText, "chúng ta sẽ bắt đầu");
  assert.equal(reloaded[0].originalText, "chúng ta sẽ bắt đầu nhé");
});

test("a single-row line posts the text exactly as typed", () => {
  assert.deepEqual(planLineCorrection([{ id: "a", originalText: "Ừ" }], "Ừ, đúng rồi"), [
    { segmentId: "a", originalText: "Ừ", correctedText: "Ừ, đúng rồi" },
  ]);
});

test("an edit shorter than the rows it spans cannot be saved without a delete", () => {
  assert.equal(planLineCorrection(PRODUCTION_LINE, "Xoá"), null);
});
