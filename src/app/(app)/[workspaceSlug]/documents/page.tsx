"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Check,
  X,
  Trash,
  Eye,
  MagnifyingGlass,
  Spinner,
  ShieldWarning,
  Warning,
  VideoCamera,
  Archive,
  ArrowCounterClockwise
} from "@phosphor-icons/react";
import { useTranslationRooms } from "@/hooks/use-translationRooms";

import apiClient from "@/lib/api/client";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useWorkspaceDocuments,
  useUploadWorkspaceDocument,
  useApproveWorkspaceDocument,
  useDeleteWorkspaceDocument,
  useArchiveWorkspaceDocument,
  useRestoreWorkspaceDocument
} from "@/hooks/use-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const uploadSchema = z.object({
  name: z.string().min(2, "Document name must be at least 2 characters"),
  isSensitive: z.boolean(),
});

type UploadFormData = z.infer<typeof uploadSchema>;

export default function WorkspaceDocumentsPage() {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docToDelete, setDocToDelete] = useState<{ id: string; name: string } | null>(null);

  // TanStack Query list with 5 second polling if any document is in processing
  const documentsQuery = useWorkspaceDocuments(activeWorkspaceId || "", page, 10, query);
  const roomsQuery = useTranslationRooms({ pageSize: 100 });
  
  // Decide whether to poll: check if any document has ingestionStatus "Pending" or "Processing"
  const isAnyDocumentProcessing = documentsQuery.data?.items.some(
    (doc) => doc.ingestionStatus === "Pending" || doc.ingestionStatus === "Processing"
  );

  // Mutations
  const uploadMutation = useUploadWorkspaceDocument(activeWorkspaceId || "");
  const approveMutation = useApproveWorkspaceDocument(activeWorkspaceId || "");
  const deleteMutation = useDeleteWorkspaceDocument(activeWorkspaceId || "");
  const archiveMutation = useArchiveWorkspaceDocument(activeWorkspaceId || "");
  const restoreMutation = useRestoreWorkspaceDocument(activeWorkspaceId || "");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      name: "",
      isSensitive: false,
    },
  });

  if (!activeWorkspaceId) return null;

  const isOwnerOrAdmin = role === "Owner" || role === "Admin";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size exceeds 10MB limit.");
        e.target.value = "";
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      // Automatically prefill document name field with file name (sans extension)
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
      setValue("name", nameWithoutExt);
    }
  };

  const handleUploadSubmit = async (formData: UploadFormData) => {
    if (!selectedFile) {
      toast.error("Please select a file to register.");
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit.");
      return;
    }

    try {
      await uploadMutation.mutateAsync({
        name: formData.name,
        sourceType: "Upload",
        sourceId: null,
        isSensitive: formData.isSensitive,
        file: selectedFile,
      });

      toast.success("Document uploaded and registered successfully!");
      setSelectedFile(null);
      reset();
      // Reset file input value
      const fileInput = document.getElementById("file-upload-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Failed to upload document.";
      toast.error(errorMsg);
    }
  };

  const handleArchive = async (docId: string) => {
    try {
      await archiveMutation.mutateAsync(docId);
      toast.success("Document archived.");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Failed to archive document.";
      toast.error(errorMsg);
    }
  };

  const handleRestore = async (docId: string) => {
    try {
      await restoreMutation.mutateAsync(docId);
      toast.success("Document restored.");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Failed to restore document.";
      toast.error(errorMsg);
    }
  };

  const handleApprove = async (docId: string, approve: boolean) => {
    try {
      await approveMutation.mutateAsync({ docId, approve });
      toast.success(approve ? "Document approved for ingestion." : "Document rejected.");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Action failed.";
      toast.error(errorMsg);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!docToDelete) return;
    try {
      await deleteMutation.mutateAsync(docToDelete.id);
      toast.success("Document deleted.");
      setDocToDelete(null);
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Failed to delete document.";
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

  const docsList = documentsQuery.data?.items || [];

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-6 text-ink max-w-7xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
        <p className="text-sm text-ink-muted mt-1">
          Upload and manage reference documents to enrich AI translation context.
        </p>
      </div>

      <div className={`grid gap-6 pt-2 ${isOwnerOrAdmin ? "lg:grid-cols-[1fr_360px]" : "grid-cols-1"}`}>
        {/* Left Section: Document List */}
        <Card className="border-hairline/30 bg-surface-1/40 rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-hairline/20 px-5 pt-5">
            <div>
              <CardTitle className="text-base font-semibold">Document Library</CardTitle>
            </div>
            <div className="relative w-64">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
                <MagnifyingGlass className="h-4 w-4" />
              </span>
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search documents..."
                className="h-8 pl-8 pr-3 text-xs bg-surface-2 border-hairline focus:ring-1 focus:ring-primary"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {documentsQuery.isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Spinner className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : docsList.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                <FileText className="h-8 w-8 text-ink-muted" />
                <p className="text-sm font-medium">No documents found</p>
                <p className="text-xs text-ink-muted">
                  {isOwnerOrAdmin ? "Register a reference file on the right panel." : "No reference documents have been uploaded to this workspace yet."}
                </p>
              </div>
            ) : (
              <div className="min-w-[720px] divide-y divide-hairline">
                <div className="grid grid-cols-[40px_1.5fr_1fr_110px_120px_70px] items-center gap-4 px-4 py-2 bg-surface-2 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                  <span>#</span>
                  <span>Name</span>
                  <span>Room/Source</span>
                  <span>Status</span>
                  <span>Access Policies</span>
                  <span className="text-right">Actions</span>
                </div>

                {docsList.map((doc, index) => {
                  const room = roomsQuery.data?.rooms?.find((r) => r.id === doc.sourceId);
                  const isMeeting = doc.sourceType?.toLowerCase() === "meeting";
                  return (
                    <div
                      key={doc.id}
                      className="grid grid-cols-[40px_1.5fr_1fr_110px_120px_70px] items-center gap-4 px-4 py-3 hover:bg-surface-2/30 transition-colors"
                    >
                      {/* Number Index */}
                      <span className="text-xs text-ink-muted font-mono">{(page - 1) * 10 + index + 1}</span>

                      {/* Name / Info */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="h-5 w-5 text-ink-muted shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span
                            className="text-xs font-semibold text-ink hover:text-primary cursor-pointer break-all"
                            onClick={() => router.push(`/${workspaceSlug}/documents/${doc.id}`)}
                          >
                            {doc.name}
                          </span>
                          <span className="text-[10px] text-ink-muted truncate mt-0.5">
                            {doc.fileName}
                          </span>
                        </div>
                      </div>

                      {/* Room/Source */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isMeeting ? (
                          <>
                            <VideoCamera className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-xs font-medium text-ink truncate" title={room?.title || "Meeting Room"}>
                              {room?.title || `Room #${doc.sourceId?.substring(0, 8) || "Meeting"}`}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-ink-muted font-normal italic">
                            {doc.sourceType || "Direct Upload"}
                          </span>
                        )}
                      </div>

                      {/* Status */}
                      <div>
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono uppercase rounded px-1.5 py-0.5 ${
                            doc.status?.toLowerCase() === "active"
                              ? "bg-primary/5 text-primary border-primary/20"
                              : doc.status?.toLowerCase() === "pending_approval"
                                ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                                : doc.status?.toLowerCase() === "archived"
                                  ? "bg-stone-500/5 text-stone-500 border-stone-500/20"
                                  : "bg-surface-3 border-hairline text-ink-muted"
                          }`}
                        >
                          {doc.status}
                        </Badge>
                      </div>

                      {/* Access Policies badge */}
                      <div>
                        {doc.isSensitive ? (
                          <Badge className="bg-destructive/5 text-destructive border border-destructive/20 text-[10px] gap-1 px-1.5 py-0.5 rounded-md">
                            <ShieldWarning className="h-3 w-3" />
                            <span>Restricted</span>
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-hairline text-ink-muted text-[10px] px-1.5 py-0.5 rounded-md">
                            Default
                          </Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => router.push(`/${workspaceSlug}/documents/${doc.id}`)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-3 transition-colors"
                          title="View detail & ACL"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {isOwnerOrAdmin && (
                          doc.status?.toLowerCase() === "archived" ? (
                            <button
                              onClick={() => handleRestore(doc.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-primary/10 hover:text-primary transition-colors"
                              title="Restore Document"
                            >
                              <ArrowCounterClockwise className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchive(doc.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-amber-500/10 hover:text-amber-500 transition-colors"
                              title="Archive Document"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )
                        )}
                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => setDocToDelete({ id: doc.id, name: doc.name })}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Delete Document"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {documentsQuery.data && documentsQuery.data.total > 10 && (
              <div className="flex items-center justify-end px-4 py-3 border-t border-hairline gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 text-xs border border-hairline rounded hover:bg-surface-2 disabled:opacity-45"
                >
                  Previous
                </button>
                <span className="text-xs text-ink-muted">Page {page}</span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={docsList.length < 10}
                  className="px-2.5 py-1 text-xs border border-hairline rounded hover:bg-surface-2 disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Section: Register / Upload panel */}
        {isOwnerOrAdmin && (
          <Card className="border-hairline/30 bg-surface-1/40 rounded-lg h-fit shadow-sm">
            <CardHeader className="px-5 pt-5 pb-3">
              <CardTitle className="text-base font-semibold">Register Document</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <form onSubmit={handleSubmit(handleUploadSubmit)} className="flex flex-col gap-4">
                {/* File input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Select File</label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed border-hairline rounded-md cursor-pointer bg-surface-2 hover:bg-surface-2/70 transition">
                      <div className="flex flex-col items-center justify-center pt-3 pb-3">
                        <Upload className="h-6 w-6 text-ink-muted mb-2" />
                        <p className="text-[10px] text-ink font-semibold">
                          {selectedFile ? selectedFile.name : "Click to select a file"}
                        </p>
                        <p className="text-[9px] text-ink-muted mt-1">
                          {selectedFile ? formatBytes(selectedFile.size) : "PDF, TXT, CSV up to 10MB"}
                        </p>
                      </div>
                      <input
                        id="file-upload-input"
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isSubmitting}
                      />
                    </label>
                  </div>
                </div>

                {/* Document display name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Document Name</label>
                  <Input
                    type="text"
                    placeholder="e.g. Legal Glossaries 2026"
                    className="h-9 border-hairline focus:ring-1 focus:ring-primary text-xs"
                    {...register("name")}
                    disabled={isSubmitting}
                  />
                  {errors.name && (
                    <p className="text-[11px] text-destructive mt-0.5">{errors.name.message}</p>
                  )}
                </div>

                {/* Sensitive Toggle */}
                <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-2 p-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold">Mark as Sensitive</span>
                    <span className="text-[9px] text-ink-muted">Requires approval and extra ACL rules</span>
                  </div>
                  <Switch
                    checked={watch("isSensitive")}
                    onCheckedChange={(val) => setValue("isSensitive", val)}
                    disabled={isSubmitting}
                  />
                </div>

                <button
                  type="submit"
                  className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary font-semibold text-white transition hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50 text-xs"
                  disabled={isSubmitting || !selectedFile}
                >
                  {isSubmitting ? (
                    <Spinner className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span>Upload Document</span>
                    </>
                  )}
                </button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base">Delete Document?</DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Are you sure you want to delete <span className="font-semibold text-ink">{docToDelete?.name}</span>? This will permanently remove the file, context mapping, and all access policies from the workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setDocToDelete(null)}
              className="flex-1 h-9 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="flex-1 h-9 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
