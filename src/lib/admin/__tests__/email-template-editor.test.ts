import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blockInclude,
  blockStatus,
  checkTemplate,
  compareTemplates,
  insertAt,
  matchesFilter,
  matchesSearch,
  parseRecipients,
  placeholder,
  referencedBlocks,
  referencedVariables,
  sameContent,
  slugify,
  type TemplateContent,
} from "../email-template-editor.ts";

const variables = [
  { name: "FullName", required: false },
  { name: "ResetUrl", required: true },
];

function content(overrides: Partial<TemplateContent> = {}): TemplateContent {
  return { subject: "Reset", preheader: "", heading: "", bodyHtml: '<a href="{{ResetUrl}}">x</a>', textBody: "", ...overrides };
}

test("reads every placeholder and block include once", () => {
  assert.deepEqual(referencedVariables("Hi {{FullName}}, {{ ResetUrl }} and {{FullName}}"), ["FullName", "ResetUrl"]);
  assert.deepEqual(referencedBlocks("{{> signature}} and {{>footer}} {{> signature}}"), ["signature", "footer"]);
});

test("a clean template has no local issues", () => {
  assert.deepEqual(checkTemplate(variables, content()), []);
});

test("an unknown variable is flagged in the field it is in, including the preheader and text", () => {
  const issues = checkTemplate(variables, content({ preheader: "{{Nmae}}", textBody: "{{ResetUrl}} {{Oops}}" }));
  assert.deepEqual(issues, [
    { field: "preheader", code: "UNKNOWN_VARIABLE", variable: "Nmae" },
    { field: "textBody", code: "UNKNOWN_VARIABLE", variable: "Oops" },
  ]);
});

test("the one value an email exists to deliver cannot be dropped — from the HTML or a hand-written text part", () => {
  assert.deepEqual(checkTemplate(variables, content({ bodyHtml: "<p>no link</p>" })), [
    { field: "bodyHtml", code: "MISSING_REQUIRED_VARIABLE", variable: "ResetUrl" },
  ]);
  assert.deepEqual(checkTemplate(variables, content({ textBody: "Reset your password." })), [
    { field: "textBody", code: "MISSING_REQUIRED_VARIABLE", variable: "ResetUrl" },
  ]);
});

test("an empty subject or body, and a two-line subject or preheader, are refused", () => {
  const codes = checkTemplate(variables, content({ subject: "a\nb", preheader: "x\ny", bodyHtml: " " })).map((i) => i.code);
  assert.equal(codes.filter((code) => code === "LINE_BREAK").length, 2);
  assert.ok(codes.includes("REQUIRED"));
});

test("a variable or a block is inserted over the selection and the caret lands after it", () => {
  assert.deepEqual(insertAt("Hello world", 6, 11, placeholder("FullName")), { value: "Hello {{FullName}}", caret: 18 });
  assert.deepEqual(insertAt("abc", null, null, blockInclude("signature")), { value: "abc{{> signature}}", caret: 18 });
});

test("dirty tracking compares all five fields", () => {
  const base = content();
  assert.equal(sameContent(base, { ...base }), true);
  assert.equal(sameContent(base, { ...base, preheader: "p" }), false);
  assert.equal(sameContent(base, { ...base, textBody: "t" }), false);
});

test("the list filters, search and sort", () => {
  const live = { isLive: true, isCustomized: false, hasDraftChanges: false };
  const edited = { isLive: true, isCustomized: true, hasDraftChanges: true };
  const dormant = { isLive: false, isCustomized: false, hasDraftChanges: false };
  assert.deepEqual([live, edited, dormant].filter((t) => matchesFilter(t, "live")), [live, edited]);
  assert.deepEqual([live, edited, dormant].filter((t) => matchesFilter(t, "dormant")), [dormant]);
  assert.deepEqual([live, edited, dormant].filter((t) => matchesFilter(t, "draft")), [edited]);
  assert.equal(matchesSearch(["Password reset", "auth.password-reset"], "RESET"), true);
  assert.equal(matchesSearch(["Password reset"], "invite"), false);

  const rows = [
    { name: "B", updatedAt: "2026-09-01T00:00:00Z", sent: 5 },
    { name: "A", updatedAt: "2026-09-20T00:00:00Z", sent: 1 },
  ];
  assert.deepEqual([...rows].sort((x, y) => compareTemplates("name", x, y)).map((r) => r.name), ["A", "B"]);
  assert.deepEqual([...rows].sort((x, y) => compareTemplates("updated", x, y)).map((r) => r.name), ["A", "B"]);
  assert.deepEqual([...rows].sort((x, y) => compareTemplates("sent", x, y)).map((r) => r.name), ["B", "A"]);
});

