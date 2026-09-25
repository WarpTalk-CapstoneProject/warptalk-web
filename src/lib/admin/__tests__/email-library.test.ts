import assert from "node:assert/strict";
import { test } from "node:test";

import {
  implicitVariables,
  isDeletedTemplate,
  sendDurationMinutes,
  sendValueError,
  draftBodyDocument,
  standalonePreviewDocument,
  suggestKey,
  thumbnailDocument,
  thumbnailScale,
  wizardErrors,
  writtenLocales,
  type WizardState,
} from "../email-library.ts";

function state(overrides: Partial<WizardState> = {}): WizardState {
  return {
    name: "Autumn launch",
    key: "autumn-launch",
    category: "MARKETING",
    description: "",
    layoutId: null,
    variables: [{ name: "EventDate", label: "Launch date", type: "DATE", sample: "2026-10-01", required: true }],
    content: [
      { locale: "en", subject: "Hi {{RecipientName}}", preheader: "", heading: "", bodyHtml: "<p>On {{EventDate}}</p>" },
      { locale: "vi", subject: "", preheader: "", heading: "", bodyHtml: "" },
      { locale: "ja", subject: "", preheader: "", heading: "", bodyHtml: "" },
    ],
    ...overrides,
  };
}

test("keys are suggested from the name, ASCII-folded and made unique", () => {
  assert.equal(suggestKey("Chào mừng Đội ngũ!", new Set()), "chao-mung-doi-ngu");
  assert.equal(suggestKey("Launch", new Set(["launch", "launch-2"])), "launch-3");
  assert.equal(suggestKey("A", new Set()), "email-a");
});

test("a complete wizard has no errors; a taken key, a bad variable and a missing English version do", () => {
  const clean = wizardErrors(state(), new Set());
  assert.deepEqual(clean.review, []);

  assert.deepEqual(wizardErrors(state(), new Set(["autumn-launch"])).basics, ["keyTaken"]);
  assert.deepEqual(wizardErrors(state({ key: "X y" }), new Set()).basics, ["keyInvalid"]);
  const variables = wizardErrors(state({ variables: [{ name: "RecipientName", label: "", type: "TEXT", sample: "", required: false }] }), new Set());
  assert.deepEqual(variables.variables, ["variableImplicit"]);
  const badSample = wizardErrors(state({ variables: [{ name: "Link", label: "", type: "URL", sample: "not a link", required: false }] }), new Set());
  assert.ok(badSample.variables.includes("variableSampleInvalid"));
  const noEnglish = state({ content: state().content.map((c) => ({ ...c, subject: "", bodyHtml: "" })) });
  assert.ok(wizardErrors(noEnglish, new Set()).content.includes("englishRequired"));
});

test("content may use declared and implicit variables only; an untouched language is not checked", () => {
  const unknown = state({ content: [{ locale: "en", subject: "{{Nope}}", preheader: "", heading: "", bodyHtml: "<p>x</p>" }] });
  assert.deepEqual(wizardErrors(unknown, new Set()).content, ["unknownVariable"]);
  const halfVietnamese = state({
    content: [...state().content.slice(0, 1), { locale: "vi", subject: "Chào", preheader: "", heading: "", bodyHtml: "" }],
  });
  assert.deepEqual(wizardErrors(halfVietnamese, new Set()).content, ["bodyRequired"]);
  assert.deepEqual(writtenLocales(state().content).map((c) => c.locale), ["en"]);
  assert.ok(implicitVariables("ANNOUNCEMENT").some((v) => v.name === "AnnouncementTitle"));
  assert.ok(!implicitVariables("MARKETING").some((v) => v.name === "AnnouncementTitle"));
});

test("send values are checked like the server does", () => {
  assert.equal(sendValueError("URL", "https://warptalk.vn"), null);
  assert.equal(sendValueError("URL", "javascript:alert(1)"), "notALink");
  assert.equal(sendValueError("NUMBER", "1,200.5"), null);
  assert.equal(sendValueError("NUMBER", "twelve"), "notANumber");
  assert.equal(sendValueError("DATE", "2026-10-01"), null);
  assert.equal(sendValueError("DATE", "soon"), "notADate");
  assert.equal(sendValueError("TEXT", ""), null);
  assert.equal(sendDurationMinutes(125, 60), 3);
  assert.equal(sendDurationMinutes(0, 60), 0);
});

test("thumbnails scale the design width into the box and hide scrollbars", () => {
  assert.equal(thumbnailScale(320), 0.5);
  assert.equal(thumbnailScale(2000), 1);
  assert.match(thumbnailDocument("<html><head></head><body>x</body></html>"), /overflow:hidden!important;}<\/style><\/head>/);
  assert.ok(thumbnailDocument("<p>x</p>").startsWith("<style>"));
  assert.equal(isDeletedTemplate({ status: "DELETED" }), true);
});

test("the new-tab page keeps the email sandboxed and escapes everything it embeds", () => {
  const page = standalonePreviewDocument({
    title: "Preview",
    subject: 'Hi "you" <b>',
    from: "WarpTalk <hello@warptalk.vn>",
    to: "Linh <linh@example.com>",
    preheader: "x",
    html: '<p onclick="x">a & b</p>',
    dark: true,
    lang: "vi",
  });
  assert.match(page, /<iframe sandbox="" /);
  assert.match(page, /srcdoc="&lt;p onclick=&quot;x&quot;&gt;a &amp; b&lt;\/p&gt;"/);
  assert.match(page, /Hi &quot;you&quot; &lt;b&gt;/);
  assert.match(page, /Content-Security-Policy/);
});

test("the wizard's quick look fills samples, escaped, and leaves unknown placeholders visible", () => {
  const doc = draftBodyDocument("<p>Hi {{RecipientName}} {{Nope}}</p>", "Hello {{RecipientName}}", { RecipientName: "<Linh>" });
  assert.match(doc, /<p>Hi &lt;Linh&gt; \{\{Nope\}\}<\/p>/);
  assert.match(doc, /<h1>Hello &lt;Linh&gt;<\/h1>/);
});
