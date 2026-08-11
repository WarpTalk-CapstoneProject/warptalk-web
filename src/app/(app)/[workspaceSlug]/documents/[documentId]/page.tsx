"use client";

import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  ShieldWarning,
  Spinner,
  X,
} from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { use, useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

interface PageProps {
  params: Promise<{ documentId: string }>;
}

interface MemberLookupItem {
  userId: string;
  fullName: string;
  email: string;
}

export default function DocumentDetailPage({ params }: PageProps) {
  const { documentId } = use(params);
  const router = useRouter();
  const routeParams = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = routeParams.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const documentQuery = useWorkspaceDocument(
    activeWorkspaceId || "",
    documentId,
  );

  useEffect(() => {
    if (documentQuery.isError) {
      toast.error("Document no longer exists or has been hidden.");
      router.push(`/${workspaceSlug}/documents`);
    }
  }, [documentQuery.isError, router, workspaceSlug]);

  const {
    policiesList,
    membersList,
    isExternalAllowed,
    isSubmitting,
    toggleExternalAccess,
    allowUser,
    blockUser,
    removePolicy,
  } = useDocumentAccessPolicy(activeWorkspaceId || "", documentId);

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
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  if (documentQuery.isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-canvas text-ink">
        <Spinner className="h-8 w-8 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-[80vh] items-center justify-center px-4">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface-2 text-ink-muted">
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
              className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-xs font-semibold text-background transition hover:opacity-90"
            >
              Back to Documents
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4 overflow-hidden px-4 py-4 text-ink animate-fade-in">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline/60 pb-3">
        <button
          onClick={() => router.push(`/${workspaceSlug}/documents`)}
          className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Library</span>
        </button>

        <div className="flex min-w-0 items-center justify-end gap-3">
          <div className="min-w-0 text-right">
            <h1 className="truncate text-sm font-bold tracking-tight text-ink sm:text-base">
              {doc.name}
            </h1>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
              {doc.fileName}
            </p>
          </div>

          {canApproveDocuments && isPendingApproval ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => handleApprove(true)}
                disabled={approveMutation.isPending}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-foreground px-3.5 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
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
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/70 bg-surface-2 px-3.5 text-xs font-semibold text-ink-muted shadow-sm transition hover:bg-surface-3 hover:text-ink disabled:opacity-50"
                title="Reject Document"
              >
                {approveMutation.isPending ? (
                  <Spinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                <span>Reject</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 items-start gap-6 overflow-hidden lg:grid-cols-[minmax(240px,1fr)_minmax(0,3fr)]">
        <section className="min-w-0 self-start rounded-xl border border-hairline/70 bg-surface-1">
          <div className="flex h-12 items-center justify-between border-b border-hairline/60 px-5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-ink-muted" />
              <h2 className="text-sm font-semibold">File information</h2>
            </div>
            <button
              onClick={handleDownload}
              disabled={downloadMutation.isPending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-border/60 px-3 text-xs font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              title="Download file"
            >
              {downloadMutation.isPending ? (
                <Spinner className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Download</span>
            </button>
          </div>

          <div className="grid gap-4 p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-ink-muted">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {doc.fileName}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {formatBytes(doc.sizeBytes)} /{" "}
                  {doc.fileExtension.replace(".", "").toUpperCase() || "DOC"}
                </p>
              </div>
            </div>

            <div className="grid gap-2 text-xs">
              <DocumentDetailRow label="Document status">
                <DocumentStatusBadge status={doc.status} />
              </DocumentDetailRow>
              <DocumentDetailRow label="AI ingestion">
                <DocumentIngestionBadge status={doc.ingestionStatus} />
              </DocumentDetailRow>
              <DocumentDetailRow label="AI context">
                <span className="font-medium text-ink">
                  {doc.isAiAllowed ? "Allowed" : "Disabled"}
                </span>
              </DocumentDetailRow>
              <DocumentDetailRow label="Uploaded by">
                <span className="font-medium text-ink">
                  {getMemberName(membersList, doc.uploadedBy)}
                </span>
              </DocumentDetailRow>
              <DocumentDetailRow label="Uploaded at">
                <span className="font-medium text-ink">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
              </DocumentDetailRow>
            </div>
          </div>
        </section>

        <section className="h-full min-h-0 min-w-0">
          <DocumentAccessPolicyPanel
            canManagePolicies={canManagePolicies}
            isExternalAllowed={isExternalAllowed}
            isSubmitting={isSubmitting}
            policiesList={policiesList}
            membersList={membersList}
            protectedUserIds={[doc.uploadedBy]}
            toggleExternalAccess={toggleExternalAccess}
            allowUser={allowUser}
            blockUser={blockUser}
            removePolicy={removePolicy}
          />
        </section>
      </div>
    </div>
  );
}

function DocumentDetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b border-hairline/40 py-2 last:border-b-0">
      <span className="text-ink-muted">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function DocumentStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className="rounded border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-muted"
    >
      {status}
    </Badge>
  );
}

function DocumentIngestionBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className="rounded border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-muted"
    >
      {status || "Pending"}
    </Badge>
  );
}

function getMemberName(
  membersList: MemberLookupItem[],
  userId?: string | null,
) {
  if (!userId) return "System / Uploader";
  const member = membersList.find((item) => item.userId === userId);
  return member?.fullName || member?.email || "System / Uploader";
}
