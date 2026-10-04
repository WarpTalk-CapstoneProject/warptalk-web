"use client";

import {
  ArrowsClockwise,
  Check,
  Download,
  EyeSlash,
  ShieldWarning,
  Spinner,
  Warning,
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
  useDownloadMaskedWorkspaceDocument,
  useDownloadWorkspaceDocument,
  useRescanMaskedDocumentVersion,
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
  canSwitchDocumentVersion,
  contentAccessOf,
  maskedCopyLosesLayout,
  maskedFileName,
  maskedFileRevision,
  maskedVersionStatusKey,
  rescanCanHelp,
  visibleDocumentVersion,
  type DocumentVersion,
} from "@/lib/documents/document-masking";
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
import { DocumentReaderHeader } from "./components/DocumentReaderHeader";
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
  // The PII-masked copy of a restricted document: all a member gets, and what Owner/Admin switch
  // to in order to see what members see.
  const downloadMaskedMutation = useDownloadMaskedWorkspaceDocument(
    activeWorkspaceId || "",
  );
  const rescanMutation = useRescanMaskedDocumentVersion(
    activeWorkspaceId || "",
    documentId,
  );
  const [chosenVersion, setChosenVersion] = useState<DocumentVersion>("original");
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
  // Which version is on screen: the backend decides who may read the original (contentAccess);
  // a member only ever has the masked copy, and `null` means there is nothing they may read yet.
  const version = doc ? visibleDocumentVersion(doc, chosenVersion) : null;
  // A corrected version awaiting review is a different ORIGINAL file; it is never masked.
  const showingPending =
    canSeePendingRevision && previewSource === "pending" && version === "original";

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
    if (!doc || version === null) return;
    try {
      // What is downloaded is what is on screen: a member, or an owner viewing the masked tab,
      // gets the masked copy in the uploaded format; the original route would answer 403 for a
      // member anyway.
      const result =
        version === "masked"
          ? await downloadBlob(
              () => downloadMaskedMutation.mutateAsync(doc.id),
              maskedFileName(doc.fileName),
            )
          : await downloadBlob(
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

  const handleRescanMasked = async () => {
    try {
      await rescanMutation.mutateAsync();
      toast.success(t("toasts.rescanStarted"));
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("toasts.rescanFailed");
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
  // The masked copy is a third file with its own revision, so the original's bytes or parsed
  // state can never stand in for it (or the reverse) when an owner switches tabs.
  const readerRevision = version === "masked" ? maskedFileRevision(doc) : previewRevision;
  const previewFile =
    showingPending && doc.pendingRevision
      ? {
          fileName: doc.pendingRevision.fileName,
          fileExtension: doc.pendingRevision.fileExtension,
          sizeBytes: doc.pendingRevision.sizeBytes,
        }
      : {
          fileName: version === "masked" ? maskedFileName(doc.fileName) : doc.fileName,
          fileExtension: doc.fileExtension,
          sizeBytes: doc.sizeBytes,
        };

  const contentAccess = contentAccessOf(doc);
  const isMemberMasked = contentAccess === "masked";
  const canSwitchVersion = canSwitchDocumentVersion(doc);
  const statusKey = maskedVersionStatusKey(doc.maskedVersionStatus);
  const isRestrictedByScan = Boolean(doc.maskedVersionStatus) || contentAccess !== "original";
  const showRescan =
    Boolean(doc.canRescanMaskedVersion) && rescanCanHelp(doc.maskedVersionStatus);
  const isDownloading = downloadMutation.isPending || downloadMaskedMutation.isPending;
  const downloadIsPrimary = !(canApproveDocuments && isPendingApproval);

  return (
    /* h-full + min-h-0, not min-h-full: the page owns the viewport and the panes scroll inside
       it. With min-h-full the whole page grew with the document, which is what pushed the
       properties panel off the top of a 40KB report and made it unreachable without scrolling
       back past everything. */
    <div className="flex h-full min-h-0 flex-col gap-6 px-4 py-4 pb-8 text-ink animate-fade-in max-w-7xl mx-auto w-full">
      {/* Main Grid: the reader card (laid out like the Records reader) vs the properties sidebar */}
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* The document, in one card like a transcript or summary on the Records page: header
            with back link, title, actions and meta bar on top, the document itself below it.
            The scroll lives HERE, on the document, not on the page. */}
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-xs lg:h-full">
          <DocumentReaderHeader
            title={doc.name}
            backLabel={t("backToLibrary")}
            onBack={() => router.push(`/${workspaceSlug}/documents`)}
            fileExtension={previewFile.fileExtension}
            sizeLabel={formatBytes(previewFile.sizeBytes)}
            uploadedAt={doc.createdAt}
            restrictedLabel={isRestrictedByScan ? t("masking.restricted") : null}
            version={version}
            versionTabs={
              canSwitchVersion
                ? {
                    label: t("masking.versionLabel"),
                    originalLabel: t("masking.original"),
                    maskedLabel: t("masking.masked"),
                    onSelect: setChosenVersion,
                  }
                : null
            }
            actions={
              /* Only one action is primary — Approve when a decision is pending, otherwise
                 Download — and the rest are outlined pills. */
              <>
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
                {showRescan ? (
                  <button
                    type="button"
                    onClick={() => void handleRescanMasked()}
                    disabled={rescanMutation.isPending}
                    className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2 disabled:opacity-50"
                  >
                    {rescanMutation.isPending ? (
                      <Spinner className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowsClockwise className="h-3.5 w-3.5" />
                    )}
                    <span>{t("masking.rescan")}</span>
                  </button>
                ) : null}
                {version !== null ? (
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className={
                      downloadIsPrimary
                        ? "inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
                        : "inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2 disabled:opacity-50"
                    }
                  >
                    {isDownloading ? (
                      <Spinner className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {version === "masked" && !isMemberMasked
                        ? t("masking.downloadMasked")
                        : t("download")}
                    </span>
                  </button>
                ) : null}
              </>
            }
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-5">
              {/* A member: one version, and the page says what was taken out of it. */}
              {isMemberMasked ? (
                <MaskingNotice
                  tone="info"
                  title={t("masking.memberBanner.title")}
                  body={t("masking.memberBanner.body")}
                  footnote={maskedCopyLosesLayout(doc.fileExtension) ? t("masking.pdfLayout") : null}
                />
              ) : null}

              {/* Owner/Admin and the uploader on a restricted document: what members get, or
                  why they get nothing, and the way to fix it when there is one. */}
              {!isMemberMasked && contentAccess === "original" && isRestrictedByScan ? (
                version === "masked" ? (
                  <MaskingNotice
                    tone="info"
                    title={t("masking.masked")}
                    body={t("masking.viewingMasked")}
                    footnote={maskedCopyLosesLayout(doc.fileExtension) ? t("masking.pdfLayout") : null}
                  />
                ) : statusKey ? (
                  <MaskingNotice
                    tone={statusKey === "pending" ? "info" : "warning"}
                    title={t(`masking.status.${statusKey}.title`)}
                    body={t(`masking.status.${statusKey}.detail`)}
                    busy={statusKey === "pending"}
                  />
                ) : doc.maskedVersionAvailable ? (
                  <MaskingNotice
                    tone="warning"
                    title={t("masking.ownerBanner.title")}
                    body={t("masking.ownerBanner.body")}
                  />
                ) : null
              ) : null}

              {/* WT-854 — a corrected version is waiting. Readers keep the approved file until a
                  reviewer approves it; reviewers and the uploader can switch the preview to it. */}
              {revisionPending && doc.pendingRevision && version === "original" ? (
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

              {version === null ? (
                /* Listed for this caller, but nothing they may read yet: the scan restricted it
                   and there is no masked copy. Said, rather than an empty frame. */
                <MaskingNotice
                  tone="warning"
                  title={t("masking.none.title")}
                  body={t("masking.none.body")}
                />
              ) : (
                /* Keyed by the file revision so a replaced file starts from a clean reader: the
                   parsed Word HTML, sheets and failure flag of the previous file must not outlive
                   it (WT-857). The masked copy has its own revision for the same reason. */
                <DocumentPreview
                  key={readerRevision}
                  workspaceId={activeWorkspaceId}
                  documentId={doc.id}
                  fileName={previewFile.fileName}
                  fileExtension={previewFile.fileExtension}
                  sizeBytes={previewFile.sizeBytes}
                  revision={readerRevision}
                  source={version === "masked" ? "masked" : showingPending ? "pending" : "approved"}
                  onDownload={handleDownload}
                />
              )}
            </div>
          </div>
        </section>

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

/** A one-paragraph note above the document about which version this is, or why there is none. */
function MaskingNotice({
  tone,
  title,
  body,
  footnote = null,
  busy = false,
}: {
  tone: "info" | "warning";
  title: string;
  body: string;
  footnote?: string | null;
  busy?: boolean;
}) {
  return (
    <div
      className={
        tone === "warning"
          ? "flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12.5px] text-ink"
          : "flex gap-2.5 rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12.5px] text-ink"
      }
    >
      <span className="mt-0.5 shrink-0 text-ink-muted">
        {busy ? (
          <Spinner className="h-4 w-4 animate-spin" />
        ) : tone === "warning" ? (
          <Warning className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <EyeSlash className="h-4 w-4" />
        )}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="font-medium">{title}</div>
        <div className="text-ink-muted">{body}</div>
        {footnote ? <div className="text-[11.5px] text-ink-subtle">{footnote}</div> : null}
      </div>
    </div>
  );
}
