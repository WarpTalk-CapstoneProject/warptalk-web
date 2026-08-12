"use client";

/**
 * What the system has indexed about this workspace.
 *
 * The reference for this screen was Mem0's memory table, but only for *what* it shows — a row
 * per stored piece with the extracted fact readable at a glance.
 *
 * The chrome is the WORKSPACE chrome (WorkspacePage / WorkspaceToolbar), not the admin portal's.
 * It used to be the latter, which is why this page arrived wearing a 30px "Knowledge" title under
 * a breadcrumb already reading "knowledge", a paragraph of documentation, and a panel floating on
 * a grey wash while Meetings and Members next door open straight onto their content on white. The
 * listing is the page; the toolbar is the only furniture it gets.
 *
 * Owner/Admin only, and the API enforces that independently — this page hiding itself is a
 * courtesy, not the control.
 *
 * The listing itself is `KnowledgeTable`, shared with the admin portal's Knowledge tab, and is
 * deliberately untouched here: it owns its own source and fact-category tabs, and the admin tab
 * renders the same component. This page owns only the chrome around it and the member-scoped query.
 */

import { useParams } from "next/navigation";
import { ArrowClockwise, Brain } from "@phosphor-icons/react/dist/ssr";

import { KnowledgeTable } from "@/components/knowledge/knowledge-table";
import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspaceSecondaryButton,
  WorkspaceToolbar,
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
      <WorkspaceToolbar
        actions={
          <WorkspaceSecondaryButton
            onClick={() => refetch()}
            disabled={isFetching}
            icon={<ArrowClockwise size={13} weight="bold" />}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </WorkspaceSecondaryButton>
        }
      />

      <WorkspaceBody>
        <KnowledgeTable
          filters={filters}
          data={data}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          onRetry={() => refetch()}
          emptyHint="Upload a document or finish a meeting so it gets a summary, and what the system keeps will appear here."
        />
      </WorkspaceBody>

      <p className="sr-only">Workspace {workspaceSlug}</p>
    </WorkspacePage>
  );
}
