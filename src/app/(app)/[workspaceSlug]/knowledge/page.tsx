"use client";

/**
 * What the system has indexed about this workspace.
 *
 * The reference for this screen was Mem0's memory table, but only for *what* it shows — a row
 * per stored piece with the extracted fact readable at a glance. Not for how it looks: Mem0's
 * dark chrome would sit as a foreign object in a light app. So the page is built from the
 * shared admin chrome (AdminPage / AdminPageHeader / AdminFilterTabs / AdminPanel), the same
 * furniture the platform pages settled on, and reads as part of WarpTalk.
 *
 * Owner/Admin only, and the API enforces that independently — this page hiding itself is a
 * courtesy, not the control.
 *
 * The listing itself is `KnowledgeTable`, shared with the admin portal's Knowledge tab. This
 * page owns only the chrome around it and the member-scoped query.
 */

import { useParams } from "next/navigation";
import { Brain } from "@phosphor-icons/react/dist/ssr";

import {
  AdminPage,
  AdminPageHeader,
} from "@/components/admin/admin-page-chrome";
import { KnowledgeTable } from "@/components/knowledge/knowledge-table";
import { Button } from "@/components/ui/button";
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
      <AdminPage>
        <AdminPageHeader
          eyebrow="Workspace knowledge"
          eyebrowIcon={<Brain size={13} weight="bold" />}
          title="Knowledge"
        />
        <p className="mt-6 text-[13px] text-ink-muted">
          Only a workspace Owner or Admin can see what has been indexed.
        </p>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Workspace knowledge"
        eyebrowIcon={<Brain size={13} weight="bold" />}
        title="Knowledge"
        description="The durable knowledge WarpTalk holds for this workspace — uploaded documents, meeting summaries and glossary terms, with the fact drawn from each. Raw transcript lines stay searchable by WarpBot but are not listed here."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <KnowledgeTable
        filters={filters}
        data={data}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => refetch()}
        emptyHint="Upload a document or finish a meeting so it gets a summary, and what the system keeps will appear here."
      />

      <p className="sr-only">Workspace {workspaceSlug}</p>
    </AdminPage>
  );
}
