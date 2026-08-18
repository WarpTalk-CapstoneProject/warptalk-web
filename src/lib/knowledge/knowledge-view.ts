/**
 * Filter, cursor and label rules for the knowledge listing.
 *
 * Extracted because two surfaces now read the same index: the workspace-scoped Knowledge page
 * an Owner opens, and the Knowledge tab a platform admin opens on any workspace. The rules that
 * matter here — a filter change invalidates the cursor trail, an unknown source type is shown
 * as itself, an absent filter is an absent key rather than an undefined one — are exactly the
 * kind that drift apart once duplicated, so they live here once and are tested directly.
 *
 * Deliberately free of React and of icons: every `@/` import is type-only, so `node:test` can
 * strip the types and exercise this file without a module resolver or a renderer. The icon per
 * source type is chosen in the component, keyed by the same strings.
 */

import type {
  KnowledgeSourceType,
  WorkspaceKnowledgeChunkDto,
  WorkspaceKnowledgeQuery,
} from "@/types/workspace-knowledge";

export type SourceTab = "all" | KnowledgeSourceType;

/**
 * The "Meetings" tab is meeting SUMMARIES, not raw transcript lines — segments are still
 * indexed and still searchable by WarpBot, they are simply not what a person means by "what
 * does this workspace know".
 *
 * No "Workspace" tab: the API accepts `workspace_context`, but nothing writes it. A workspace
 * has a name, a slug and a settings object of toggles — no prose describing what it is — so
 * the tab would be permanently empty until a workspace description exists to index. An empty
 * tab reads as a broken feature, so it is absent rather than dead.
 */
export const SOURCE_TABS = [
  { value: "all", label: "Everything" },
  { value: "document", label: "Documents" },
  { value: "meeting_summary", label: "Meetings" },
  { value: "glossary", label: "Glossary" },
] as const;

export const KNOWLEDGE_PAGE_SIZE = 50;

/** Cursors for pages already visited, so Back does not have to re-scroll from the start. */
export type CursorStack = (string | null)[];

/** A function, not a shared constant: two components must not alias one mutable array. */
export function initialCursorStack(): CursorStack {
  return [null];
}

export function currentCursor(stack: CursorStack): string | null {
  return stack[stack.length - 1] ?? null;
}

export function pushCursor(stack: CursorStack, next: string | null): CursorStack {
  return [...stack, next];
}

/**
 * Never pops the first page's `null` off the bottom. An empty stack has no current cursor at
 * all, which would read as "no filter" and silently re-request page one under a different
 * query key.
 */
export function popCursor(stack: CursorStack): CursorStack {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}

export function canGoBack(stack: CursorStack): boolean {
  return stack.length > 1;
}

/**
 * Hide the pager on a failed read. Back/Next over a page that never arrived would be walking a
 * cursor trail the store never confirmed.
 */
export function shouldShowPager(
  stack: CursorStack,
  nextCursor: string | null | undefined,
  isError: boolean,
): boolean {
  if (isError) return false;
  return canGoBack(stack) || Boolean(nextCursor);
}

/**
 * An unset filter is an omitted key, not an `undefined` value. This object goes into the
 * TanStack query key, where `{ sourceType: undefined }` and `{}` are two different cache
 * entries for one screen — the same page would refetch on every toggle back to "Everything".
 */
export function buildKnowledgeQuery({
  sourceTab,
  factCategory,
  cursor,
  pageSize = KNOWLEDGE_PAGE_SIZE,
}: {
  sourceTab: SourceTab;
  factCategory?: string | null;
  cursor?: string | null;
  pageSize?: number;
}): WorkspaceKnowledgeQuery {
  return {
    ...(sourceTab === "all" ? {} : { sourceType: sourceTab }),
    ...(factCategory ? { factCategory } : {}),
    ...(cursor ? { cursor } : {}),
    pageSize,
  };
}

export const SOURCE_FALLBACK_LABELS: Record<string, string> = {
  document: "Document",
  meeting_summary: "Meeting summary",
  glossary: "Glossary term",
  workspace_context: "Workspace context",
};

/**
 * An unknown source type is labelled as itself rather than hidden or mislabelled: a producer
 * this screen has not been taught about is a real row, and showing its raw type is more honest
 * — and more debuggable — than calling it a document.
 */
