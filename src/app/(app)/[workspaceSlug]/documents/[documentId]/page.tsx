"use client";

import {
  ArrowLeft,
  Check,
  Download,
  ShieldWarning,
  Spinner,
  X,
} from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WORKSPACE_DOCUMENT_STATUS } from "@/constants/workspace-document";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { useDocumentAccessPolicy } from "@/hooks/use-document-access-policy";
import {
  useApproveWorkspaceDocument,
  useDownloadWorkspaceDocument,
  useWorkspace,
  useWorkspaceDocument,
} from "@/hooks/use-workspace";
import { downloadBlob } from "@/lib/ui/download-blob";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { DocumentAccessPolicyPanel } from "./components/DocumentAccessPolicyPanel";
import { DocumentPreview } from "./components/DocumentPreview";
import { DocumentMetadataCard } from "./components/DocumentMetadataCard";

interface PageProps {
  params: Promise<{ documentId: string }>;
}

export default function DocumentDetailPage({ params }: PageProps) {
  const { documentId } = use(params);
  const router = useRouter();
  const routeParams = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = routeParams.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  // Queries & Hooks
  const documentQuery = useWorkspaceDocument(
    activeWorkspaceId || "",
    documentId,
  );

  // Graceful Failure: If document is deleted, archived, or not found, warn user and redirect back to list
  useEffect(() => {
    if (documentQuery.isError) {
      toast.error("Document no longer exists or has been hidden.");
      router.push(`/${workspaceSlug}/documents`);
    }
  }, [documentQuery.isError, router, workspaceSlug]);

  // Custom Document Access Policy Hook
  const {
    policiesList,
    membersList,
    isExternalAllowed,
    isSubmitting,
    showAllowedDropdown,
    showBlockedDropdown,
    setShowAllowedDropdown,
    setShowBlockedDropdown,
    toggleExternalAccess,
    allowUser,
    blockUser,
    removePolicy,
  } = useDocumentAccessPolicy(activeWorkspaceId || "", documentId);

  // Mutations
  const downloadMutation = useDownloadWorkspaceDocument(
    activeWorkspaceId || "",
  );
  const approveMutation = useApproveWorkspaceDocument(activeWorkspaceId || "");
  const doc = documentQuery.data;
  const canApproveDocuments = Boolean(workspaceQuery.data?.canApproveDocuments);
  const isPendingApproval = Boolean(
    doc?.status?.toLowerCase() === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL ||
    doc?.status?.toLowerCase().includes("pending"),
  );

  useRegisterAssistantContext(
    doc
      ? {
          pageType: "document_detail",
          entityId: documentId,
          workspaceId: activeWorkspaceId ?? undefined,
          snapshot: {
            name: doc.name,
            status: doc.status,
            ingestionStatus: doc.ingestionStatus,
          },
        }
      : null,
  );

  if (!activeWorkspaceId) return null;

  // Strictly Workspace Owner / Admin only (excluding regular uploaders)
  const canManagePolicies = canApproveDocuments;

  const handleDownload = async () => {
    if (!doc) return;
    try {
      const result = await downloadBlob(
        () => downloadMutation.mutateAsync(doc.id),
        doc.fileName,
      );
      if (result === "picker") toast.success("File saved successfully!");
      if (result === "download") toast.success("Downloading file...");
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to download document.";
      toast.error(errorMsg);
    }
  };

  const handleApprove = async (approve: boolean) => {
    try {
      await approveMutation.mutateAsync({ docId: documentId, approve });
      toast.success(
        approve ? "Document approved for ingestion." : "Document rejected.",
      );
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Action failed.";
      toast.error(errorMsg);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (documentQuery.isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center text-ink bg-canvas">
        <Spinner className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-[80vh] items-center justify-center px-4">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldWarning className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">
              Document Not Found
            </CardTitle>
            <CardDescription className="text-xs">
              The requested document does not exist or has been deleted from
              this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => router.push(`/${workspaceSlug}/documents`)}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary text-xs font-semibold text-white px-4 hover:bg-primary-hover transition"
            >
              Back to Documents
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    /* h-full + min-h-0, not min-h-full: the page owns the viewport and the panes scroll inside
       it. With min-h-full the whole page grew with the document, which is what pushed the
       properties panel off the top of a 40KB report and made it unreachable without scrolling
       back past everything. */
    <div className="flex h-full min-h-0 flex-col gap-6 px-4 py-4 pb-8 text-ink animate-fade-in max-w-7xl mx-auto w-full">
      {/* Back button & Header */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => router.push(`/${workspaceSlug}/documents`)}
          className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink w-fit transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Library</span>
        </button>
        {/* An 18px title, not 24px bold, and the raw UUID is gone: "ID: abb02cc4-6593-…" under the
            name was the second-largest thing on the page and is not something anyone reads — the
            properties panel carries the identifiers.

            Three filled buttons in three different colours (green, pink, indigo) read as three
            equally urgent decisions. Only one action is primary here — Approve when a decision is
            pending, otherwise Download — and the rest are outlined pills, the same shapes the
            meetings and members toolbars use. */}
        <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h1 className="min-w-0 truncate text-[18px] font-semibold tracking-tight text-ink">
            {doc.name}
          </h1>

          <div className="flex shrink-0 items-center gap-2">
            {canApproveDocuments && isPendingApproval && (
              <>
                <button
                  onClick={() => handleApprove(true)}
                  disabled={approveMutation.isPending}
                  className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
                  title="Approve document"
                >
                  {approveMutation.isPending ? (
                    <Spinner className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>Approve</span>
                </button>
                <button
                  onClick={() => handleApprove(false)}
                  disabled={approveMutation.isPending}
                  className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-destructive/30 bg-surface-1 px-3 text-[13px] font-medium text-destructive shadow-sm transition hover:bg-destructive/10 disabled:opacity-50"
                  title="Reject document"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Reject</span>
                </button>
                <div className="mx-1 h-4 w-[1px] bg-border" />
              </>
            )}
            <button
              onClick={handleDownload}
              disabled={downloadMutation.isPending}
              className={
                canApproveDocuments && isPendingApproval
                  ? "inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2 disabled:opacity-50"
                  : "inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
              }
            >
              {downloadMutation.isPending ? (
                <Spinner className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Original File Card vs Right (Properties Sidebar) */}
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* Central panel — the document itself.
            It used to be a card containing a second card containing the file's NAME, size,
            format badge and a Download button: everything about the file except the file. The
            page asks you to approve a document, so the document is what belongs here, flat, with
            no chrome between the reader and the text. The name and format live in the properties
            panel to the right, which already lists them. */}
        {/* The scroll lives HERE, on the document, not on the page. */}
        <div className="flex min-h-0 min-w-0 flex-col gap-6 overflow-y-auto lg:h-full">
          <DocumentPreview
            workspaceId={activeWorkspaceId}
            documentId={doc.id}
            fileName={doc.fileName}
            fileExtension={doc.fileExtension}
            sizeBytes={doc.sizeBytes}
            onDownload={handleDownload}
          />
        </div>

        {/* Right sidebar: sticky, and scrolls on its own when its own content is tall. It stays
            beside the document however long the document is — approving a file means reading it
            AND checking who it will be shared with, and those two facts were previously never on
            screen at the same time. */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-0 lg:max-h-full lg:overflow-y-auto lg:pb-2">
          <DocumentMetadataCard
            doc={doc}
            membersList={membersList}
            formatBytes={formatBytes}
          />

          <DocumentAccessPolicyPanel
            canManagePolicies={canManagePolicies}
            isExternalAllowed={isExternalAllowed}
            isSubmitting={isSubmitting}
            policiesList={policiesList}
            membersList={membersList}
            showAllowedDropdown={showAllowedDropdown}
            showBlockedDropdown={showBlockedDropdown}
            setShowAllowedDropdown={setShowAllowedDropdown}
            setShowBlockedDropdown={setShowBlockedDropdown}
            toggleExternalAccess={toggleExternalAccess}
            allowUser={allowUser}
            blockUser={blockUser}
            removePolicy={removePolicy}
          />
        </div>
      </div>
    </div>
  );
}
