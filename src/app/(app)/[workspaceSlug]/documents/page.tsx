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
  ArrowCounterClockwise,
  Sparkle,
  Lock,
  Brain,
  Plus,
  SquaresFour,
  List,
  Funnel,
  DownloadSimple,
  CaretDown,
  FilePdf,
  FileCode,
  FileCsv,
  FileDoc,
  FileImage,
  Users
} from "@phosphor-icons/react";
import { useTranslationRooms } from "@/hooks/use-translationRooms";

import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useWorkspaceDocuments,
  useUploadWorkspaceDocument,
  useApproveWorkspaceDocument,
  useDeleteWorkspaceDocument,
  useArchiveWorkspaceDocument,
  useRestoreWorkspaceDocument
} from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const uploadSchema = z.object({
  name: z.string().min(2, "Document name must be at least 2 characters"),
  isSensitive: z.boolean(),
  isAiAllowed: z.boolean(),
});

type UploadFormData = z.infer<typeof uploadSchema>;
type FilterCategory = "all" | "ai" | "admin" | "sensitive";
type ViewMode = "list" | "grid";

export default function WorkspaceDocumentsPage() {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docToDelete, setDocToDelete] = useState<{ id: string; name: string } | null>(null);

  // TanStack Query list
  const documentsQuery = useWorkspaceDocuments(activeWorkspaceId || "", page, 20, query);
  const roomsQuery = useTranslationRooms({ pageSize: 100 });

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
      isAiAllowed: true,
    },
  });

  if (!activeWorkspaceId) return null;

  const isOwnerOrAdmin = role === "Owner" || role === "Admin";

  const [classificationMode, setClassificationMode] = useState<"AiKnowledge" | "General" | "InternalOnly" | "Restricted">("AiKnowledge");

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
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      const isImg = [".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(ext);
      
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
      setValue("name", nameWithoutExt);

      if (isImg) {
        setClassificationMode("General");
        setValue("isAiAllowed", false, { shouldValidate: true });
        setValue("isSensitive", false, { shouldValidate: true });
        toast.info("Image file selected: set to General Files mode (AI ingestion skipped).");
      }
    }
  };

  const handleUploadSubmit = async (formData: UploadFormData) => {
    if (!selectedFile) {
      toast.error("Please select a file to upload.");
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit.");
      return;
    }

    try {
      const isAi = classificationMode === "AiKnowledge";
      const isSens = classificationMode === "Restricted";

      const newDoc = await uploadMutation.mutateAsync({
        name: formData.name,
        sourceType: "Upload",
        sourceId: null,
        isSensitive: isSens,
        isAiAllowed: isAi,
        file: selectedFile,
      });

      // If InternalOnly selected, automatically register access policy blocking External members
      if (classificationMode === "InternalOnly" && newDoc?.id) {
        try {
          await apiClient.post(API.workspaces.documentPolicies(activeWorkspaceId, newDoc.id), {
            subjectType: "MembershipType",
            subjectKey: "External",
            permission: "View",
            effect: "DENY"
          });
        } catch (policyErr) {
          console.error("Failed to add InternalOnly access policy automatically", policyErr);
        }
      }

      toast.success("Document uploaded and registered successfully!");
      setSelectedFile(null);
      reset({ name: "", isSensitive: false, isAiAllowed: true });
      setClassificationMode("AiKnowledge");
      setIsUploadModalOpen(false);
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
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()} ${months[d.getMonth()]}`;
  };

  const getFileIcon = (ext?: string) => {
    const cleanExt = ext?.toLowerCase().replace(".", "");
    if (cleanExt === "pdf") return <FilePdf className="h-6 w-6 text-red-500 shrink-0" />;
    if (cleanExt === "csv") return <FileCsv className="h-6 w-6 text-emerald-500 shrink-0" />;
    if (cleanExt === "txt" || cleanExt === "json") return <FileCode className="h-6 w-6 text-blue-500 shrink-0" />;
    if (["png", "jpg", "jpeg", "webp", "bmp"].includes(cleanExt || "")) return <FileImage className="h-6 w-6 text-purple-500 shrink-0" />;
    return <FileDoc className="h-6 w-6 text-primary shrink-0" />;
  };

  // Filter raw documents list based on Category Pills
  const rawDocsList = documentsQuery.data?.items || [];
  const filteredDocs = rawDocsList.filter((doc) => {
    if (activeCategory === "ai") return doc.isAiAllowed && !doc.isSensitive;
    if (activeCategory === "admin") return !doc.isAiAllowed && !doc.isSensitive;
    if (activeCategory === "sensitive") return doc.isSensitive;
    return true; // "all"
  });

  return (
    <div className="flex min-h-full flex-col gap-6 px-6 py-6 pb-12 text-ink max-w-7xl mx-auto w-full">
      {/* ─── Top Header Section: Title, Search Bar & Upload Button ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Library</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Rounded Search Input Bar */}
          <div className="relative w-72 sm:w-80">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
              <MagnifyingGlass className="h-4 w-4" />
            </span>
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search..."
              className="h-10 pl-9 pr-4 text-xs bg-surface-1 border-hairline rounded-full focus:ring-1 focus:ring-primary shadow-sm"
            />
          </div>

          {/* New Document Button */}
          {isOwnerOrAdmin && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-surface-3 hover:bg-surface-3/80 text-ink font-semibold text-xs shadow-sm transition-all border border-hairline/40"
            >
              <span>New</span>
              <CaretDown className="h-3.5 w-3.5 text-ink-muted" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Pill Category Filters & View Toggle Bar ─── */}
      <div className="flex items-center justify-between border-b border-hairline/30 pb-3">
        {/* Left Side: Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeCategory === "all"
                ? "bg-surface-3 text-ink shadow-sm border border-hairline/30"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveCategory("ai")}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeCategory === "ai"
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-sm"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Sparkle className="h-3.5 w-3.5 text-emerald-500" />
            <span>AI Context</span>
          </button>
          <button
            onClick={() => setActiveCategory("admin")}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeCategory === "admin"
                ? "bg-surface-3 text-ink border border-hairline/30 shadow-sm"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-ink-muted" />
            <span>Administrative</span>
          </button>
          <button
            onClick={() => setActiveCategory("sensitive")}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeCategory === "sensitive"
                ? "bg-destructive/10 text-destructive border border-destructive/20 shadow-sm"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Lock className="h-3.5 w-3.5 text-destructive" />
            <span>Restricted</span>
          </button>
        </div>

        {/* Right Side: Action Icons (Filter & Grid/List Toggle) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-ink-muted hover:text-ink transition-colors"
            title="Filter options"
          >
            <Funnel className="h-4 w-4" />
            {activeCategory !== "all" && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                1
              </span>
            )}
          </button>

          <div className="h-4 w-px bg-hairline/50 mx-1" />

          <button
            onClick={() => setViewMode("grid")}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              viewMode === "grid" ? "bg-surface-3 text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
            title="Grid View"
          >
            <SquaresFour className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              viewMode === "list" ? "bg-surface-3 text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
            title="List View"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ─── Document Content: List View vs Grid View ─── */}
      {documentsQuery.isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center border border-dashed border-hairline rounded-2xl bg-surface-1/30 p-8">
          <FileText className="h-10 w-10 text-ink-muted/60" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-ink">No documents found</p>
            <p className="text-xs text-ink-muted">
              {isOwnerOrAdmin
                ? "Click the 'New' button above to upload reference documents."
                : "No reference documents have been uploaded to this workspace yet."}
            </p>
          </div>
        </div>
      ) : viewMode === "list" ? (
        /* List Table View */
        <div className="w-full overflow-x-auto rounded-xl border border-hairline/30 bg-surface-1/40 shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline/20 bg-surface-2/50 text-ink-muted font-semibold">
                <th className="py-3 px-4 font-semibold">Name</th>
                <th className="py-3 px-4 font-semibold">Classification / AI</th>
                <th className="py-3 px-4 font-semibold">Last Modified</th>
                <th className="py-3 px-4 font-semibold">Size</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/20">
              {filteredDocs.map((doc) => {
                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-surface-2/40 transition-colors group cursor-pointer"
                    onClick={() => router.push(`/${workspaceSlug}/documents/${doc.id}`)}
                  >
                    {/* Name column with thumbnail icon */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {getFileIcon(doc.fileExtension)}
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-ink group-hover:text-primary transition-colors line-clamp-1">
                            {doc.name}
                          </span>
                          <span className="text-[10px] text-ink-muted font-mono truncate">
                            {doc.fileName}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Classification Badge */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      {doc.isSensitive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full">
                          <Lock className="h-3 w-3" />
                          <span>Restricted</span>
                        </span>
                      ) : !doc.isAiAllowed || doc.ingestionStatus?.toLowerCase() === "skipped" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-muted bg-surface-3 border border-hairline px-2 py-0.5 rounded-full">
                          <FileText className="h-3 w-3" />
                          <span>Administrative</span>
                        </span>
                      ) : doc.ingestionStatus?.toLowerCase() === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <Sparkle className="h-3 w-3 text-emerald-500" />
                          <span>AI Ready</span>
                        </span>
                      ) : doc.ingestionStatus?.toLowerCase() === "failed" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full">
                          <ShieldWarning className="h-3 w-3" />
                          <span>AI Failed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full animate-pulse">
                          <span>Processing AI...</span>
                        </span>
                      )}
                    </td>

                    {/* Last Modified Date */}
                    <td className="py-3.5 px-4 text-ink-muted text-xs">
                      {formatDate(doc.updatedAt || doc.createdAt)}
                    </td>

                    {/* File Size */}
                    <td className="py-3.5 px-4 text-ink-muted text-xs font-mono">
                      {formatBytes(doc.sizeBytes)}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/${workspaceSlug}/documents/${doc.id}`)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink transition-colors"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {isOwnerOrAdmin && (
                          doc.status?.toLowerCase() === "archived" ? (
                            <button
                              onClick={() => handleRestore(doc.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-primary/10 hover:text-primary transition-colors"
                              title="Restore Document"
                            >
                              <ArrowCounterClockwise className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchive(doc.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-amber-500/10 hover:text-amber-500 transition-colors"
                              title="Archive Document"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )
                        )}

                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => setDocToDelete({ id: doc.id, name: doc.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Delete Permanently"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grid Card View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredDocs.map((doc) => (
            <Card
              key={doc.id}
              onClick={() => router.push(`/${workspaceSlug}/documents/${doc.id}`)}
              className="border-hairline/30 bg-surface-1/50 hover:bg-surface-2/40 transition-all cursor-pointer rounded-xl group shadow-sm flex flex-col justify-between"
            >
              <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                <div className="p-2 rounded-lg bg-surface-2 group-hover:bg-surface-3 transition-colors">
                  {getFileIcon(doc.fileExtension)}
                </div>
                {doc.isSensitive ? (
                  <span className="p-1 text-destructive bg-destructive/10 rounded-full" title="Restricted">
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                ) : doc.isAiAllowed ? (
                  <span className="p-1 text-emerald-500 bg-emerald-500/10 rounded-full" title="AI Ready">
                    <Sparkle className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="p-1 text-ink-muted bg-surface-3 rounded-full" title="Administrative">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                )}
              </CardHeader>

              <CardContent className="p-4 pt-1 flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-semibold text-xs text-ink group-hover:text-primary transition-colors line-clamp-2">
                    {doc.name}
                  </h3>
                  <span className="text-[10px] text-ink-muted truncate font-mono">
                    {doc.fileName}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-ink-muted pt-2 border-t border-hairline/20 mt-1">
                  <span>{formatDate(doc.updatedAt || doc.createdAt)}</span>
                  <span>{formatBytes(doc.sizeBytes)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Pagination ─── */}
      {documentsQuery.data && documentsQuery.data.total > 20 && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs border border-hairline rounded-lg hover:bg-surface-2 disabled:opacity-45 font-medium"
          >
            Previous
          </button>
          <span className="text-xs text-ink-muted font-medium">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={filteredDocs.length < 20}
            className="px-3 py-1.5 text-xs border border-hairline rounded-lg hover:bg-surface-2 disabled:opacity-45 font-medium"
          >
            Next
          </button>
        </div>
      )}

      {/* ─── Upload Modal ("New" Document Upload Modal) ─── */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="border-hairline bg-surface-1 max-w-lg rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-ink">Upload New Document</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Register reference file into workspace library and select classification mode.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(handleUploadSubmit)} className="flex flex-col gap-4 mt-2">
            {/* Dropzone File Upload */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink">Select Document File</label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-28 border border-dashed border-hairline rounded-xl cursor-pointer bg-surface-2/60 hover:bg-surface-2 transition">
                  <div className="flex flex-col items-center justify-center pt-3 pb-3">
                    <Upload className="h-7 w-7 text-primary mb-2" />
                    <p className="text-xs text-ink font-semibold">
                      {selectedFile ? selectedFile.name : "Click to select a file from computer"}
                    </p>
                    <p className="text-[10px] text-ink-muted mt-1">
                      {selectedFile ? formatBytes(selectedFile.size) : "PDF, PNG, JPG, WEBP, TXT, CSV, DOCX up to 10MB limit"}
                    </p>
                  </div>
                  <input
                    id="file-upload-input"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.csv,.txt,.json,.docx"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isSubmitting}
                  />
                </label>
              </div>
            </div>

            {/* Document Display Name Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink">Document Display Name</label>
              <Input
                type="text"
                placeholder="e.g. Legal Glossaries 2026"
                className="h-10 border-hairline focus:ring-1 focus:ring-primary text-xs rounded-lg"
                {...register("name")}
                disabled={isSubmitting}
              />
              {errors.name && (
                <p className="text-[11px] text-destructive mt-0.5">{errors.name.message}</p>
              )}
            </div>

            {/* 4 Classification Cards */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink">Classification & Access Purpose</label>
              <div className="grid grid-cols-1 gap-2">
                {/* Card 1: AI Knowledge Base */}
                <div
                  onClick={() => {
                    setClassificationMode("AiKnowledge");
                    setValue("isAiAllowed", true, { shouldValidate: true });
                    setValue("isSensitive", false, { shouldValidate: true });
                  }}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    classificationMode === "AiKnowledge"
                      ? "border-emerald-500/50 bg-emerald-500/5 shadow-sm ring-1 ring-emerald-500/30"
                      : "border-hairline bg-surface-2/50 hover:bg-surface-2 opacity-75"
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mt-0.5">
                    <Brain className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-ink">🧠 AI Knowledge Base</span>
                      <span className="text-[9px] font-mono uppercase bg-emerald-500/10 text-emerald-600 px-1.5 py-0.2 rounded-full font-bold">Recommended</span>
                    </div>
                    <span className="text-[10px] text-ink-muted leading-tight">
                      Allow AI search context & RAG ingestion to answer questions. Accessible to workspace members.
                    </span>
                  </div>
                </div>

                {/* Card 2: General Files */}
                <div
                  onClick={() => {
                    setClassificationMode("General");
                    setValue("isAiAllowed", false, { shouldValidate: true });
                    setValue("isSensitive", false, { shouldValidate: true });
                  }}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    classificationMode === "General"
                      ? "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                      : "border-hairline bg-surface-2/50 hover:bg-surface-2 opacity-75"
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-ink">📦 General Files</span>
                    <span className="text-[10px] text-ink-muted leading-tight">
                      Standard file & media storage (contracts, images, manuals). Skipped from AI ingestion.
                    </span>
                  </div>
                </div>

                {/* Card 3: Internal Members Only */}
                <div
                  onClick={() => {
                    setClassificationMode("InternalOnly");
                    setValue("isAiAllowed", false, { shouldValidate: true });
                    setValue("isSensitive", false, { shouldValidate: true });
                  }}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    classificationMode === "InternalOnly"
                      ? "border-amber-500/50 bg-amber-500/5 shadow-sm ring-1 ring-amber-500/30"
                      : "border-hairline bg-surface-2/50 hover:bg-surface-2 opacity-75"
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 mt-0.5">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-ink">👥 Internal Members Only</span>
                    <span className="text-[10px] text-ink-muted leading-tight">
                      Restricted to internal team members. Automatically blocks Guest & External member access.
                    </span>
                  </div>
                </div>

                {/* Card 4: Restricted & Sensitive */}
                <div
                  onClick={() => {
                    setClassificationMode("Restricted");
                    setValue("isAiAllowed", false, { shouldValidate: true });
                    setValue("isSensitive", true, { shouldValidate: true });
                  }}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    classificationMode === "Restricted"
                      ? "border-destructive/50 bg-destructive/5 shadow-sm ring-1 ring-destructive/30"
                      : "border-hairline bg-surface-2/50 hover:bg-surface-2 opacity-75"
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive mt-0.5">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-ink">🔴 Restricted & Sensitive</span>
                    <span className="text-[10px] text-ink-muted leading-tight">
                      Confidential data. Skip AI ingestion & restrict access to Owner, Admin, or Uploader.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="h-10 px-4 rounded-xl border border-hairline bg-surface-1 text-xs font-semibold text-ink hover:bg-surface-2 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-xl bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition flex items-center justify-center gap-2 disabled:opacity-50"
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
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm rounded-2xl">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base">Delete Document?</DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Are you sure you want to delete <span className="font-semibold text-ink">{docToDelete?.name}</span>? This will remove file content, AI context, and access policies from workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setDocToDelete(null)}
              className="flex-1 h-9 rounded-xl border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="flex-1 h-9 rounded-xl bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
