"use client";

import { use, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldWarning,
  ArrowLeft,
  Spinner,
  Plus,
  Download,
  Lock,
  Check,
  X,
  FileText,
} from "@phosphor-icons/react";

import {
  WORKSPACE_DOCUMENT_STATUS,
} from "@/constants/workspace-document";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useWorkspaceDocument,
  useDownloadWorkspaceDocument,
  useApproveWorkspaceDocument,
  useWorkspace,
} from "@/hooks/use-workspace";
import { useDocumentAccessPolicy } from "@/hooks/use-document-access-policy";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { downloadBlob } from "@/lib/download-blob";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

import { DocumentAccessPolicyPanel } from "./components/DocumentAccessPolicyPanel";
import { DocumentMetadataCard } from "./components/DocumentMetadataCard";

interface PageProps {
  params: Promise<{ documentId: string }>;
}

export default function DocumentDetailPage({ params }: PageProps) {
  const { documentId } = use(params);
  const router = useRouter();
  const routeParams = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = routeParams.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((s: any) => s.activeWorkspaceId);
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  // Queries & Hooks
  const documentQuery = useWorkspaceDocument(activeWorkspaceId || "", documentId);

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
  const downloadMutation = useDownloadWorkspaceDocument(activeWorkspaceId || "");
  const approveMutation = useApproveWorkspaceDocument(activeWorkspaceId || "");
  const doc = documentQuery.data;
  const canApproveDocuments = Boolean(workspaceQuery.data?.canApproveDocuments);
  const isPendingApproval = Boolean(
    doc?.status?.toLowerCase() === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL ||
    doc?.status?.toLowerCase().includes("pending")
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
      : null
  );

  if (!activeWorkspaceId) return null;

  // Strictly Workspace Owner / Admin only (excluding regular uploaders)
  const canManagePolicies = canApproveDocuments;

  const handleDownload = async () => {
    if (!doc) return;
    try {
      const result = await downloadBlob(() => downloadMutation.mutateAsync(doc.id), doc.fileName);
      if (result === "picker") toast.success("File saved successfully!");
      if (result === "download") toast.success("Downloading file...");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || "Failed to download document.";
      toast.error(errorMsg);
    }
  };

  const handleApprove = async (approve: boolean) => {
    try {
      await approveMutation.mutateAsync({ docId: documentId, approve });
      toast.success(approve ? "Document approved for ingestion." : "Document rejected.");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || "Action failed.";
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
            <CardTitle className="text-lg font-bold">Document Not Found</CardTitle>
            <CardDescription className="text-xs">
              The requested document does not exist or has been deleted from this workspace.
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
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-8 text-ink animate-fade-in max-w-7xl mx-auto w-full">
      {/* Back button & Header */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => router.push(`/${workspaceSlug}/documents`)}
          className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink w-fit transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Library</span>
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink break-all">{doc.name}</h1>
            <p className="text-[11px] text-ink-muted mt-1 font-mono">
              ID: {doc.id}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canApproveDocuments && isPendingApproval && (
              <div className="flex items-center gap-2 mr-1">
                <button
                  onClick={() => handleApprove(true)}
                  disabled={approveMutation.isPending}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white px-3.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
                  title="Approve Document"
                >
                  {approveMutation.isPending ? (
                    <Spinner className="h-3.5 w-3.5 animate-spin text-white" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>Approve</span>
                </button>
                <button
                  onClick={() => handleApprove(false)}
                  disabled={approveMutation.isPending}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-xs font-semibold text-destructive px-3.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
                  title="Reject Document"
                >
                  {approveMutation.isPending ? (
                    <Spinner className="h-3.5 w-3.5 animate-spin text-destructive" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  <span>Reject</span>
                </button>
              </div>
            )}
            <button
              onClick={handleDownload}
              disabled={downloadMutation.isPending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary hover:bg-primary-hover text-xs font-semibold text-white px-3.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {downloadMutation.isPending ? (
                <Spinner className="h-3.5 w-3.5 animate-spin text-white" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Original File Card vs Right (Properties Sidebar) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        {/* Central panel - original file */}
        <div className="flex flex-col gap-6 min-w-0">
          <Card className="border-hairline bg-surface-1 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="border-b border-hairline px-5 py-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-sm font-semibold">Original File</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-hairline bg-surface-2 uppercase font-mono text-ink-muted">
                {doc.fileExtension.replace(".", "") || "DOC"}
              </Badge>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative rounded-xl border border-hairline bg-surface-2 p-6 flex flex-col gap-6">
                {/* Header row: File info + Download button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-base text-ink truncate">{doc.fileName}</span>
                      <span className="text-xs text-ink-muted mt-0.5">
                        {formatBytes(doc.sizeBytes)} • {doc.fileExtension.replace(".", "").toUpperCase() || "DOC"}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleDownload}
                    disabled={downloadMutation.isPending}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
                  >
                    {downloadMutation.isPending ? (
                      <Spinner className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span>Download File</span>
                  </button>
                </div>

                {/* Status Monitoring Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-hairline">
                  <div className="flex items-center justify-between bg-surface-1 border border-hairline rounded-lg px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-ink-muted">Document Status</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono uppercase rounded px-2 py-0.5 font-semibold ${
                        doc.status?.toLowerCase() === "public" || doc.status?.toLowerCase() === "active"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : doc.status?.toLowerCase().includes("pending")
                          ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          : doc.status?.toLowerCase() === "rejected"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-surface-3 border-hairline text-ink-muted"
                      }`}
                    >
                      {doc.status}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between bg-surface-1 border border-hairline rounded-lg px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-ink-muted">AI Ingestion Status</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono uppercase rounded px-2 py-0.5 font-semibold ${
                        doc.ingestionStatus?.toLowerCase() === "completed"
                          ? "bg-primary/10 text-primary border-primary/20"
                          : doc.ingestionStatus?.toLowerCase() === "processing"
                          ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                          : doc.ingestionStatus?.toLowerCase() === "failed"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-surface-3 border-hairline text-ink-muted"
                      }`}
                    >
                      {doc.ingestionStatus || "Pending"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar: Properties & Access Policies */}
        <div className="flex flex-col gap-6">
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
