import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkTemplate,
  insertAt,
  matchesFilter,
  placeholder,
  referencedVariables,
  sameContent,
} from "../email-template-editor.ts";

const variables = [
  { name: "FullName", required: false },
  { name: "ResetUrl", required: true },
];

test("reads every placeholder once, including ones written with spaces", () => {
  assert.deepEqual(referencedVariables("Hi {{FullName}}, {{ ResetUrl }} and {{FullName}}"), ["FullName", "ResetUrl"]);
  assert.deepEqual(referencedVariables("no variables"), []);
});

test("a clean template has no local issues", () => {
  assert.deepEqual(
    checkTemplate(variables, { subject: "Reset", heading: "", bodyHtml: '<a href="{{ResetUrl}}">x</a>' }),
    [],
  );
});

test("an unknown variable is flagged in the field it is in", () => {
  const issues = checkTemplate(variables, {
    subject: "Hi {{Nmae}}",
    heading: "",
    bodyHtml: '<a href="{{ResetUrl}}">x</a>',
  });
  assert.deepEqual(issues, [{ field: "subject", code: "UNKNOWN_VARIABLE", variable: "Nmae" }]);
});

test("the one value an email exists to deliver cannot be dropped", () => {
  const issues = checkTemplate(variables, { subject: "Reset", heading: "", bodyHtml: "<p>no link</p>" });
  assert.deepEqual(issues, [{ field: "bodyHtml", code: "MISSING_REQUIRED_VARIABLE", variable: "ResetUrl" }]);
});

test("an empty subject or body, and a two-line subject, are refused", () => {
  const codes = checkTemplate(variables, { subject: "a\nb", heading: "", bodyHtml: " " }).map((i) => i.code);
  assert.ok(codes.includes("LINE_BREAK"));
  assert.ok(codes.includes("REQUIRED"));
});

test("a variable is inserted over the selection and the caret lands after it", () => {
  assert.deepEqual(insertAt("Hello world", 6, 11, placeholder("FullName")), {
    value: "Hello {{FullName}}",
    caret: 18,
  });
  assert.deepEqual(insertAt("abc", null, null, "{{X}}"), { value: "abc{{X}}", caret: 8 });
});

test("dirty tracking compares all three fields", () => {
  const base = { subject: "s", heading: "h", bodyHtml: "b" };
  assert.equal(sameContent(base, { ...base }), true);
  assert.equal(sameContent(base, { ...base, heading: "H" }), false);
});

test("the card filters", () => {
  const live = { isLive: true, isCustomized: false };
  const edited = { isLive: true, isCustomized: true };
  const dormant = { isLive: false, isCustomized: false };
  assert.deepEqual([live, edited, dormant].filter((t) => matchesFilter(t, "live")), [live, edited]);
  assert.deepEqual([live, edited, dormant].filter((t) => matchesFilter(t, "dormant")), [dormant]);
  assert.deepEqual([live, edited, dormant].filter((t) => matchesFilter(t, "customized")), [edited]);
  assert.equal([live, edited, dormant].filter((t) => matchesFilter(t, "all")).length, 3);
});
