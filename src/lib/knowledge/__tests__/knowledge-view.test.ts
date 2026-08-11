import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKnowledgeQuery,
  canGoBack,
  currentCursor,
  hasAnyFact,
  initialCursorStack,
  KNOWLEDGE_PAGE_SIZE,
  popCursor,
  pushCursor,
  shouldShowPager,
  sourceLabel,
  SOURCE_TABS,
} from "../knowledge-view.ts";
import type { WorkspaceKnowledgeChunkDto } from "@/types/workspace-knowledge";

const chunk = (over: Partial<WorkspaceKnowledgeChunkDto> = {}): WorkspaceKnowledgeChunkDto => ({
  chunkId: "c1",
  sourceType: "document",
  text: "Retention is 90 days for the free plan.",
  fact: "Free plan keeps recordings for 90 days.",
  factCategory: "decision",
  documentId: "d1",
  documentName: "Retention policy.pdf",
  chunkIndex: 0,
  speakerName: null,
  startMs: null,
  retentionState: "active",
  deletionState: null,
  aiRetrieval: true,
  sourceTitle: null,
  ...over,
});

test("an unset filter is an omitted key, not an undefined value", () => {
  // Both surfaces feed this object into a TanStack query key, where { sourceType: undefined }
  // and {} are two different cache entries for one screen.
  const query = buildKnowledgeQuery({ sourceTab: "all" });

  assert.deepEqual(query, { pageSize: KNOWLEDGE_PAGE_SIZE });
  assert.equal("sourceType" in query, false);
  assert.equal("factCategory" in query, false);
  assert.equal("cursor" in query, false);
});

test("a chosen tab becomes sourceType; 'all' never does", () => {
  assert.equal(buildKnowledgeQuery({ sourceTab: "glossary" }).sourceType, "glossary");
  assert.equal(buildKnowledgeQuery({ sourceTab: "all" }).sourceType, undefined);
});

test("filters and cursor compose into one query", () => {
  const query = buildKnowledgeQuery({
    sourceTab: "meeting_summary",
    factCategory: "risk",
    cursor: "tok-2",
  });

  assert.deepEqual(query, {
    sourceType: "meeting_summary",
    factCategory: "risk",
    cursor: "tok-2",
    pageSize: KNOWLEDGE_PAGE_SIZE,
  });
});

test("every source tab is a value the API accepts, or 'all'", () => {
  // A tab whose value the API rejects returns a validation error rather than an empty page,
  // so the tab set is part of the contract with the backend's SourceTypes map.
  // Literal rather than imported from KNOWLEDGE_SOURCE_TYPES: that is a runtime value, and a
  // `@/` value import would need a resolver this strip-types run does not have.
  const accepted: string[] = [
    "all",
    "document",
    "meeting_summary",
    "glossary",
    "workspace_context",
  ];
  for (const tab of SOURCE_TABS) {
    assert.equal(accepted.includes(tab.value), true, `${tab.value} is not an accepted source type`);
  }
});

test("transcript is not offered as a tab", () => {
  // The API excludes transcript segments outright; offering the tab would render an error.
  // Widened to string because the literal union makes the comparison a compile error, which is
  // itself the first line of defence here.
  const values: string[] = SOURCE_TABS.map((tab) => tab.value);
  assert.equal(values.includes("transcript"), false);
});

test("the first page has no cursor", () => {
  assert.equal(currentCursor(initialCursorStack()), null);
  assert.equal(canGoBack(initialCursorStack()), false);
});

test("initialCursorStack hands out a fresh array each time", () => {
  // Two surfaces mount this state independently; a shared constant would let one page's reset
  // mutate the other's trail.
  assert.notEqual(initialCursorStack(), initialCursorStack());
});

test("paging forward and back walks the trail without losing page one", () => {
  let stack = initialCursorStack();
  stack = pushCursor(stack, "tok-2");
  assert.equal(currentCursor(stack), "tok-2");
  assert.equal(canGoBack(stack), true);

  stack = pushCursor(stack, "tok-3");
  assert.equal(currentCursor(stack), "tok-3");

  stack = popCursor(stack);
  assert.equal(currentCursor(stack), "tok-2");

  stack = popCursor(stack);
  assert.equal(currentCursor(stack), null);
  assert.equal(canGoBack(stack), false);
});

test("popping the first page is a no-op", () => {
  // An empty stack has no current cursor, which would read as "no filter" and silently
  // re-request page one under a different query key.
  const stack = popCursor(initialCursorStack());
  assert.deepEqual(stack, [null]);
  assert.equal(currentCursor(stack), null);
});

test("the pager hides on page one when there is no next page", () => {
  assert.equal(shouldShowPager(initialCursorStack(), null, false), false);
});

test("the pager appears when a next page exists or a previous one was visited", () => {
  assert.equal(shouldShowPager(initialCursorStack(), "tok-2", false), true);
  assert.equal(shouldShowPager([null, "tok-2"], null, false), true);
});

test("a failed read hides the pager entirely", () => {
  // Back/Next over a page that never arrived would walk a cursor trail the store never
  // confirmed.
  assert.equal(shouldShowPager([null, "tok-2"], "tok-3", true), false);
});

test("a document row is labelled by its file name", () => {
  assert.equal(sourceLabel(chunk()), "Retention policy.pdf");
});

test("sourceTitle wins over documentName", () => {
  // Meeting summaries and glossary terms carry their title there; documents leave it null.
  assert.equal(
    sourceLabel(chunk({ sourceTitle: "Sprint 12 review", documentName: "ignored.pdf" })),
    "Sprint 12 review",
  );
});

test("a known source type with no title falls back to its label", () => {
  assert.equal(
    sourceLabel(chunk({ sourceType: "meeting_summary", sourceTitle: null, documentName: null })),
    "Meeting summary",
  );
});

test("an unknown source type is shown as itself, not as a document", () => {
  // A producer this screen has not been taught about is a real row; showing its raw type is
  // more honest, and more debuggable, than mislabelling it.
  assert.equal(
    sourceLabel(chunk({ sourceType: "email_thread", sourceTitle: null, documentName: null })),
    "email_thread",
  );
});

test("hasAnyFact separates 'no facts on these rows' from 'no rows'", () => {
  assert.equal(hasAnyFact([]), false);
  assert.equal(hasAnyFact([chunk({ fact: null })]), false);
  assert.equal(hasAnyFact([chunk({ fact: null }), chunk({ fact: "A decision was made." })]), true);
});

test("an empty-string fact does not count as a fact", () => {
  assert.equal(hasAnyFact([chunk({ fact: "" })]), false);
});
