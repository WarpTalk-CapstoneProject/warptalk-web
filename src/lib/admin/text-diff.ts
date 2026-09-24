/**
 * A line diff for the CMS History tabs: what changed between two versions of a subject, a body,
 * a layout. Longest-common-subsequence over lines — exact, and small enough for email-sized text
 * (the body limit is 50,000 characters; beyond ~2,000 lines per side it falls back to a coarse
 * "everything changed" answer rather than allocating a huge table).
 *
 * Free of React and `@/` imports so `node:test` runs it.
 */

export type DiffOp = "same" | "added" | "removed";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

const MAX_LINES = 2_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text) => ({ op: "removed" as const, text })),
      ...b.map((text) => ({ op: "added" as const, text })),
    ];
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: "same", text: a[i] });
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      out.push({ op: "removed", text: a[i] });
      i++;
    } else {
      out.push({ op: "added", text: b[j] });
      j++;
    }
  }
  while (i < a.length) out.push({ op: "removed", text: a[i++] });
  while (j < b.length) out.push({ op: "added", text: b[j++] });
  return out;
}

export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((line) => line.op === "added").length,
    removed: lines.filter((line) => line.op === "removed").length,
  };
}

/**
 * Unchanged runs longer than `context * 2` collapse to a marker, so a one-line change in a long
 * body shows as that line and a little around it.
 */
export function collapseUnchanged(lines: readonly DiffLine[], context = 2): (DiffLine | { op: "gap"; count: number })[] {
  const out: (DiffLine | { op: "gap"; count: number })[] = [];
  let run: DiffLine[] = [];
  const flush = (atEnd: boolean, atStart: boolean) => {
    const keepHead = atStart ? 0 : context;
    const keepTail = atEnd ? 0 : context;
    if (run.length > keepHead + keepTail + 1) {
      out.push(...run.slice(0, keepHead));
      out.push({ op: "gap", count: run.length - keepHead - keepTail });
      out.push(...run.slice(run.length - keepTail));
    } else {
      out.push(...run);
    }
    run = [];
  };
  let seenChange = false;
  for (const line of lines) {
    if (line.op === "same") {
      run.push(line);
    } else {
      flush(false, !seenChange);
      seenChange = true;
      out.push(line);
    }
  }
  flush(true, !seenChange);
  return out;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}
