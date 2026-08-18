"use client";

import { useMemo, useState } from "react";

import {
  buildKnowledgeQuery,
  currentCursor,
  initialCursorStack,
  popCursor,
  pushCursor,
  type CursorStack,
  type SourceTab,
} from "@/lib/knowledge/knowledge-view";
import type { WorkspaceKnowledgeQuery } from "@/types/workspace-knowledge";

/**
 * Filter and cursor state for a knowledge listing.
 *
 * A hook rather than state inside `KnowledgeTable` because the caller has to hold the assembled
 * query to pass it to its own data hook — the workspace page and the admin tab read the same
 * index through different endpoints. Keeping both `useKnowledgeFilters()` and the query hook at
 * the top level of the calling component is also what keeps this lint-clean: a render prop that
 * called the query hook for us would be calling a hook from a callback.
 */
export type RetrievalTab = "all" | "enabled" | "disabled";

export interface KnowledgeFilters {
  sourceTab: SourceTab;
  retrievalTab: RetrievalTab;
  factCategory: string | null;
  cursorStack: CursorStack;
  query: WorkspaceKnowledgeQuery;
  setSourceTab: (tab: SourceTab) => void;
  setRetrievalTab: (tab: RetrievalTab) => void;
  setFactCategory: (category: string | null) => void;
  goBack: () => void;
  goNext: (nextCursor: string | null) => void;
}

export function useKnowledgeFilters(): KnowledgeFilters {
  const [sourceTab, setSourceTabState] = useState<SourceTab>("all");
  const [retrievalTab, setRetrievalTabState] = useState<RetrievalTab>("all");
  const [factCategory, setFactCategoryState] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<CursorStack>(initialCursorStack);

  const cursor = currentCursor(cursorStack);

  const query = useMemo(
    () => buildKnowledgeQuery({ sourceTab, factCategory, cursor }),
    [sourceTab, factCategory, cursor],
  );

  // Any filter change invalidates the cursor trail: a token from one filter does not point
  // anywhere meaningful in another's result set.
  return {
    sourceTab,
    retrievalTab,
    factCategory,
    cursorStack,
    query,
    setSourceTab: (tab) => {
      setSourceTabState(tab);
      setCursorStack(initialCursorStack());
    },
    setRetrievalTab: (tab) => {
      setRetrievalTabState(tab);
      setCursorStack(initialCursorStack());
    },
    setFactCategory: (category) => {
      setFactCategoryState(category);
      setCursorStack(initialCursorStack());
    },
    goBack: () => setCursorStack((stack) => popCursor(stack)),
    goNext: (nextCursor) => setCursorStack((stack) => pushCursor(stack, nextCursor)),
  };
}