export function sourceLabel(
  chunk: Pick<WorkspaceKnowledgeChunkDto, "sourceType" | "sourceTitle" | "documentName">,
): string {
  return (
    chunk.sourceTitle ||
    chunk.documentName ||
    SOURCE_FALLBACK_LABELS[chunk.sourceType] ||
    chunk.sourceType
  );
}

export function hasAnyFact(items: readonly Pick<WorkspaceKnowledgeChunkDto, "fact">[]): boolean {
  return items.some((chunk) => Boolean(chunk.fact));
}

/**
 * Facts, newest source first, with each source's facts kept together.
 *
 * Two rules, and the order they are applied in is the whole point.
 *
 * GROUPING exists because the API returns a page in whatever order the query produced, so two
 * facts from the SAME meeting could sit rows apart with other meetings in between. Someone
 * scanning the Source column could not tell where one meeting's knowledge ended.
 *
 * ORDERING exists because grouping alone was originally done with `groupKey.localeCompare`,
 * which sorts sources by their NAME. That is what made the page read "a", "â", "ac", "ac",
 * "ac" — an alphabetical index of meeting titles, in which the meeting that just finished is
 * somewhere in the middle. This page is read to answer "what do we know now", and the answer
 * has to start at the top.
 *
 * So groups are ordered by their most recent `indexedAtMs`, descending, and only the rows
 * WITHIN a group fall back to chunkIndex — a document still reads in its own order.
 *
 * Rows with no `indexedAtMs` — everything indexed before the producer began stamping one —
 * sort last as a block, still grouped, still alphabetical among themselves. They are genuinely
 * undated, and floating them to the top by treating null as 0 or as now would both be lies.
 *
 * SCOPE: this orders the page you are looking at. The server paginates at 50, so a source split
 * across a page boundary stays split, and page two is not necessarily older than page one —
 * ordering across pages means moving this into the Qdrant query, which needs a payload index on
 * `indexed_at` and a different pagination model than the opaque cursor the API returns today.
 */
export function orderKnowledgeChunks<
  T extends Pick<
    WorkspaceKnowledgeChunkDto,
    | "sourceType"
    | "sourceTitle"
    | "documentName"
    | "documentId"
    | "chunkIndex"
    | "indexedAtMs"
  >,
>(chunks: readonly T[]): T[] {
  // documentId before the label: two meetings can share a title, and grouping on the label
  // alone would file knowledge from different meetings under one heading.
  const groupKey = (chunk: T) =>
    `${chunk.sourceType} ${chunk.documentId ?? sourceLabel(chunk)}`;

  // A group is as new as its newest chunk. Using the first row's stamp instead would order
  // groups by whichever of their chunks happened to arrive first in the page.
  const newestByGroup = new Map<string, number>();
  for (const chunk of chunks) {
    const key = groupKey(chunk);
    const stamp = chunk.indexedAtMs;
    if (typeof stamp !== "number") continue;
    const known = newestByGroup.get(key);
    if (known === undefined || stamp > known) newestByGroup.set(key, stamp);
  }

  return [...chunks].sort((left, right) => {
    const leftKey = groupKey(left);
    const rightKey = groupKey(right);

    if (leftKey !== rightKey) {
      const leftStamp = newestByGroup.get(leftKey);
      const rightStamp = newestByGroup.get(rightKey);

      // Undated groups as a block at the bottom, in a stable order of their own rather than an
      // arbitrary one.
      if (leftStamp === undefined && rightStamp === undefined) {
        return leftKey.localeCompare(rightKey);
      }
      if (leftStamp === undefined) return 1;
      if (rightStamp === undefined) return -1;

      if (leftStamp !== rightStamp) return rightStamp - leftStamp;
      // Same millisecond — indexed by the same batch. Fall through to a stable tiebreak so the
      // order does not depend on the engine's sort implementation.
      return leftKey.localeCompare(rightKey);
    }

    // Nulls last: a chunk with no index is not "index 0", and treating it as one would push a
    // document's real opening chunk down the list.
    const leftIndex = left.chunkIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.chunkIndex ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}
