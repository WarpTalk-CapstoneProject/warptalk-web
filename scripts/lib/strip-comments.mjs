/**
 * Blanks out comment bodies while preserving line count and column offsets.
 *
 * Shared by the contract scripts that scan source for user-visible copy — check-english-ui.mjs
 * and check-desktop-download-contract.mjs. Both ask the same question and would get the same
 * wrong answer without this: a comment explaining WHY a forbidden string must never be shipped
 * contains that string, and a raw scan cannot tell the explanation from the offence.
 *
 * A quote-aware walk rather than a regex, because a regex cannot tell `//` in a URL from the
 * start of a comment.
 */
export function stripComments(source) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      if (ch === "\\") {
        out += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
