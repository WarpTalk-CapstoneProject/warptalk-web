import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKnowledgeQuery,
  canGoBack,
  currentCursor,
  hasAnyFact,
  initialCursorStack,
  KNOWLEDGE_PAGE_SIZE,
  orderKnowledgeChunks,
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
  indexedAtMs: null,
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

// ── Ordering ──────────────────────────────────────────────────────────────────
//
// The defect these cover: the page sorted sources by NAME, so the Source column read
// "a", "â", "ac", "ac", "ac" and the meeting that had just finished was somewhere in the
// middle of an alphabet. A page read to answer "what do we know now" has to start at the top.

const meeting = (title: string, indexedAtMs: number | null, chunkId: string) =>
  chunk({
    chunkId,
    sourceType: "meeting_summary",
    documentId: null,
    documentName: null,
    sourceTitle: title,
    chunkIndex: null,
    indexedAtMs,
  });

test("the newest source comes first, not the alphabetically first one", () => {
  // "a" would win on a localeCompare and lose on a clock, which is the whole bug.
  const ordered = orderKnowledgeChunks([
    meeting("a", 1_000, "old"),
    meeting("zulu", 9_000, "new"),
  ]);

  assert.deepEqual(
    ordered.map((row) => row.chunkId),
    ["new", "old"],
  );
});

test("a source's facts stay together even when another source was indexed between them", () => {
  const ordered = orderKnowledgeChunks([
    meeting("standup", 5_000, "standup-1"),
    meeting("retro", 7_000, "retro-1"),
    meeting("standup", 5_000, "standup-2"),
  ]);

  assert.deepEqual(
    ordered.map((row) => row.chunkId),
    ["retro-1", "standup-1", "standup-2"],
  );
});

test("a group is as new as its newest chunk, not as its first one", () => {
  // If the group's stamp were taken from whichever row arrived first in the page, "slow"
  // would sort below "quick" despite holding the most recent fact on the page.
  const ordered = orderKnowledgeChunks([
    meeting("slow", 1_000, "slow-old"),
    meeting("quick", 4_000, "quick-only"),
    meeting("slow", 9_000, "slow-new"),
  ]);

  assert.equal(ordered[0]?.sourceTitle, "slow");
  assert.equal(ordered[2]?.sourceTitle, "quick");
});

test("undated rows sort last rather than being treated as brand new or ancient", () => {
  // Everything indexed before the producer stamped a time is genuinely undated. Calling that
  // 0 buries it under rows it may well be newer than; calling it now floats stale rows to the
  // top of a list whose entire purpose is recency. Last, as a block, is the honest answer.
  const ordered = orderKnowledgeChunks([
    meeting("legacy", null, "legacy-1"),
    meeting("today", 8_000, "today-1"),
    meeting("older", 2_000, "older-1"),
  ]);

  assert.deepEqual(
    ordered.map((row) => row.chunkId),
    ["today-1", "older-1", "legacy-1"],
  );
});

test("undated rows keep a stable order among themselves", () => {
  const ordered = orderKnowledgeChunks([
    meeting("beta", null, "beta-1"),
    meeting("alpha", null, "alpha-1"),
  ]);

  assert.deepEqual(
    ordered.map((row) => row.chunkId),
    ["alpha-1", "beta-1"],
  );
});

test("a document's own chunks still read in their own order inside the group", () => {
  const page = (chunkIndex: number, chunkId: string) =>
    chunk({ chunkId, chunkIndex, indexedAtMs: 3_000 });

  const ordered = orderKnowledgeChunks([page(2, "c3"), page(0, "c1"), page(1, "c2")]);

  assert.deepEqual(
    ordered.map((row) => row.chunkId),
    ["c1", "c2", "c3"],
  );
});

test("two meetings sharing a title are not merged into one group", () => {
  // Grouping on the visible label alone would file two different meetings under one heading,
  // which is why the key carries documentId when there is one.
  const ordered = orderKnowledgeChunks([
    chunk({ chunkId: "a1", documentId: "doc-a", documentName: "Notes", indexedAtMs: 1_000 }),
    chunk({ chunkId: "b1", documentId: "doc-b", documentName: "Notes", indexedAtMs: 9_000 }),
  ]);

  assert.deepEqual(
    ordered.map((row) => row.chunkId),
    ["b1", "a1"],
  );
});

test("ordering does not mutate the page it was given", () => {
  const rows = [meeting("a", 1_000, "old"), meeting("z", 9_000, "new")];
  orderKnowledgeChunks(rows);

  assert.deepEqual(
    rows.map((row) => row.chunkId),
    ["old", "new"],
  );
});
