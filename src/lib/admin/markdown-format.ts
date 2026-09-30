/**
 * The markdown editor's toolbar, as pure text edits: each returns the new value and the new
 * selection, so the textarea keeps the caret where a writer expects it.
 *
 * Free of React and `@/` imports so `node:test` runs it.
 */

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** `**bold**` around the selection; with nothing selected, a placeholder that is left selected. */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): TextEdit {
  const selected = value.slice(start, end);
  // Toggle off when the selection is already wrapped.
  if (value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    const next = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
    return { value: next, selectionStart: start - before.length, selectionEnd: end - before.length };
  }
  const inner = selected || placeholder;
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  return { value: next, selectionStart: start + before.length, selectionEnd: start + before.length + inner.length };
}

/** `- ` / `1. ` / `> ` / `## ` at the start of every line the selection touches. */
export function prefixLines(value: string, start: number, end: number, prefix: string | ((index: number) => string)): TextEdit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const make = (index: number) => (typeof prefix === "function" ? prefix(index) : prefix);
  const allPrefixed = lines.every((line, index) => line.startsWith(make(index)));
  const edited = lines.map((line, index) => (allPrefixed ? line.slice(make(index).length) : make(index) + line)).join("\n");
  const next = value.slice(0, lineStart) + edited + value.slice(lineEnd);
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + edited.length };
}

/** A block (an image, a divider) inserted at the caret on its own line. */
export function insertBlock(value: string, at: number, block: string): TextEdit {
  const before = value.slice(0, at);
  const after = value.slice(at);
  const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const trail = after && !after.startsWith("\n") ? "\n\n" : "";
  const next = before + lead + block + trail + after;
  const caret = before.length + lead.length + block.length;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}
