"use client";

import { use, useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldWarning,
  ArrowLeft,
  Spinner,
  Plus,
  Trash,
  Info,
  User,
  Users,
  Download,
  Lock,
  Check,
  X,
  FileText,
  FolderOpen,
  FloppyDisk,
  PencilSimple,
  Sparkle
} from "@phosphor-icons/react";

import {
  WORKSPACE_DOCUMENT_STATUS,
  WORKSPACE_DOCUMENT_INGESTION_STATUS,
  WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL,
} from "@/constants/workspace-document";
import apiClient from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useWorkspaceDocument,
  useDownloadWorkspaceDocument,
  useApproveWorkspaceDocument,
  useWorkspaceDocumentExtractedText,
  useUpdateWorkspaceDocumentExtractedText
} from "@/hooks/use-workspace";
import { useDocumentAccessPolicy } from "@/hooks/use-document-access-policy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface PageProps {
  params: Promise<{ documentId: string }>;
}

const getColumnLabel = (index: number): string => {
  let label = "";
  let temp = index;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
};

export default function DocumentDetailPage({ params }: PageProps) {
  const { documentId } = use(params);
  const router = useRouter();
  const routeParams = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = routeParams.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);
  const currentUser = useAuthStore((s) => s.user);

  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  useEffect(() => {
    setActiveSheetIndex(0);
  }, [documentId]);

  // Queries & Hooks
  const documentQuery = useWorkspaceDocument(activeWorkspaceId || "", documentId);
  const extractedTextQuery = useWorkspaceDocumentExtractedText(activeWorkspaceId || "", documentId);
  
  // Custom Document Access Policy Hook
  const {
    policiesList,
    membersList,
    isExternalAllowed,
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
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editableText, setEditableText] = useState("");

  const updateTextMutation = useUpdateWorkspaceDocumentExtractedText(activeWorkspaceId || "", documentId);

  useEffect(() => {
    if (extractedTextQuery.data) {
      const full = extractedTextQuery.data.fullText || extractedTextQuery.data.text || "";
      setEditableText(full);
    }
  }, [extractedTextQuery.data]);

  const doc = documentQuery.data;

  if (!activeWorkspaceId) return null;

  const isOwnerOrAdmin = role === "Owner" || role === "Admin";
  const isDocOwner = doc ? (doc.ownerId === currentUser?.id || doc.uploadedBy === currentUser?.id) : false;
  const canManagePolicies = isOwnerOrAdmin || isDocOwner;

  const handleDownloadDefault = async () => {
    if (!doc) return;
    try {
      const blob = await downloadMutation.mutateAsync(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Downloading file...");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Failed to download document.";
      toast.error(errorMsg);
    }
  };

  const handleDownloadSaveAs = async () => {
    if (!doc) return;
    try {
      const blob = await downloadMutation.mutateAsync(doc.id);

      // Trigger native file picker for selecting local folder
      if ("showSaveFilePicker" in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: doc.fileName,
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast.success("File saved successfully!");
          return;
        } catch (pickerErr) {
          console.log("Save file picker cancelled or failed", pickerErr);
          return;
        }
      } else {
        toast.error("Your browser does not support choosing a save folder.");
      }
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
            <button
              onClick={handleDownloadDefault}
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
            <button
              onClick={handleDownloadSaveAs}
              disabled={downloadMutation.isPending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-surface-2 hover:bg-surface-3 border border-hairline text-ink text-xs font-semibold px-3.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
              title="Save to folder on local machine"
            >
              {downloadMutation.isPending ? (
                <Spinner className="h-3.5 w-3.5 animate-spin text-ink-muted" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5" />
              )}
              <span>Save As...</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Center (Content View) vs Right (Properties Sidebar) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        {/* Central panel - content view */}
        <div className="flex flex-col gap-6 min-w-0">
          <Card className="border-hairline bg-surface-1 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="border-b border-hairline px-5 py-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-sm font-semibold">Document Content View</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-hairline bg-surface-2 uppercase font-mono text-ink-muted">
                {doc.fileExtension.replace(".", "") || "DOC"}
              </Badge>
            </CardHeader>
            <CardContent className="p-6">
              {/* AI Ingestion Status Contextual Banners */}
              {doc.isAiAllowed && (doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.PROCESSING || doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.PENDING) && (
                <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-center gap-3 text-amber-600 dark:text-amber-400">
                  <Spinner className="h-4 w-4 animate-spin shrink-0 text-amber-500" />
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span className="font-semibold">AI Ingestion in Progress (Vector Indexing)...</span>
                    <span className="text-[11px] opacity-80 leading-relaxed">
                      Text extraction and vector embedding indexing are in progress. AI Assistant will retrieve context from this document once completed.
                    </span>
                  </div>
                </div>
              )}

              {doc.isAiAllowed && doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.COMPLETED && (
                <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                  <Sparkle className="h-4 w-4 shrink-0 text-emerald-500" />
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span className="font-semibold">Ready for AI Assistant</span>
                    <span className="text-[11px] opacity-80 leading-relaxed">
                      This document has been successfully indexed into vector storage (Qdrant). You can now use AI Assistant for Q&A and context retrieval.
                    </span>
                  </div>
                </div>
              )}

              {doc.isAiAllowed && doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.FAILED && (
                <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 flex items-center gap-3 text-destructive">
                  <ShieldWarning className="h-4 w-4 shrink-0" />
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span className="font-semibold">AI Ingestion Failed</span>
                    <span className="text-[11px] opacity-80 leading-relaxed">
                      Failed to extract text or generate vector embeddings for this document. Please check the file format or try uploading again.
                    </span>
                  </div>
                </div>
              )}

              {/* Document approval status banners */}
              {(doc.status?.toLowerCase() === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL || doc.status?.toLowerCase().includes("pending")) && (
                <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-ink">
                  <div className="flex gap-2.5 items-start">
                    <Info className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-amber-500">Awaiting Registration Approval</span>
                      <p className="text-[10px] text-ink-muted leading-relaxed">
                        Standard member uploaded this document. An Admin or Owner must approve it to ingest text mappings.
                      </p>
                    </div>
                  </div>
                  {isOwnerOrAdmin && (
                    <div className="flex gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => handleApprove(true)}
                        disabled={approveMutation.isPending}
                        className="inline-flex h-7 px-3 items-center justify-center rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleApprove(false)}
                        disabled={approveMutation.isPending}
                        className="inline-flex h-7 px-3 items-center justify-center rounded-md bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Content Viewer Box */}
              <div className="relative rounded-xl border border-hairline bg-surface-2 p-6 min-h-[300px] flex flex-col justify-between">
                <div className="flex flex-col gap-4">
                  {/* Info header */}
                  <div className="flex items-center justify-between border-b border-hairline pb-3">
                    <span className="text-xs font-semibold text-ink-muted">File: {doc.fileName}</span>
                    <span className="text-[10px] text-ink-muted font-mono">{formatBytes(doc.sizeBytes)}</span>
                  </div>
                  
                  {/* Document Header & Edit Controls */}
                  <div className="flex items-center justify-between mt-2 pb-2 border-b border-hairline">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-bold text-ink">{doc.name}</h3>
                      <p className="text-xs text-ink-muted leading-relaxed">
                        {doc.confidentialityLevel === WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL.RESTRICTED ? (
                          <span className="text-destructive/90 font-semibold inline-block mr-2">
                            ⚠️ Sensitive Document
                          </span>
                        ) : null}
                        WarpTalk AI engine indexes this context dynamically for accurate terminology translation.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isEditingContent ? (
                        <button
                          onClick={() => setIsEditingContent(true)}
                          className="h-8 px-3 rounded-lg border border-hairline bg-surface-1 text-xs font-semibold text-ink hover:bg-surface-3 transition flex items-center gap-1.5"
                        >
                          <PencilSimple className="h-3.5 w-3.5 text-primary" />
                          <span>Edit Text</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setIsEditingContent(false);
                              if (extractedTextQuery.data) {
                                setEditableText(extractedTextQuery.data.fullText || extractedTextQuery.data.text || "");
                              }
                            }}
                            className="h-8 px-3 rounded-lg border border-hairline bg-surface-1 text-xs font-semibold text-ink-muted hover:bg-surface-3 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await updateTextMutation.mutateAsync(editableText);
                                toast.success("Document content saved and updated!");
                                setIsEditingContent(false);
                              } catch (err: unknown) {
                                const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
                                  || "Failed to save content.";
                                toast.error(errorMsg);
                              }
                            }}
                            disabled={updateTextMutation.isPending}
                            className="h-8 px-4 rounded-lg bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                          >
                            {updateTextMutation.isPending ? (
                              <Spinner className="h-3.5 w-3.5 animate-spin text-white" />
                            ) : (
                              <FloppyDisk className="h-3.5 w-3.5 text-white" />
                            )}
                            <span>Save Content</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Text Editor Box or Content View */}
                  {isEditingContent ? (
                    <div className="flex flex-col gap-2 mt-4">
                      <div className="flex items-center gap-1 p-1 bg-surface-3 border border-hairline rounded-t-lg">
                        <span className="text-[10px] font-mono uppercase text-ink-muted px-2 font-bold">Document Content Editor</span>
                      </div>
                      <textarea
                        value={editableText}
                        onChange={(e) => setEditableText(e.target.value)}
                        placeholder="Type or paste document text content here..."
                        className="w-full min-h-[350px] p-4 bg-surface-1 border border-hairline rounded-b-lg font-mono text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-y scrollbar-thin"
                      />
                    </div>
                  ) : extractedTextQuery.isLoading ? (
                    <div className="flex items-center justify-center p-8 mt-4">
                      <Spinner className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : extractedTextQuery.isError ? (
                    <div className="p-4 rounded-lg bg-surface-3 border border-hairline text-ink-muted text-xs mt-4 flex flex-col gap-2">
                      <p className="text-ink font-medium">No extracted text content loaded from storage file yet.</p>
                      <button
                        onClick={() => setIsEditingContent(true)}
                        className="self-start text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                      >
                        <PencilSimple className="h-3 w-3" />
                        <span>Click here to open editor and add text content</span>
                      </button>
                    </div>
                  ) : (() => {
                    const data = extractedTextQuery.data;
                    if (data?.sheets && data.sheets.length > 0) {
                      const activeSheet = data.sheets[activeSheetIndex] || data.sheets[0];
                      const maxCols = activeSheet.rows?.reduce((max, row) => Math.max(max, row.length), 0) || 0;
                      
                      return (
                        <div className="flex flex-col gap-3 mt-4">
                          <div className="flex border-b border-hairline overflow-x-auto gap-1 pb-1 scrollbar-thin">
                            {data.sheets.map((sheet, index) => (
                              <button
                                key={index}
                                onClick={() => setActiveSheetIndex(index)}
                                className={`px-3.5 py-1.5 text-xs font-semibold rounded-t-md border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                  activeSheetIndex === index
                                    ? "border-primary text-primary bg-primary/5"
                                    : "border-transparent text-ink-muted hover:text-ink hover:bg-surface-3"
                                }`}
                              >
                                <span className="text-emerald-500">田</span>
                                <span>{sheet.sheetName || `Sheet ${index + 1}`}</span>
                              </button>
                            ))}
                          </div>

                          <div className="border border-hairline rounded-lg bg-surface-1 shadow-inner overflow-auto max-h-[500px] scrollbar-thin">
                            {(!activeSheet.rows || activeSheet.rows.length === 0) ? (
                              <div className="p-8 text-center text-xs text-ink-muted">
                                No data found in this sheet.
                              </div>
                            ) : (
                              <table className="w-full border-collapse text-left text-xs font-sans">
                                <thead>
                                  <tr className="bg-surface-3">
                                    <th className="sticky top-0 left-0 z-30 bg-surface-3 border-r border-b border-hairline w-10 text-center text-[10px] font-mono text-ink-muted select-none"></th>
                                    {Array.from({ length: maxCols }).map((_, colIdx) => (
                                      <th
                                        key={colIdx}
                                        className="sticky top-0 z-10 bg-surface-3 border-r border-b border-hairline px-3 py-1.5 text-center text-[10px] font-mono text-ink-muted font-semibold min-w-[120px] select-none"
                                      >
                                        {getColumnLabel(colIdx)}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {activeSheet.rows.map((row, rowIdx) => (
                                    <tr key={rowIdx} className="hover:bg-surface-2/40 transition-colors">
                                      <td className="sticky left-0 z-25 bg-surface-3 border-r border-b border-hairline text-center text-[10px] font-mono text-ink-muted select-none font-semibold">
                                        {rowIdx + 1}
                                      </td>
                                      {Array.from({ length: maxCols }).map((_, colIdx) => {
                                        const cellVal = row[colIdx] || "";
                                        return (
                                          <td
                                            key={colIdx}
                                            className="border-r border-b border-hairline px-3 py-2 text-ink break-words font-sans min-w-[120px] max-w-[280px]"
                                            title={cellVal}
                                          >
                                            {cellVal}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (data?.pages && data.pages.length > 0) {
                      return (
                        <div className="flex flex-col gap-6 mt-4 max-h-[500px] overflow-y-auto p-4 bg-surface-3 border border-hairline rounded-lg scrollbar-thin">
                          {data.pages.map((page, idx) => (
                            <div key={idx} className="bg-surface-1 border border-hairline rounded-xl shadow-sm p-6 relative min-h-[150px] flex flex-col">
                              <div className="absolute top-3 right-3 text-[10px] font-mono text-ink-muted bg-surface-2 px-2 py-0.5 rounded border border-hairline">
                                Page {page.pageNumber || idx + 1}
                              </div>
                              <div className="mt-4 font-sans text-xs leading-relaxed text-ink whitespace-pre-wrap select-text">
                                {page.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }

                    const displayText = data?.fullText || data?.text || "";

                    if (!displayText) {
                      return (
                        <div className="mt-4 border border-hairline rounded-lg bg-surface-3 p-6 flex flex-col items-center justify-center gap-3">
                          <p className="text-xs text-ink-muted font-medium">No text content found in document.</p>
                          <button
                            onClick={() => setIsEditingContent(true)}
                            className="h-8 px-4 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition flex items-center gap-1.5"
                          >
                            <PencilSimple className="h-3.5 w-3.5" />
                            <span>Add & Edit Document Content</span>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="mt-4 border border-hairline rounded-lg bg-surface-3 p-4 max-h-[400px] overflow-y-auto font-mono text-[11px] leading-relaxed text-ink whitespace-pre-wrap select-text scrollbar-thin">
                        {displayText}
                      </div>
                    );
                  })()}
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-hairline pt-4 text-[10px] text-ink-muted">
                  <span>Ingested via: {doc.sourceType}</span>
                  <span>Indexed: {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : "Pending"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right properties sidebar panel */}
        <div className="flex flex-col gap-6">
          {/* Properties Card */}
          <Card className="border-hairline bg-surface-1 shadow-sm">
            <CardHeader className="border-b border-hairline px-5 py-4">
              <CardTitle className="text-sm font-semibold">Document Properties</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-muted">Status</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono uppercase rounded px-1.5 py-0.5 ${
                    doc.status === "Active"
                      ? "bg-primary/5 text-primary border-primary/20"
                      : doc.status === "Pending approval"
                        ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                        : "bg-surface-3 border-hairline text-ink-muted"
                  }`}
                >
                  {doc.status}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-muted">File Size</span>
                <span className="font-mono text-ink font-semibold">{formatBytes(doc.sizeBytes)}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-muted">File Format</span>
                <span className="uppercase text-ink font-semibold">{doc.fileExtension.replace(".", "") || "N/A"}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-muted">Ingestion</span>
                <span className="capitalize text-ink font-semibold">{doc.ingestionStatus.toLowerCase()}</span>
              </div>

              <div className="flex items-center justify-between text-xs border-t border-hairline pt-3">
                <span className="text-ink-muted">Uploaded By</span>
                <span className="text-ink font-semibold">
                  {membersList.find((m) => m.userId === doc.uploadedBy)?.fullName || "System / Uploader"}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-muted">Uploaded At</span>
                <span className="text-ink font-semibold">{new Date(doc.createdAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Access Control & Policies Sidebar Section */}
          <Card className="border-hairline bg-surface-1 shadow-sm">
            <CardHeader className="border-b border-hairline px-5 py-4">
              <CardTitle className="text-sm font-semibold">Access Policies & Rules</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4">
              {canManagePolicies ? (
                <>
                  {/* External Access Toggle */}
                  <div className="flex items-center justify-between bg-surface-2 border border-hairline rounded-lg p-3">
                    <div className="flex flex-col gap-0.5 pr-2">
                      <span className="text-xs font-semibold">External Users Access</span>
                      <span className="text-[9px] text-ink-muted leading-tight">
                        Allow guest/external members to view this document
                      </span>
                    </div>
                    <Switch
                      checked={isExternalAllowed}
                      onCheckedChange={(checked) => toggleExternalAccess(checked)}
                    />
                  </div>

                  {/* Allowed Users Dropdown */}
                  <div className="flex flex-col gap-1.5 relative">
                    <label className="text-xs font-semibold text-ink-muted">Allowed Users List</label>
                    <div className="flex flex-wrap gap-1 border border-hairline rounded-md bg-surface-2 p-1.5 min-h-9 items-center">
                      {policiesList.filter((p) => p.subjectType === "User" && p.effect === "ALLOW").length === 0 ? (
                        <span className="text-[10px] text-ink-muted pl-1">Inherited only</span>
                      ) : (
                        policiesList
                          .filter((p) => p.subjectType === "User" && p.effect === "ALLOW")
                          .map((p) => {
                            const m = membersList.find((member) => member.userId === p.subjectId);
                            return (
                              <Badge key={p.id} className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 gap-1 px-1.5 py-0.5 rounded text-[9px]">
                                <span>{m ? m.fullName : "User"}</span>
                                <X className="h-2.5 w-2.5 cursor-pointer hover:text-destructive" onClick={() => removePolicy(p.id)} />
                              </Badge>
                            );
                          })
                      )}
                      <button
                        onClick={() => {
                          setShowAllowedDropdown(!showAllowedDropdown);
                          setShowBlockedDropdown(false);
                        }}
                        className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded border border-hairline text-ink-muted hover:bg-surface-3 transition cursor-pointer"
                        title="Add Allowed User"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {showAllowedDropdown && (
                      <div className="absolute right-0 top-full mt-1.5 w-full bg-surface-1 border border-hairline rounded-lg shadow-lg max-h-48 overflow-y-auto z-50 divide-y divide-hairline">
                        {membersList.length === 0 ? (
                          <div className="p-3 text-center text-xs text-ink-muted">No members found</div>
                        ) : (
                          membersList.map((m) => {
                            const isAllowed = policiesList.some(
                              (p) => p.subjectType === "User" && p.subjectId === m.userId && p.effect === "ALLOW"
                            );
                            return (
                              <div
                                key={m.userId}
                                onClick={() => allowUser(m.userId, m.fullName)}
                                className="flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-2 cursor-pointer transition-colors"
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold text-ink truncate">{m.fullName}</span>
                                  <span className="text-[9px] text-ink-muted truncate">{m.email}</span>
                                </div>
                                {isAllowed && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Blocked Users Dropdown */}
                  <div className="flex flex-col gap-1.5 relative mt-1.5">
                    <label className="text-xs font-semibold text-ink-muted">Blocked Users List</label>
                    <div className="flex flex-wrap gap-1 border border-hairline rounded-md bg-surface-2 p-1.5 min-h-9 items-center">
                      {policiesList.filter((p) => p.subjectType === "User" && p.effect === "DENY").length === 0 ? (
                        <span className="text-[10px] text-ink-muted pl-1">No blocks active</span>
                      ) : (
                        policiesList
                          .filter((p) => p.subjectType === "User" && p.effect === "DENY")
                          .map((p) => {
                            const m = membersList.find((member) => member.userId === p.subjectId);
                            return (
                              <Badge key={p.id} className="bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 gap-1 px-1.5 py-0.5 rounded text-[9px]">
                                <span>{m ? m.fullName : "User"}</span>
                                <X className="h-2.5 w-2.5 cursor-pointer hover:text-destructive" onClick={() => removePolicy(p.id)} />
                              </Badge>
                            );
                          })
                      )}
                      <button
                        onClick={() => {
                          setShowBlockedDropdown(!showBlockedDropdown);
                          setShowAllowedDropdown(false);
                        }}
                        className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded border border-hairline text-ink-muted hover:bg-surface-3 transition cursor-pointer"
                        title="Add Blocked User"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {showBlockedDropdown && (
                      <div className="absolute right-0 top-full mt-1.5 w-full bg-surface-1 border border-hairline rounded-lg shadow-lg max-h-48 overflow-y-auto z-50 divide-y divide-hairline">
                        {membersList.length === 0 ? (
                          <div className="p-3 text-center text-xs text-ink-muted">No members found</div>
                        ) : (
                          membersList.map((m) => {
                            const isBlocked = policiesList.some(
                              (p) => p.subjectType === "User" && p.subjectId === m.userId && p.effect === "DENY"
                            );
                            return (
                              <div
                                key={m.userId}
                                onClick={() => blockUser(m.userId, m.fullName)}
                                className="flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-2 cursor-pointer transition-colors"
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold text-ink truncate">{m.fullName}</span>
                                  <span className="text-[9px] text-ink-muted truncate">{m.email}</span>
                                </div>
                                {isBlocked && <Check className="h-3.5 w-3.5 text-destructive shrink-0" />}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center gap-2 border border-dashed border-hairline rounded-lg">
                  <Lock className="h-5 w-5 text-ink-muted" />
                  <span className="text-xs font-semibold text-ink-muted">Configuration locked</span>
                  <p className="text-[9px] text-ink-muted leading-relaxed">
                    Access overrides can only be set by workspace Owners, Admins, or the Document Owner.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
