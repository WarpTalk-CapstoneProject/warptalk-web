#!/usr/bin/env node
/**
 * Guard: the shipped UI is English.
 *
 * Fails when non-English text reaches a user-visible string in `src/`. There is no i18n
 * layer in this app — every label is a literal in the component that renders it — so a
 * plain source scan is the whole check.
 *
 * What counts as non-English here is the set of scripts this product has actually leaked:
 * Vietnamese tone/vowel marks, and the CJK/Hangul used by language endonyms. Ordinary
 * typography (— ’ … ×) is left alone, so the check stays quiet about punctuation.
 *
 * Two carve-outs, both narrow and both justified:
 *
 *  1. Comments are stripped before scanning (they are not user-visible), as are test files,
 *     whose fixtures exercise diacritic folding on purpose.
 *  2. A bare `đ`/`Đ` never trips the guard on its own. It is the explicit fold mapping in
 *     search-text.ts — code, not copy. Real Vietnamese copy always carries at least one
 *     further tone or vowel mark ("Hủy", "Đăng nhập"), and that is what the guard looks for.
 *     The VND currency suffix that used to rely on this carve-out is gone; money now renders
 *     through lib/currency.ts as "90,000 VND".
 *
 * There is no file allowlist. Anything that genuinely must hold non-English text needs an
 * explicit `i18n-allow` marker, which applies to the contiguous block it heads — so a
 * normalization table can be exempted while the display registry beside it stays guarded.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { stripComments } from "./lib/strip-comments.mjs";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname: a URL percent-encodes every space, so a checkout under a
// directory like "WarpTalk - Capstone Project" yielded ".../WarpTalk%20-%20Capstone%20Project"
// and every readdirSync threw ENOENT. CI never saw it — its workspace path has no spaces.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

/**
 * Vietnamese-marked letters (minus bare đ/Đ, see carve-out 2), plus the Han, Hiragana,
 * Katakana and Hangul blocks a native language name would arrive in.
 */
const NON_ENGLISH =
  /[Ạ-ỹăâêôơưĂÂÊÔƠƯàáảãèéẻẽìíỉĩòóỏõùúủũỳýỷỹÀÁẢÃÈÉẺẼÌÍỈĨÒÓỎÕÙÚỦŨỲÝỶỸ぀-ヿ一-鿿가-힯]/;

/**
 * Whether an `i18n-allow` marker governs this line. A marker applies to the contiguous
 * block it heads: scan back from the offending line and stop at the first blank line, so
 * one marker covers a table but never bleeds into unrelated code further up the file.
 */
function isAllowed(rawLines, index) {
  for (let i = index; i >= 0 && index - i <= 20; i -= 1) {
    const line = rawLines[i] ?? "";
    if (i !== index && line.trim() === "") return false;
    if (line.includes("i18n-allow")) return true;
  }
  return false;
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
  const raw = readFileSync(file, "utf8").split("\n");
  const scanned = stripComments(raw.join("\n")).split("\n");

  scanned.forEach((line, index) => {
    if (!NON_ENGLISH.test(line)) return;
    if (isAllowed(raw, index)) return;
    offences.push(`${rel}:${index + 1}: ${raw[index].trim()}`);
  });
}

if (offences.length > 0) {
  console.error(
    `Non-English text found in ${offences.length} user-facing string(s). ` +
      "Translate them, or mark genuine language data with an `i18n-allow` comment:\n",
  );
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}

console.log("check-english-ui: no non-English text found in user-facing strings.");
