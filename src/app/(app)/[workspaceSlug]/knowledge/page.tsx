"use client";

/**
 * What the system has indexed about this workspace.
 *
 * The reference for this screen was Mem0's memory table, but only for *what* it shows — a row
 * per stored piece with the extracted fact readable at a glance.
 *
 * The chrome is the WORKSPACE chrome (WorkspacePage / WorkspaceBody), not the admin portal's.
 * It used to be the latter, which is why this page arrived wearing a 30px "Knowledge" title under
 * a breadcrumb already reading "knowledge", a paragraph of documentation, and a panel floating on
 * a grey wash while Meetings and Members next door open straight onto their content on white. The
 * listing is the page.
 *
 * NO TOOLBAR ROW. It held one Refresh button, and a manual refresh is the wrong control here:
 * the query already refetches on focus and after every edit, so the button's only reliable
 * effect was to push the filters and the table a toolbar's height down the screen while every
 * neighbouring page starts at the top. Removing it removes the gap.
 *
 * Owner/Admin can read it. Only the Owner can change it, and the API enforces both
 * independently — this page hiding a control is a courtesy, not the control.
 *
 * The listing itself is `KnowledgeTable`, shared with the admin portal's Knowledge tab. It owns
 * the source and fact-category tabs; this page owns the member-scoped query and the row sheet.
 * The admin tab passes no `onSelect`, so its rows stay inert: a platform admin can see what a
 * workspace has indexed, and editing it belongs to the workspace.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import { Brain } from "@phosphor-icons/react/dist/ssr";

import { KnowledgeChunkSheet } from "@/components/knowledge/knowledge-chunk-sheet";
import { KnowledgeTable } from "@/components/knowledge/knowledge-table";
import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
} from "@/components/workspace/page-chrome";
import { useKnowledgeFilters } from "@/hooks/use-knowledge-filters";
import { useWorkspaceKnowledge } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { WorkspaceKnowledgeChunkDto } from "@/types/workspace-knowledge";

export default function WorkspaceKnowledgePage() {
  const params = useParams();
  const workspaceSlug = String(params?.workspaceSlug ?? "");
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceStore((state) => state.role);
  const normalizedRole = role?.toLowerCase();
  const isOwner = normalizedRole === "owner";
  const isOwnerOrAdmin = isOwner || normalizedRole === "admin";

  const filters = useKnowledgeFilters();
  const { data, isLoading, isError, refetch, isFetching } = useWorkspaceKnowledge(
    workspaceId ?? "",
    filters.query,
  );

  // The id, not the object: the sheet must keep showing the row the user opened even after a
  // refetch replaces the array, and it must close by itself if that row is no longer in the
  // page — which is exactly what happens when the Owner deletes it.
  const [openChunkId, setOpenChunkId] = useState<string | null>(null);
  const openChunk =
    data?.items.find((chunk) => chunk.chunkId === openChunkId) ?? null;

  if (!isOwnerOrAdmin) {
    return (
      <WorkspacePage>
        <WorkspaceBody className="pt-6">
          <WorkspaceEmptyState
            icon={<Brain size={28} weight="duotone" />}
            title="Only a workspace Owner or Admin can see what has been indexed"
            description="Ask a workspace Owner or Admin if you need to know what WarpTalk holds for this workspace."
          />
        </WorkspaceBody>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceBody className="pt-3">
        <KnowledgeTable
          filters={filters}
          data={data}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          onRetry={() => refetch()}
          onSelect={(chunk: WorkspaceKnowledgeChunkDto) => setOpenChunkId(chunk.chunkId)}
          emptyHint="Upload a document or finish a meeting so it gets a summary, and what the system keeps will appear here."
        />
      </WorkspaceBody>

      <KnowledgeChunkSheet
        workspaceId={workspaceId ?? ""}
        chunk={openChunk}
        canEdit={isOwner}
        onClose={() => setOpenChunkId(null)}
      />

      <p className="sr-only">Workspace {workspaceSlug}</p>
    </WorkspacePage>
  );
}
