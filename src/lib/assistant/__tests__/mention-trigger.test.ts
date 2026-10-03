import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  NAMESPACE_ENTITY_TYPES,
  namespaceHints,
  namespaceKeyword,
  parseMentionTrigger,
} from "../mention-trigger.ts";

describe("WarpBot composer — reading the @ being typed (WT-887)", () => {
  test("a plain @name is what it always was", () => {
    assert.deepEqual(parseMentionTrigger("hỏi @Ali"), { start: 4, namespace: null, query: "Ali" });
    assert.deepEqual(parseMentionTrigger("@"), { start: 0, namespace: null, query: "" });
  });

  test("the colon no longer closes the menu: @document: is a namespace", () => {
    assert.deepEqual(parseMentionTrigger("xem @document:"), {
      start: 4,
      namespace: "document",
      query: "",
    });
    assert.deepEqual(parseMentionTrigger("@summary:stand"), {
      start: 0,
      namespace: "summary",
      query: "stand",
    });
  });

  test("aliases and case land on the canonical namespace", () => {
    assert.equal(parseMentionTrigger("@doc:spec")?.namespace, "document");
    assert.equal(parseMentionTrigger("@room:")?.namespace, "meeting");
    assert.equal(parseMentionTrigger("@Meeting:q3")?.namespace, "meeting");
    assert.equal(parseMentionTrigger("@TRANSCRIPT:")?.namespace, "transcript");
    assert.equal(parseMentionTrigger("@artifact:")?.namespace, "artifact");
  });

  test("plurals are the same namespace — @documents: used to search for the text 'documents:'", () => {
    assert.deepEqual(parseMentionTrigger("@documents:"), {
      start: 0,
      namespace: "document",
      query: "",
    });
    assert.equal(parseMentionTrigger("@docs:spec")?.namespace, "document");
    assert.equal(parseMentionTrigger("@Transcripts:q3")?.namespace, "transcript");
    assert.equal(parseMentionTrigger("@summaries:")?.namespace, "summary");
    assert.equal(parseMentionTrigger("@meetings:")?.namespace, "meeting");
    assert.equal(parseMentionTrigger("@artifacts:")?.namespace, "artifact");
  });

  test("an unknown word before a colon is just part of a plain query", () => {
    assert.deepEqual(parseMentionTrigger("@minutes:x"), {
      start: 0,
      namespace: null,
      query: "minutes:x",
    });
  });

  test("Vietnamese letters stay in the query instead of closing the menu", () => {
    assert.deepEqual(parseMentionTrigger("@meeting:họp"), {
      start: 0,
      namespace: "meeting",
      query: "họp",
    });
    assert.equal(parseMentionTrigger("@Việt")?.query, "Việt");
  });

  test("whitespace ends it, as before", () => {
    assert.equal(parseMentionTrigger("@Google Meet"), null);
    assert.equal(parseMentionTrigger("@document: "), null);
  });

  test("an email address is not a mention", () => {
    assert.equal(parseMentionTrigger("gửi cho an@example.com"), null);
    assert.equal(parseMentionTrigger("an@exa"), null);
    assert.equal(parseMentionTrigger("x.@doc:"), null);
  });

  test("only the last @ counts", () => {
    assert.deepEqual(parseMentionTrigger("@Summary · Standup và @tran"), {
      start: 22,
      namespace: null,
      query: "tran",
    });
  });
});

describe("WarpBot composer — namespace hints under a plain @", () => {
  test("a bare @ offers none", () => {
    assert.deepEqual(namespaceHints(""), { namespaces: [], exact: false });
  });

  test("a keyword typed in full leads, alias or not", () => {
    assert.deepEqual(namespaceHints("document"), { namespaces: ["document"], exact: true });
    assert.deepEqual(namespaceHints("doc"), { namespaces: ["document"], exact: true });
    assert.deepEqual(namespaceHints("Room"), { namespaces: ["meeting"], exact: true });
    assert.deepEqual(namespaceHints("documents"), { namespaces: ["document"], exact: true });
    assert.deepEqual(namespaceHints("transcripts"), { namespaces: ["transcript"], exact: true });
  });

  test("the start of a keyword is offered, but does not lead", () => {
    assert.deepEqual(namespaceHints("me"), { namespaces: ["meeting"], exact: false });
    assert.deepEqual(namespaceHints("summ"), { namespaces: ["summary"], exact: false });
  });

  test("a query no keyword starts with offers nothing", () => {
    assert.deepEqual(namespaceHints("alice"), { namespaces: [], exact: false });
  });

  test("a hint writes the canonical keyword", () => {
    assert.equal(namespaceKeyword("document"), "document:");
    assert.equal(namespaceKeyword("meeting"), "meeting:");
  });
});

describe("WarpBot composer — what each namespace offers", () => {
  test("artifact is both summary and transcript, and nothing offers minutes", () => {
    assert.deepEqual(NAMESPACE_ENTITY_TYPES.artifact, ["summary", "transcript"]);
    assert.deepEqual(NAMESPACE_ENTITY_TYPES.meeting, ["room"]);
    for (const types of Object.values(NAMESPACE_ENTITY_TYPES)) {
      assert.ok(!types.includes("minutes"));
    }
  });
});