test("a block's status reads draft, published, unpublished changes or archived", () => {
  assert.equal(blockStatus({ status: "ACTIVE", publishedVersion: 0, hasDraftChanges: true }), "DRAFT");
  assert.equal(blockStatus({ status: "ACTIVE", publishedVersion: 2, hasDraftChanges: false }), "PUBLISHED");
  assert.equal(blockStatus({ status: "ACTIVE", publishedVersion: 2, hasDraftChanges: true }), "CHANGES");
  assert.equal(blockStatus({ status: "ARCHIVED", publishedVersion: 2, hasDraftChanges: false }), "ARCHIVED");
});

test("block keys are slugged from names, and test recipients are parsed once each", () => {
  assert.equal(slugify("Chữ ký — Đội ngũ 2026"), "chu-ky-oi-ngu-2026");
  assert.deepEqual(parseRecipients("a@x.vn, b@x.vn\nA@x.vn;  c@x.vn"), ["a@x.vn", "b@x.vn", "c@x.vn"]);
});

test("each locale reads as published, changed, draft-only, archived or missing", async () => {
  const { localeState } = await import("../email-template-editor.ts");
  assert.equal(localeState(undefined), "MISSING");
  assert.equal(localeState({ locale: "vi", status: "ACTIVE", publishedVersion: 0, hasDraftChanges: true }), "DRAFT_ONLY");
  assert.equal(localeState({ locale: "vi", status: "ACTIVE", publishedVersion: 3, hasDraftChanges: true }), "CHANGES");
  assert.equal(localeState({ locale: "vi", status: "ACTIVE", publishedVersion: 3, hasDraftChanges: false }), "PUBLISHED");
  assert.equal(localeState({ locale: "vi", status: "ARCHIVED", publishedVersion: 3, hasDraftChanges: false }), "ARCHIVED");
});

test("a locale without published content falls back to English, then to the built-in wording", async () => {
  const { sentVersionFor } = await import("../email-template-editor.ts");
  const en = { locale: "en", status: "ACTIVE", publishedVersion: 2, hasDraftChanges: false };
  const viDraft = { locale: "vi", status: "ACTIVE", publishedVersion: 0, hasDraftChanges: true };
  const jaArchived = { locale: "ja", status: "ARCHIVED", publishedVersion: 4, hasDraftChanges: false };
  assert.equal(sentVersionFor("vi", [en, viDraft]), "en");
  assert.equal(sentVersionFor("ja", [en, jaArchived]), "en");
  assert.equal(sentVersionFor("vi", [viDraft]), "default");
  assert.equal(sentVersionFor("en", [en]), "en");
  assert.equal(sentVersionFor("vi", [{ ...viDraft, publishedVersion: 1 }]), "vi");
});

test("custom, built-in and archived filters; a deleted template shows only under Archived", async () => {
  const { matchesFilter } = await import("../email-template-editor.ts");
  const builtIn = { isLive: true, isCustomized: false, hasDraftChanges: false, isCustom: false };
  const custom = { isLive: true, isCustomized: true, hasDraftChanges: false, isCustom: true };
  const deleted = { ...custom, isDeleted: true };
  assert.deepEqual([builtIn, custom, deleted].filter((t) => matchesFilter(t, "all")), [builtIn, custom]);
  assert.deepEqual([builtIn, custom, deleted].filter((t) => matchesFilter(t, "custom")), [custom]);
  assert.deepEqual([builtIn, custom, deleted].filter((t) => matchesFilter(t, "builtIn")), [builtIn]);
  assert.deepEqual([builtIn, custom, deleted].filter((t) => matchesFilter(t, "archived")), [deleted]);
});
