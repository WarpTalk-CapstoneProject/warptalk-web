/**
 * Turning a run of STT chunks into text a person can read.
 *
 * WHAT SHAPES A BUBBLE TODAY, AND WHAT DID NOT
 *   VAD decides where the audio is cut (576–864ms of silence, or the 6s `chunk_duration_ms`
 *   cap). `_filter_segments` throws away hallucinations, repeats and echoes. `groupTranscriptSegments`
 *   decides which chunks belong to one utterance. After all of that, nobody had ever looked at the
 *   TEXT: the halves were glued with a single space and rendered as one run-on line.
 *
 *   These two functions are that missing step. Both are pure and live here rather than in
 *   transcript-display.ts because the edge cases are where the value is, and the node test runner
 *   can reach them here without a bundler.
 */

/**
 * The longest tail of `left` that is also the head of `right`, in words.
 *
 * WHY WORDS AND NOT CHARACTERS
 *   A character-level overlap finds junk. "chúng ta" and "tama" share "ta", and gluing on that
 *   produces "chúngtama" — a word that does not exist, from two that do. Vietnamese is written in
 *   space-separated syllables, so a word boundary is exactly the unit an overlap can be trusted at.
 *
 * WHY CASE-INSENSITIVE
 *   The same syllable arrives capitalised at the start of one chunk and lower-case mid-sentence in
 *   the next, because each chunk was transcribed as if it were its own utterance. Comparing
 *   verbatim misses precisely the overlaps that matter.
 */
function overlapWordCount(left: string[], right: string[]): number {
  const max = Math.min(left.length, right.length);

  // Longest first: "ta sẽ bắt đầu" overlapping "ta sẽ" must take both words, not just "ta".
  for (let size = max; size > 0; size -= 1) {
    let same = true;
    for (let at = 0; at < size; at += 1) {
      if (left[left.length - size + at].toLowerCase() !== right[at].toLowerCase()) {
        same = false;
        break;
      }
    }
    if (same) return size;
  }

  return 0;
}

/**
 * Join two halves of one utterance, dropping what they repeat.
 *
 * THE DEFECT THIS REPLACES
 *   The old rule caught only a TOTAL overlap — `left.endsWith(right)` or `right.startsWith(left)`
 *   — and glued everything else with a space. A partial overlap therefore doubled itself:
 *
 *     "chúng ta sẽ" + "ta sẽ bắt đầu"  ->  "chúng ta sẽ ta sẽ bắt đầu"
 *
 *   That is not hypothetical. STT emits overlapping windows: `exclude_emitted_from_final` trims
 *   what the streaming path already sent, but the closed-utterance path re-transcribes audio that
 *   carries ~1s of pre-speech padding, so the first words of a chunk are routinely the last words
 *   of the one before it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It does not repair punctuation or capitalisation across the seam. That is a different job
 *   (`splitIntoSentences` renders what is there; restoring what STT never produced is a question
 *   for the transcription model, and `prompt` is closed to instruction prose after a production
 *   echo incident). Joining must not invent text.
 */
export function joinTranscriptText(current?: string, incoming?: string): string {
  const left = current?.trim() || "";
  const right = incoming?.trim() || "";

  if (!left) return right;
  if (!right) return left;

  // The total-overlap cases, kept as they were: they are cheap and they are the common ones.
  if (left === right || left.endsWith(right)) return left;
  if (right.startsWith(left)) return right;

  const leftWords = left.split(/\s+/);
  const rightWords = right.split(/\s+/);
  const repeated = overlapWordCount(leftWords, rightWords);

  if (repeated === 0) return `${left} ${right}`;

  const remainder = rightWords.slice(repeated).join(" ");
  // The whole of `right` was already in `left`. Keep `left` rather than appending nothing and
  // leaving a trailing space behind.
  return remainder ? `${left} ${remainder}` : left;
}

/**
 * Terminal punctuation, and the shapes that only look like it.
 *
 * `\d[.,]\d` is a decimal — "3.14" and Vietnamese "3,14" both split mid-number without this.
 * A single letter before the stop is an initial ("A. Nguyễn"), and the common Vietnamese titles
 * are abbreviations that end in a full stop mid-sentence.
 */
const SENTENCE_END = /([.!?…]+)(\s+|$)/g;

/** Abbreviations that end in a stop without ending a sentence. Lower-cased at the comparison. */
const ABBREVIATIONS = new Set([
  // i18n-allow: Vietnamese honorifics and academic titles — DATA the splitter matches against,
  // not UI copy. Translating them would break the very sentences they exist to keep whole.
  "ts", "th.s", "ths", "gs", "pgs", "bs", "ks", "cn", "đc", "ông", "bà",
  "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "e.g", "i.e", "no", "vd", "tp",
]);

function endsWithAbbreviation(text: string): boolean {
  const lastWord = text.split(/\s+/).at(-1)?.replace(/[.!?…]+$/, "").toLowerCase() ?? "";
  if (!lastWord) return false;
  // A single character is an initial: "A." in "A. Nguyễn" is not the end of a sentence.
  return lastWord.length === 1 || ABBREVIATIONS.has(lastWord);
}

/**
 * A bubble's text as the sentences it holds.
 *
 * WHY THIS IS RENDERING AND NOT SEGMENTATION
 *   One bubble is one SPEAKING TURN — that is the rule the merge enforces, and splitting a turn
 *   into several bubbles would undo it. What this does is lay that turn out as the sentences it
 *   contains, so three sentences read as three lines instead of one wall of text.
 *
 * WHEN THERE IS NO PUNCTUATION AT ALL
 *   Returns the whole thing as ONE sentence, which is the honest answer. Vietnamese STT frequently
 *   returns commas and no terminal stop — production carries lines like "Chứm đúng rồi chính là"
 *   — and a splitter that guessed sentence ends from length or from commas would cut mid-clause
 *   and read as corruption rather than as prose.
 */
export function splitIntoSentences(text: string): string[] {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return [];

  const sentences: string[] = [];
  let start = 0;

  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_END.exec(trimmed)) !== null) {
    const endsAt = match.index + match[1].length;
    const candidate = trimmed.slice(start, endsAt);

    // A decimal point: the character before the stop and the one after are both digits.
    const before = trimmed[match.index - 1];
    const after = trimmed[endsAt];
    if (/\d/.test(before ?? "") && /\d/.test(after ?? "")) continue;

    if (endsWithAbbreviation(candidate)) continue;

    const cleaned = candidate.trim();
    if (cleaned) sentences.push(cleaned);
    start = endsAt + match[2].length;
  }

  // Whatever follows the last terminal stop — a turn that was cut off, or the whole thing when
  // there was no punctuation to find.
  const tail = trimmed.slice(start).trim();
  if (tail) sentences.push(tail);

  return sentences;
}
