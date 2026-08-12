"use client";

/**
 * What the system has indexed about this workspace.
 *
 * The listing is the page; the toolbar is the only furniture it gets. Owner/Admin only, and the
 * API enforces that independently.
 */

import { ArrowClockwise, Brain } from "@phosphor-icons/react/dist/ssr";
import { useParams } from "next/navigation";

import { KnowledgeTable } from "@/components/knowledge/knowledge-table";
import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspaceSecondaryButton,
} from "@/components/workspace/page-chrome";
import { useKnowledgeFilters } from "@/hooks/use-knowledge-filters";
import { useWorkspaceKnowledge } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function WorkspaceKnowledgePage() {
  const params = useParams();
  const workspaceSlug = String(params?.workspaceSlug ?? "");
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceStore((state) => state.role);
  const isOwnerOrAdmin =
    role?.toLowerCase() === "owner" || role?.toLowerCase() === "admin";

  const filters = useKnowledgeFilters();
  const { data, isLoading, isError, refetch, isFetching } = useWorkspaceKnowledge(
    workspaceId ?? "",
    filters.query,
  );

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
      <WorkspaceBody className="px-0">
        <KnowledgeTable
          filters={filters}
          data={data}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          onRetry={() => refetch()}
          emptyHint="Upload a document or finish a meeting so it gets a summary, and what the system keeps will appear here."
          toolbarActions={
            <WorkspaceSecondaryButton
              onClick={() => refetch()}
              disabled={isFetching}
              icon={<ArrowClockwise size={13} weight="bold" />}
            >
              {isFetching ? "Refreshing..." : "Refresh"}
            </WorkspaceSecondaryButton>
          }
        />
      </WorkspaceBody>

      <p className="sr-only">Workspace {workspaceSlug}</p>
    </WorkspacePage>
  );
}
