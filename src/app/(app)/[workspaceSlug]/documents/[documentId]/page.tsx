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
import { useTranslations } from "next-intl";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { useDocumentAccessPolicy } from "@/hooks/use-document-access-policy";
import {
  useApproveWorkspaceDocument,
  useDownloadWorkspaceDocument,
  usePatchWorkspaceDocumentMetadata,
  useReuploadWorkspaceDocument,
  useSetWorkspaceDocumentVisibility,
  useWorkspace,
  useWorkspaceDocument,
  useWorkspaceDocumentHistory,
  useWorkspaceMembers,
} from "@/hooks/use-workspace";
import { downloadBlob } from "@/lib/ui/download-blob";
import { documentActorName } from "@/lib/documents/document-actor";
import {
  canUploadRevision as canUploadRevisionFor,
  documentFileRevision,
  hasPendingRevision,
  isAwaitingReview,
  pendingRevisionFileRevision,
  shouldShowRejectionFeedback,
} from "@/lib/documents/document-review";
import {
  VISIBILITY_CONFIRM_COPY,
  visibilityActionFor,
  type VisibilityAction,
} from "@/lib/documents/document-visibility";
import { DocumentRejectDialog } from "@/components/documents/document-reject-dialog";
import { DocumentVisibilityDialog } from "@/components/documents/document-visibility-dialog";
import { DocumentReviewTrail } from "@/components/documents/document-review-trail";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { DocumentPreview } from "./components/DocumentPreview";
import { DocumentSidePanel } from "./components/DocumentSidePanel";

interface PageProps {
  params: Promise<{ documentId: string }>;
}

