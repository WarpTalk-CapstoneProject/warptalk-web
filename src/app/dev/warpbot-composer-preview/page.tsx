"use client";

/**
 * WarpBot's composer with no active workspace. WT-541.
 *
 * This is the admin-portal state: `/admin/...` lives outside `[workspaceSlug]`, so nothing
 * there ever sets an active workspace, and every turn was swallowed in silence by a send
 * button that looked alive.
 *
 * This page renders the REAL widget and clears the active workspace on mount, so what is on
 * screen here is what an admin sees. Not linked from anywhere.
 */

import { useEffect } from "react";
import { GlobalChatbot } from "@/components/layout/global-chatbot";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function WarpbotComposerPreviewPage() {
  useEffect(() => {
    useWorkspaceStore.getState().clearActiveWorkspace();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-end justify-end bg-surface-1 p-8">
      <p className="mb-4 self-start max-w-prose text-[13px] text-ink-subtle">
        No active workspace — the admin-portal state. Open WarpBot: the composer should say why
        it cannot send, and the send arrow should be dead rather than silently swallowing the
        message.
      </p>
      <GlobalChatbot />
    </div>
  );
}
