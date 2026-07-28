"use client";

import { useEffect } from "react";
import { useAssistantContextStore } from "@/stores/assistant-context-store";
import type { AssistantPageContextDto } from "@/types/assistant";

/**
 * Registers the calling page's ambient context with the global "Ask WarpTalk" widget, so a
 * message sent while this page is mounted carries pageType/entityId/snapshot automatically.
 * Pass `null` (or omit) while the page's own data hasn't loaded yet — the effect no-ops.
 */
export function useRegisterAssistantContext(
  context: AssistantPageContextDto | null | undefined,
) {
  const setPageContext = useAssistantContextStore(
    (state) => state.setPageContext,
  );
  const clearPageContext = useAssistantContextStore(
    (state) => state.clearPageContext,
  );

  const entityId = context?.entityId;
  const workspaceId = context?.workspaceId;
  const pageType = context?.pageType;
  const snapshotKey = context?.snapshot
    ? JSON.stringify(context.snapshot)
    : undefined;

  useEffect(() => {
    if (!pageType) return;
    setPageContext({
      pageType,
      entityId,
      workspaceId,
      snapshot: snapshotKey ? JSON.parse(snapshotKey) : undefined,
    });
    return () => clearPageContext(pageType);
  }, [
    pageType,
    entityId,
    workspaceId,
    snapshotKey,
    setPageContext,
    clearPageContext,
  ]);
}
