import assert from "node:assert/strict";
import test from "node:test";
import { getFlagEmoji } from "./language-flag.ts";

test("locale tags resolve from their region", () => {
  assert.equal(getFlagEmoji("vi-VN"), "🇻🇳");
  assert.equal(getFlagEmoji("en-US"), "🇺🇸");
  assert.equal(getFlagEmoji("ja-JP"), "🇯🇵");
});

test("bare language codes resolve too", () => {
  // Rooms carry locale tags, the AI side keys everything by the bare code — both reach here.
  // The region comes from the language registry, so every language a picker offers has one.
  assert.equal(getFlagEmoji("vi"), "🇻🇳");
  assert.equal(getFlagEmoji("en"), "🇺🇸");
  assert.equal(getFlagEmoji("ko"), "🇰🇷");
});

test("underscore-separated tags are accepted", () => {
  assert.equal(getFlagEmoji("vi_VN"), "🇻🇳");
});

test("an unmappable value yields nothing rather than mojibake", () => {
  // The previous implementation uppercased whatever it was given and fed every character to
  // the regional-indicator maths, so "auto" produced four stray indicator glyphs.
  assert.equal(getFlagEmoji("auto"), "");
  assert.equal(getFlagEmoji(""), "");
  assert.equal(getFlagEmoji("xx"), "");
});
