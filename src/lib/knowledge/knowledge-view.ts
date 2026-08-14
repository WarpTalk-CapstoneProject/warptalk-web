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
 * Facts, grouped by the thing they came from.
 *
 * The API returns a page in whatever order the query produced, so two facts extracted from the
 * SAME meeting could sit rows apart with other meetings in between — which is exactly how the
 * page read: "knihc", "Tuấn bùi", "Test Audio…", "test", "â", "Tuấn bùi" again. Someone
 * scanning the Source column cannot tell where one meeting's knowledge ends and the next starts.
 *
 * Grouped by source, then by chunkIndex so a document reads in its own order rather than an
 * arbitrary one. The sort is stable, so rows the server already ordered sensibly keep that order
 * within their group.
 *
 * SCOPE: this orders the page you are looking at. The server paginates at 50, so a source split
 * across a page boundary stays split — grouping across pages means moving the ordering into the
 * query itself.
 */
export function orderKnowledgeChunks<
  T extends Pick<
    WorkspaceKnowledgeChunkDto,
    "sourceType" | "sourceTitle" | "documentName" | "documentId" | "chunkIndex"
  >,
>(chunks: readonly T[]): T[] {
  // documentId before the label: two meetings can share a title, and grouping on the label
  // alone would file knowledge from different meetings under one heading.
  const groupKey = (chunk: T) =>
    `${chunk.sourceType} ${chunk.documentId ?? sourceLabel(chunk)}`;

  return [...chunks].sort((left, right) => {
    const byGroup = groupKey(left).localeCompare(groupKey(right));
    if (byGroup !== 0) return byGroup;

    // Nulls last: a chunk with no index is not "index 0", and treating it as one would push a
    // document's real opening chunk down the list.
    const leftIndex = left.chunkIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.chunkIndex ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}
