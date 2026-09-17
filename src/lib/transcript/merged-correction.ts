/**
 * Saving a correction to a line that is several stored segments.
 *
 * THE DEFECT THIS REPLACES
 *   A saved transcript line is `groupSavedTranscriptSegments` gluing consecutive rows back into
 *   one utterance — STT stores roughly a row per sentence. The editor showed that merged text and
 *   posted it, whole, to the FIRST row's id. The server wrote it there and left the other rows as
 *   they were, so on the next load the merge glued the old wording back on after the new:
 *
 *     rows  "Đây là … gặp."  +  "Tuy nhiên … từ Lắm, …"
 *     edit  "Lắm" -> "LLM"
 *     after "Đây là … gặp. Tuy nhiên … từ LLM, … Tuy nhiên … từ Lắm, …"
 *
 *   Every correction to a merged line duplicated the sentences after the first, with the mistake
 *   the user had just fixed still in them.
 *
 * WHAT THIS DOES INSTEAD
 *   It aligns the edited words against the words each row contributed, and hands every row back
 *   its own stretch of the new text. A row whose stretch did not change is not posted — each POST
 *   is a revision and a re-translation — and the rows keep their ids, timings and citations.
 *
 * WHY EVERY ROW KEEPS AT LEAST ONE WORD
 *   There is no delete on the correction path, and the server requires the text. A row whose own
 *   words were all removed borrows one from its neighbour; the rows still read back as exactly the
 *   text that was typed, because the merge joins them in order.
 */
import { joinTranscriptText } from "./sentence-flow.ts";

export type CorrectableSegment = { id: string; originalText: string };

export type PlannedCorrection = {
  segmentId: string;
  originalText: string;
  correctedText: string;
};

function words(text: string | null | undefined): string[] {
  const trimmed = text?.trim() ?? "";
  return trimmed ? trimmed.split(/\s+/) : [];
}

/** The line as the merge renders it: the same fold `groupSavedTranscriptSegments` does. */
function joinAll(texts: readonly string[]): string {
  return texts.reduce<string>((line, text) => joinTranscriptText(line, text), "");
}

/**
 * For each old word index, the index in `next` where that word's position lands. Insertions
 * between two old words go with the word before them, so text typed at a seam stays on the row it
 * was typed after.
 */
function alignWordPositions(previous: readonly string[], next: readonly string[]): number[] {
  const n = previous.length;
  const m = next.length;
  // Longest common subsequence over the suffixes, flattened: lcs[i * (m + 1) + j].
  const lcs = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * (m + 1) + j] =
        previous[i] === next[j]
          ? lcs[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
    }
  }

  const at = new Array<number>(n + 1);
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && previous[i] === next[j]) {
      at[i] = j;
      i += 1;
      j += 1;
    } else if (j >= m || lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1]) {
      at[i] = j;
      i += 1;
    } else {
      j += 1;
    }
  }
  at[n] = m;
  return at;
}

/**
 * The corrections to post for one edited line, one per row whose text actually changes.
 *
 * `segments` are the line's stored rows in the order the merge joined them. Returns `[]` when
 * nothing changed, and `null` when the edit cannot be spread over the rows without the merge
 * reading it back differently — fewer words than rows, or a seam where the new text repeats
 * itself and the merge would drop the repeat as an STT overlap.
 */
export function planLineCorrection(
  segments: readonly CorrectableSegment[],
  correctedText: string,
): PlannedCorrection[] | null {
  const corrected = correctedText.trim();
  if (segments.length === 0 || !corrected) return [];

  if (segments.length === 1) {
    const [only] = segments;
    return corrected === only.originalText.trim()
      ? []
      : [{ segmentId: only.id, originalText: only.originalText, correctedText: corrected }];
  }

  // Where each row's contribution starts in the merged line. A row wholly repeated by the one
  // before it contributes nothing, and still has to be rewritten, or it reappears once the row
  // it was hiding behind stops ending with it.
  const starts: number[] = [];
  let line = "";
  for (const segment of segments) {
    starts.push(words(line).length);
    line = joinTranscriptText(line, segment.originalText);
  }

  const previousWords = words(line);
  const nextWords = words(corrected);
  if (previousWords.join(" ") === nextWords.join(" ")) return [];
  if (nextWords.length < segments.length) return null;

  const at = alignWordPositions(previousWords, nextWords);
  const count = segments.length;
  const cuts = starts.map((start) => at[Math.min(start, previousWords.length)]);
  cuts[0] = 0;
  cuts.push(nextWords.length);

  // Every row at least one word, without reordering anything.
  for (let k = 1; k < count; k += 1) cuts[k] = Math.max(cuts[k], cuts[k - 1] + 1);
  for (let k = count - 1; k >= 1; k -= 1) cuts[k] = Math.min(cuts[k], cuts[k + 1] - 1);

  const expected = nextWords.join(" ");
  const slicesAt = (bounds: readonly number[]) =>
    segments.map((_, k) => nextWords.slice(bounds[k], bounds[k + 1]).join(" "));

  let slices = slicesAt(cuts);
  if (joinAll(slices) !== expected) {
    // A seam landed between two words the merge reads as an overlap ("rất | rất"). Moving that
    // seam one word either way is enough unless the text is that repetitive throughout.
    let repaired = false;
    for (let k = 1; k < count && !repaired; k += 1) {
      for (const shift of [1, -1]) {
        const moved = [...cuts];
        moved[k] += shift;
        if (moved[k] <= moved[k - 1] || moved[k] >= moved[k + 1]) continue;
        const candidate = slicesAt(moved);
        if (joinAll(candidate) === expected) {
          slices = candidate;
          repaired = true;
          break;
        }
      }
    }
    if (!repaired) return null;
  }

  return segments.flatMap((segment, k) =>
    slices[k] === segment.originalText.trim()
      ? []
      : [{ segmentId: segment.id, originalText: segment.originalText, correctedText: slices[k] }],
  );
}
