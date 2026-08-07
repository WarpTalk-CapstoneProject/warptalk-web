import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_LANGUAGES } from "./languages.ts";
import {
  getProfileLanguageOptions,
  getSupportedTimezoneOptions,
} from "./profile-localization.ts";

test("profile language options come from the shared supported-language catalog", () => {
  assert.deepEqual(
    getProfileLanguageOptions(),
    SUPPORTED_LANGUAGES.map(({ code, name }) => ({
      value: code,
      label: name,
    })),
  );
});

test("timezone options come from the runtime catalog and always include UTC once", () => {
  const options = getSupportedTimezoneOptions(() => [
    "Asia/Tokyo",
    "America/New_York",
    "UTC",
    "Asia/Tokyo",
  ]);

  assert.deepEqual(options, ["UTC", "America/New_York", "Asia/Tokyo"]);
});