export default function DocumentDetailPage({ params }: PageProps) {
  const { documentId } = use(params);
  const t = useTranslations("documents.detail");
  const router = useRouter();
  const routeParams = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = routeParams.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const currentUser = useAuthStore((s) => s.user);
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  // Queries & Hooks
  const documentQuery = useWorkspaceDocument(
    activeWorkspaceId || "",
    documentId,
  );

  // Graceful Failure: If document is deleted, archived, or not found, warn user and redirect back to list
  useEffect(() => {
    if (documentQuery.isError) {
      toast.error(t("notFoundError"));
      router.push(`/${workspaceSlug}/documents`);
    }
  }, [documentQuery.isError, router, workspaceSlug, t]);

  // Custom Document Access Policy Hook
  const {
    policiesList,
    membersList,
    isExternalAllowed,
    isSubmitting,
    toggleExternalAccess,
    allowUser,
    blockUser,
    removePolicy,
    memberAccess,
    setMemberAccess,
  } = useDocumentAccessPolicy(activeWorkspaceId || "", documentId);

  // Mutations
  const downloadMutation = useDownloadWorkspaceDocument(
    activeWorkspaceId || "",
  );
  const approveMutation = useApproveWorkspaceDocument(activeWorkspaceId || "");
  // The switch that turns AI reading off again. The mutation and the endpoint behind it both
  // already existed; nothing on any screen had ever called them, so a document could be handed to
  // the assistant at upload and never taken back.
  const patchMetadataMutation = usePatchWorkspaceDocumentMetadata(
    activeWorkspaceId || "",
    documentId,
  );
  // WT-633. The revision route keeps the document id, so it keeps the approval trail and the
  // reviewer's reason — the delete-and-upload-again workaround destroyed both.
  const reuploadMutation = useReuploadWorkspaceDocument(
    activeWorkspaceId || "",
    documentId,
  );
  // The way back from "public". Before this the page could approve a document into the workspace
  // and had nothing that took it out again.
  const visibilityMutation = useSetWorkspaceDocumentVisibility(
    activeWorkspaceId || "",
    documentId,
  );
  const [pendingVisibilityAction, setPendingVisibilityAction] =
    useState<VisibilityAction | null>(null);
  const historyQuery = useWorkspaceDocumentHistory(
    activeWorkspaceId || "",
    documentId,
  );
  // The only source of faces and names for a user id on this page; the document DTO carries ids.
  const membersQuery = useWorkspaceMembers(activeWorkspaceId || "", 1, 100);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  // WT-854 — which file the preview shows while a corrected version waits: the approved one
  // (what every reader gets) or the pending one (what the reviewer is deciding about).
  const [previewSource, setPreviewSource] = useState<"approved" | "pending">("approved");
  const doc = documentQuery.data;
  const workspaceMembers = membersQuery.data?.items ?? [];
  const canApproveDocuments = Boolean(workspaceQuery.data?.canApproveDocuments);
  // WT-854 — a decision is owed either for a new upload (`pending_approval`) or for a corrected
  // version of a published document, which stays published while it waits.
  const isPendingApproval = Boolean(doc && isAwaitingReview(doc));
  const revisionPending = Boolean(doc && hasPendingRevision(doc));
  const canSeePendingRevision = Boolean(
    doc &&
      revisionPending &&
      (canApproveDocuments ||
        (currentUser?.id &&
          (doc.uploadedBy === currentUser.id ||
            doc.ownerId === currentUser.id ||
            doc.pendingRevision?.uploadedBy === currentUser.id))),
  );
  const showingPending = canSeePendingRevision && previewSource === "pending";

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
      if (result === "picker") toast.success(t("toasts.downloadSaved"));
      if (result === "download") toast.success(t("toasts.downloadStarted"));
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("toasts.downloadFailed");
      toast.error(errorMsg);
    }
  };

  /**
   * @param reason Required when rejecting. The API refuses a rejection without one, and so does
   * the dialog that collects it — the uploader is shown this sentence and nothing else, which is
   * the whole of WT-633.
   */
  const handleApprove = async (approve: boolean, reason?: string) => {
    try {
      const decidingRevision = revisionPending;
      await approveMutation.mutateAsync({ docId: documentId, approve, reason });
      setIsRejectDialogOpen(false);
      setPreviewSource("approved");
      toast.success(
        decidingRevision
          ? approve
            ? t("toasts.revisionApproved")
            : t("toasts.revisionRejected")
          : approve
            ? t("toasts.approved")
            : t("toasts.rejected"),
      );
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("toasts.approveActionFailed");
      toast.error(errorMsg);
    }
  };

  const handleUploadRevision = async (file: File, note: string) => {
    try {
      await reuploadMutation.mutateAsync({ file, note: note || undefined });
      toast.success(t("toasts.revisionSubmitted"));
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("toasts.revisionFailed");
      toast.error(errorMsg);
    }
  };

  const handleConfirmVisibility = async (action: VisibilityAction) => {
    try {
      await visibilityMutation.mutateAsync(
        action === "make_private" ? "private" : "public",
      );
      setPendingVisibilityAction(null);
      toast.success(VISIBILITY_CONFIRM_COPY[action].success);
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("toasts.visibilityChangeFailed");
      toast.error(errorMsg);
    }
  };

  const handleToggleAiIndexing = async (allowed: boolean) => {
    try {
      await patchMetadataMutation.mutateAsync({ isAiAllowed: allowed });
      toast.success(
        allowed ? t("toasts.aiIndexingEnabled") : t("toasts.aiIndexingDisabled"),
      );
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("toasts.aiIndexingFailed");
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
      <div className="flex h-[80vh] items-center justify-center text-ink">
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
              {t("notFound.title")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("notFound.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => router.push(`/${workspaceSlug}/documents`)}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary text-xs font-semibold text-white px-4 hover:bg-primary-hover transition"
            >
              {t("notFound.backToDocuments")}
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fileRevision = documentFileRevision(doc);
  // WT-854 — the pending file has its own revision, so it is its own cache entry and its own
  // reader; switching back to the approved file never shows the pending bytes, or the reverse.
  const pendingFileRevision = pendingRevisionFileRevision(doc);
  const previewRevision =
    showingPending && pendingFileRevision ? pendingFileRevision : fileRevision;
  const previewFile =
    showingPending && doc.pendingRevision
      ? {
          fileName: doc.pendingRevision.fileName,
          fileExtension: doc.pendingRevision.fileExtension,
          sizeBytes: doc.pendingRevision.sizeBytes,
        }
      : { fileName: doc.fileName, fileExtension: doc.fileExtension, sizeBytes: doc.sizeBytes };

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
          <span>{t("backToLibrary")}</span>
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
                  title={t("approveTitle")}
                >
                  {approveMutation.isPending ? (
                    <Spinner className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>{t("approve")}</span>
                </button>
                <button
                  onClick={() => setIsRejectDialogOpen(true)}
                  disabled={approveMutation.isPending}
                  className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-destructive/30 bg-surface-1 px-3 text-[13px] font-medium text-destructive shadow-sm transition hover:bg-destructive/10 disabled:opacity-50"
                  title={t("rejectTitle")}
                >
                  <X className="h-3.5 w-3.5" />
                  <span>{t("reject")}</span>
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
              <span>{t("download")}</span>
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
          {/* WT-854 — a corrected version is waiting. Readers keep the approved file until a
              reviewer approves it; reviewers and the uploader can switch the preview to it. */}
          {revisionPending && doc.pendingRevision ? (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12.5px] text-ink">
              <div className="font-medium">{t("pendingRevision.title")}</div>
              <div className="text-ink-muted">
                {t("pendingRevision.body", {
                  fileName: doc.pendingRevision.fileName,
                  date: new Date(doc.pendingRevision.uploadedAt).toLocaleString(),
                })}
              </div>
              {doc.pendingRevision.note ? (
                <div className="text-ink-muted">
                  {t("pendingRevision.note", { note: doc.pendingRevision.note })}
                </div>
              ) : null}
              {canSeePendingRevision ? (
                <div className="flex gap-1.5 pt-1" role="group" aria-label={t("pendingRevision.previewLabel")}>
                  {(["approved", "pending"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPreviewSource(option)}
                      aria-pressed={previewSource === option}
                      className={
                        previewSource === option
                          ? "inline-flex h-[26px] items-center rounded-full bg-foreground px-3 text-[12px] font-medium text-background"
                          : "inline-flex h-[26px] items-center rounded-full border border-border/60 bg-surface-1 px-3 text-[12px] font-medium text-ink hover:bg-surface-2"
                      }
                    >
                      {option === "approved"
                        ? t("pendingRevision.showApproved")
                        : t("pendingRevision.showPending")}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {/* Keyed by the file revision so a replaced file starts from a clean reader: the parsed
              Word HTML, sheets and failure flag of the previous file must not outlive it (WT-857). */}
          <DocumentPreview
            key={previewRevision}
            workspaceId={activeWorkspaceId}
            documentId={doc.id}
            fileName={previewFile.fileName}
            fileExtension={previewFile.fileExtension}
            sizeBytes={previewFile.sizeBytes}
            revision={previewRevision}
            source={showingPending ? "pending" : "approved"}
            onDownload={handleDownload}
          />
        </div>

        {/* Right sidebar: sticky, and scrolls on its own when its own content is tall. It stays
            beside the document however long the document is — approving a file means reading it
            AND checking who it will be shared with, and those two facts were previously never on
            screen at the same time. */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-0 lg:max-h-full lg:overflow-y-auto lg:pb-2">
          {/* WT-633 — above the properties, because when a document is rejected the reason and
              the way to answer it are the only things on this page anybody needs. */}
          <DocumentReviewTrail
            rejectionReason={doc.rejectionReason}
            showRejectionBanner={shouldShowRejectionFeedback(doc)}
            canUploadRevision={canUploadRevisionFor(
              doc,
              currentUser?.id,
              canApproveDocuments,
            )}
            isUploadingRevision={reuploadMutation.isPending}
            onUploadRevision={handleUploadRevision}
            history={historyQuery.data?.items ?? []}
            isHistoryLoading={historyQuery.isLoading}
            actorName={(userId) => documentActorName(workspaceMembers, userId)}
          />

          <DocumentSidePanel
            doc={doc}
            membersList={membersList}
            formatBytes={formatBytes}
            canManagePolicies={canManagePolicies}
            isExternalAllowed={isExternalAllowed}
            isSubmitting={isSubmitting}
            policiesList={policiesList}
            toggleExternalAccess={toggleExternalAccess}
            allowUser={allowUser}
            blockUser={blockUser}
            removePolicy={removePolicy}
            memberAccess={memberAccess}
            setMemberAccess={setMemberAccess}
            onToggleAiIndexing={handleToggleAiIndexing}
            isAiIndexingBusy={patchMetadataMutation.isPending}
            visibilityAction={visibilityActionFor(
              doc,
              currentUser?.id,
              canApproveDocuments,
            )}
            onRequestVisibilityChange={setPendingVisibilityAction}
            isVisibilityBusy={visibilityMutation.isPending}
          />
        </div>
      </div>

      <DocumentVisibilityDialog
        action={pendingVisibilityAction}
        documentName={doc.name}
        isSubmitting={visibilityMutation.isPending}
        onClose={() => setPendingVisibilityAction(null)}
        onConfirm={(action) => void handleConfirmVisibility(action)}
      />

      <DocumentRejectDialog
        open={isRejectDialogOpen}
        documentName={doc.name}
        isSubmitting={approveMutation.isPending}
        onClose={() => setIsRejectDialogOpen(false)}
        onConfirm={(reason) => handleApprove(false, reason)}
      />
    </div>
  );
}
