import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { diffNamespace, type MessageTree } from "../catalog-completeness.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MESSAGES_DIR = join(ROOT, "messages");
const SOURCE_LOCALE = "en";
const LOCALES = ["en", "vi", "ja"];

function readNamespace(locale: string, namespace: string): MessageTree {
  const path = join(MESSAGES_DIR, locale, `${namespace}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

const namespaces = readdirSync(join(MESSAGES_DIR, SOURCE_LOCALE))
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort();

describe("i18n message catalog completeness", () => {
  it("ships the same locale directories for every supported locale", () => {
    for (const locale of LOCALES) {
      const files = readdirSync(join(MESSAGES_DIR, locale))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.replace(/\.json$/, ""))
        .sort();
      assert.deepEqual(files, namespaces, `messages/${locale} does not match messages/${SOURCE_LOCALE}'s namespace files`);
    }
  });

  for (const namespace of namespaces) {
    const sourceTree = readNamespace(SOURCE_LOCALE, namespace);

    for (const locale of LOCALES) {
      if (locale === SOURCE_LOCALE) continue;

      it(`${locale}/${namespace}.json has no missing or drifted keys against ${SOURCE_LOCALE}`, () => {
        const localeTree = readNamespace(locale, namespace);
        const diff = diffNamespace(namespace, locale, sourceTree, localeTree);

        assert.deepEqual(
          diff.missing,
          [],
          `messages/${locale}/${namespace}.json is missing keys present in ${SOURCE_LOCALE}: ${diff.missing.join(", ")}`,
        );
        assert.deepEqual(
          diff.extra,
          [],
          `messages/${locale}/${namespace}.json has keys not present in ${SOURCE_LOCALE} (rename or remove): ${diff.extra.join(", ")}`,
        );
      });
    }
  }
});
