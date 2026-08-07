#!/usr/bin/env node
/**
 * Guard: the shipped UI is English.
 *
 * Fails when a Vietnamese-marked character reaches a user-visible string in `src/`.
 * There is no i18n layer in this app — every label is a literal in the component that
 * renders it — so a plain source scan is the whole check.
 *
 * Three deliberate carve-outs, because the product is a translator and some Vietnamese
 * in the source is correct:
 *
 *  1. Comments are stripped before scanning (they are not user-visible), as are test
 *     files, whose fixtures exercise diacritic folding on purpose.
 *  2. A bare `đ`/`Đ` never trips the guard on its own. It is the VND currency suffix
 *     ("90.000đ") and the explicit fold mapping in search-text.ts, neither of which is
 *     Vietnamese copy. Real Vietnamese copy always carries at least one tone or vowel
 *     mark beyond it ("Hủy", "Đăng nhập"), and that is what the guard looks for.
 *  3. ALLOWED_FILES holds the language catalogue, whose native names are product data.
 *     Anything else needs an `i18n-allow` marker on the line, or in the comment block
 *     immediately above it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

/** Language names / locale labels are the translation feature's data, not UI chrome. */
const ALLOWED_FILES = new Set(["src/lib/languages.ts"]);

/**
 * Vietnamese-marked letters, minus bare đ/Đ — see carve-out 2 above. Covers the
 * precomposed Latin-1/Extended-A forms plus the whole Latin Extended Additional block
 * Vietnamese lives in.
 */
const VIETNAMESE = /[Ạ-ỹăâêôơưĂÂÊÔƠƯàáảãèéẻẽìíỉĩòóỏõùúủũỳýỷỹÀÁẢÃÈÉẺẼÌÍỈĨÒÓỎÕÙÚỦŨỲÝỶỸ]/;

/** Blanks out comment bodies while preserving line count and column offsets. */
function stripComments(source) {
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

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      yield* walk(full);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) yield full;
  }
}

const offences = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (ALLOWED_FILES.has(rel)) continue;

  const raw = readFileSync(file, "utf8").split("\n");
  const scanned = stripComments(raw.join("\n")).split("\n");

  scanned.forEach((line, index) => {
    if (!VIETNAMESE.test(line)) return;
    // `i18n-allow` on the offending line, or anywhere in the comment block directly
    // above it, opts a string out.
    const marker = raw.slice(Math.max(0, index - 3), index + 1).join("\n");
    if (marker.includes("i18n-allow")) return;
    offences.push(`${rel}:${index + 1}: ${raw[index].trim()}`);
  });
}

if (offences.length > 0) {
  console.error(
    `Vietnamese text found in ${offences.length} user-facing string(s). ` +
      "Translate them, or mark genuine language data with an `i18n-allow` comment:\n",
  );
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}

console.log("check-english-ui: no Vietnamese found in user-facing strings.");
