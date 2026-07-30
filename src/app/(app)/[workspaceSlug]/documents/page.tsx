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
  Users,
  Info
} from "@phosphor-icons/react";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import {
  WORKSPACE_DOCUMENT_STATUS,
  WORKSPACE_DOCUMENT_INGESTION_STATUS,
  WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL,
  WORKSPACE_DOCUMENT_SOURCE_TYPE,
} from "@/constants/workspace-document";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";

import apiClient from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useWorkspaceDocuments,
  useWorkspace,
  useWorkspaceMembers,
  useUploadWorkspaceDocument,
  useApproveWorkspaceDocument,
  useDeleteWorkspaceDocument,
  useArchiveWorkspaceDocument,
  useRestoreWorkspaceDocument
} from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const uploadSchema = z.object({
  name: z.string().min(2, "Document name must be at least 2 characters"),
  isAiAllowed: z.boolean(),
});

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];
const ACCEPTED_UPLOAD_EXTENSIONS = ".pdf,.docx,.xlsx,.md,.png,.jpg,.jpeg,.webp,.bmp,.gif";

type UploadFormData = z.infer<typeof uploadSchema>;
type FilterCategory = "all" | "pending" | "ai" | "admin" | "sensitive" | "archived";
type ViewMode = "list" | "grid";

export default function WorkspaceDocumentsPage() {
  const router = useRouter();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const currentUser = useAuthStore((s) => s.user);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileIsImage, setSelectedFileIsImage] = useState(false);
  const [docToDelete, setDocToDelete] = useState<{ id: string; name: string } | null>(null);

  // TanStack Query list
  const documentsQuery = useWorkspaceDocuments(activeWorkspaceId || "", page, 20, query);
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const membersQuery = useWorkspaceMembers(activeWorkspaceId || "", 1, 100);
  const workspaceMembers = membersQuery.data?.items ?? [];
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
      isAiAllowed: true,
    },
  });

  useRegisterAssistantContext(
    activeWorkspaceId
      ? {
          pageType: "documents",
          workspaceId: activeWorkspaceId,
          snapshot: {
            query,
            count: String(documentsQuery.data?.items?.length ?? 0),
          },
        }
      : null
  );

  if (!activeWorkspaceId) return null;

  const canApproveDocuments = Boolean(workspaceQuery.data?.canApproveDocuments);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size exceeds 10MB limit.");
        e.target.value = "";
        setSelectedFile(null);
        setSelectedFileIsImage(false);
        return;
      }
      setSelectedFile(file);
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      const isImg = IMAGE_EXTENSIONS.includes(ext);
      setSelectedFileIsImage(isImg);
      
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
      setValue("name", nameWithoutExt);
      setValue("isAiAllowed", !isImg);

      if (isImg) {
        toast.info("Image file selected: AI indexing disabled.");
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
      const uploadedDocument = await uploadMutation.mutateAsync({
        name: formData.name,
        sourceType: WORKSPACE_DOCUMENT_SOURCE_TYPE.UPLOAD,
        sourceId: null,
        confidentialityLevel: WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL.GENERAL,
        isAiAllowed: formData.isAiAllowed,
        file: selectedFile,
      });

      toast.success(
        uploadedDocument.status?.toLowerCase() === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL
          ? "Document uploaded! Submitted for approval."
          : canApproveDocuments
          ? "Document uploaded & published successfully!"
          : "Document uploaded successfully."
      );
      setSelectedFile(null);
      setSelectedFileIsImage(false);
      reset({ name: "", isAiAllowed: true });
      setIsUploadModalOpen(false);
      const fileInput = document.getElementById("file-upload-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
      const errorMsg = response?.status === 401
        ? "Your session expired. Please sign in again."
        : response?.status === 403
          ? "You do not have permission to upload documents to this workspace."
          : response?.data?.error || "Failed to upload document.";
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

  const handleApproveQuick = async (docId: string, approve: boolean) => {
    try {
      await approveMutation.mutateAsync({ docId, approve });
      toast.success(approve ? "Document approved successfully!" : "Document rejected.");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Failed to process approval.";
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

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()} ${months[d.getMonth()]}`;
  };

  const getFileIcon = (ext?: string) => {
    const cleanExt = ext?.toLowerCase().replace(".", "");
    if (cleanExt === "pdf") return <FilePdf className="h-6 w-6 text-red-500 shrink-0" />;
    if (cleanExt === "csv") return <FileCsv className="h-6 w-6 text-emerald-500 shrink-0" />;
    if (cleanExt === "txt" || cleanExt === "json" || cleanExt === "md") return <FileCode className="h-6 w-6 text-blue-500 shrink-0" />;
    if (["png", "jpg", "jpeg", "webp", "bmp"].includes(cleanExt || "")) return <FileImage className="h-6 w-6 text-purple-500 shrink-0" />;
    return <FileDoc className="h-6 w-6 text-primary shrink-0" />;
  };

  // Filter raw documents list based on Category Pills
  const rawDocsList = documentsQuery.data?.items || [];
  const pendingCount = rawDocsList.filter(
    (doc) => doc.status?.toLowerCase() === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL || doc.status?.toLowerCase().includes("pending")
  ).length;
  const archivedCount = rawDocsList.filter(
    (doc) => doc.status?.toLowerCase() === "archived"
  ).length;

  const filteredDocs = rawDocsList.filter((doc) => {
    const isArchived = doc.status?.toLowerCase() === "archived";
    if (activeCategory === "archived") {
      return isArchived;
    }
    // Filter out archived documents from all other category views
    if (isArchived) return false;

    if (activeCategory === "pending") {
      return doc.status?.toLowerCase() === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL || doc.status?.toLowerCase().includes("pending");
    }
    if (activeCategory === "ai") {
      return doc.isAiAllowed;
    }
    if (activeCategory === "admin") {
      return !doc.isAiAllowed;
    }
    if (activeCategory === "sensitive") {
      return doc.confidentialityLevel === WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL.RESTRICTED;
    }
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
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-surface-3 hover:bg-surface-3/80 text-ink font-semibold text-xs shadow-sm transition-all border border-hairline/40 cursor-pointer"
          >
            <span>New</span>
            <CaretDown className="h-3.5 w-3.5 text-ink-muted" />
          </button>
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
          {canApproveDocuments && (
            <button
              onClick={() => setActiveCategory("pending")}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeCategory === "pending"
                  ? "bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-sm"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Info className="h-3.5 w-3.5 text-amber-500" />
              <span>Pending Approval</span>
              {pendingCount > 0 && (
                <span className="ml-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white px-1">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
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
          {archivedCount > 0 && (
            <button
              onClick={() => setActiveCategory("archived")}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeCategory === "archived"
                  ? "bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-sm"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Archive className="h-3.5 w-3.5 text-amber-500" />
              <span>Archived</span>
              <span className="ml-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-600 px-1">
                {archivedCount}
              </span>
            </button>
          )}
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
              {canApproveDocuments
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
                <th className="py-3 px-4 font-semibold">Uploaded By</th>
                <th className="py-3 px-4 font-semibold">Approved By</th>
                <th className="py-3 px-4 font-semibold">Classification / AI</th>
                <th className="py-3 px-4 font-semibold">Last Modified</th>
                <th className="py-3 px-4 font-semibold">Size</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/20">
              {filteredDocs.map((doc) => {
                const isDocOwner = doc.uploadedBy === currentUser?.id || doc.ownerId === currentUser?.id;
                const canManageDoc = canApproveDocuments || isDocOwner;
                const uploader = workspaceMembers.find((m) => m.userId === doc.uploadedBy || m.id === doc.uploadedBy);
                const approver = workspaceMembers.find((m) => m.userId === doc.approvedBy || m.id === doc.approvedBy);

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

                    {/* Uploaded By */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      {uploader ? (
                        <div className="flex items-center gap-2" title={`Uploaded by ${uploader.fullName}`}>
                          <Avatar className="h-6 w-6 rounded-full border border-border/50">
                            <AvatarImage src={uploader.avatarUrl ?? undefined} alt={uploader.fullName} />
                            <AvatarFallback className="rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                              {uploader.fullName ? uploader.fullName.charAt(0).toUpperCase() : "U"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[11px] font-medium text-ink truncate max-w-[110px]">
                            {uploader.fullName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-muted text-[11px]">—</span>
                      )}
                    </td>

                    {/* Approved By */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      {approver ? (
                        <div className="flex items-center gap-2" title={`Approved by ${approver.fullName}`}>
                          <Avatar className="h-6 w-6 rounded-full border border-emerald-500/30">
                            <AvatarImage src={approver.avatarUrl ?? undefined} alt={approver.fullName} />
                            <AvatarFallback className="rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold">
                              {approver.fullName ? approver.fullName.charAt(0).toUpperCase() : "A"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[11px] font-medium text-emerald-600 truncate max-w-[110px]">
                            {approver.fullName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-muted text-[11px]">—</span>
                      )}
                    </td>

                    {/* Classification / Status Badge */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      {doc.status?.toLowerCase() === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL || doc.status?.toLowerCase().includes("pending") ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          <Info className="h-3 w-3 text-amber-500" />
                          <span>Pending Approval</span>
                        </span>
                      ) : !doc.isAiAllowed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-muted bg-surface-3 border border-hairline px-2 py-0.5 rounded-full">
                          <FileText className="h-3 w-3" />
                          <span>Administrative</span>
                        </span>
                      ) : doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.COMPLETED ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <Sparkle className="h-3 w-3 text-emerald-500" />
                          <span>AI Ready</span>
                        </span>
                      ) : doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.FAILED ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full">
                          <ShieldWarning className="h-3 w-3" />
                          <span>AI Failed</span>
                        </span>
                      ) : doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.PENDING || doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.PROCESSING ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full animate-pulse">
                          <span>Processing AI...</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                          <Brain className="h-3 w-3" />
                          <span>AI Context</span>
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
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {canManageDoc && (
                          doc.status?.toLowerCase() === "archived" ? (
                            <button
                              onClick={() => handleRestore(doc.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                              title="Restore Document"
                            >
                              <ArrowCounterClockwise className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchive(doc.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-amber-500/10 hover:text-amber-500 transition-colors cursor-pointer"
                              title="Archive Document"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )
                        )}

                        {canManageDoc && (
                          <button
                            onClick={() => setDocToDelete({ id: doc.id, name: doc.name })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
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
                {!doc.isAiAllowed ? (
                  <span className="p-1 text-ink-muted bg-surface-3 rounded-full" title="Administrative">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                ) : doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.COMPLETED ? (
                  <span className="p-1 text-emerald-500 bg-emerald-500/10 rounded-full" title="AI Ready">
                    <Sparkle className="h-3.5 w-3.5 text-emerald-500" />
                  </span>
                ) : doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.FAILED ? (
                  <span className="p-1 text-destructive bg-destructive/10 rounded-full" title="AI Ingestion Failed">
                    <ShieldWarning className="h-3.5 w-3.5" />
                  </span>
                ) : doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.PENDING || doc.ingestionStatus?.toLowerCase() === WORKSPACE_DOCUMENT_INGESTION_STATUS.PROCESSING ? (
                  <span className="p-1 text-amber-500 bg-amber-500/10 rounded-full" title="Processing AI...">
                    <Spinner className="h-3.5 w-3.5 animate-spin" />
                  </span>
                ) : (
                  <span className="p-1 text-primary bg-primary/10 rounded-full" title="AI Context">
                    <Brain className="h-3.5 w-3.5" />
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
        <DialogContent className="border-hairline bg-surface-1 sm:max-w-3xl w-full rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col max-h-[92vh]">
          <DialogHeader className="pb-4 border-b border-hairline/40 shrink-0">
            <DialogTitle className="text-xl font-bold text-ink flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Upload className="h-5 w-5" />
              </div>
              <span>Upload New Document</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted mt-1">
              Add reference documents to your workspace library. Configure AI search context and member access permissions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(handleUploadSubmit)} className="flex flex-col gap-6 overflow-y-auto pr-1.5 pt-5 flex-1">
            {/* Step 1: File Selection & Document Name */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink flex items-center justify-between">
                  <span>1. Select Reference File</span>
                  <span className="text-[11px] font-normal text-ink-muted">Supported: PDF, DOCX, DOC, TXT, CSV, MD, JSON, PNG, JPG, JPEG, WEBP (Max 10MB)</span>
                </label>

                {!selectedFile ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-hairline hover:border-primary/60 rounded-2xl cursor-pointer bg-surface-2/40 hover:bg-surface-2/80 transition-all p-4 text-center group">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs text-ink font-semibold mt-1">
                        Click or drag a file to upload from your computer
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        Maximum file size: 10MB
                      </p>
                    </div>
                    <input
                      id="file-upload-input"
                      type="file"
                      accept={ACCEPTED_UPLOAD_EXTENSIONS}
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isSubmitting}
                    />
                  </label>
                ) : (
                  <div className="flex items-center justify-between p-3.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                        {getFileIcon(selectedFile.name.substring(selectedFile.name.lastIndexOf(".")))}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-ink truncate">{selectedFile.name}</span>
                        <span className="text-[11px] text-ink-muted font-mono">{formatBytes(selectedFile.size)}</span>
                        {selectedFileIsImage && (
                          <Badge
                            variant="outline"
                            className="mt-2 w-fit border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                          >
                            <Info className="mr-1 h-3 w-3" />
                            Image files will be stored as administrative attachments
                          </Badge>
                        )}
                      </div>
                    </div>
                    <label className="h-8 px-3 rounded-lg border border-hairline bg-surface-1 text-xs font-semibold text-ink hover:bg-surface-2 transition cursor-pointer flex items-center shrink-0">
                      Change File
                      <input
                        id="file-upload-input"
                        type="file"
                        accept={ACCEPTED_UPLOAD_EXTENSIONS}
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isSubmitting}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Document Display Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink">Document Display Name</label>
                <Input
                  type="text"
                  placeholder="e.g. Legal Glossaries 2026"
                  className="h-10 border-hairline focus:ring-1 focus:ring-primary text-xs rounded-xl px-3"
                  {...register("name")}
                  disabled={isSubmitting}
                />
                {errors.name && (
                  <p className="text-[11px] text-destructive mt-0.5">{errors.name.message}</p>
                )}
              </div>
            </div>

            {/* Step 2: Options & AI Permission Toggle */}
            <div className="flex flex-col gap-3 pt-3 border-t border-hairline/40">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-hairline bg-surface-2/40">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-bold text-ink">
                      {canApproveDocuments ? "Allow AI Assistant indexing" : "Request AI Assistant indexing"}
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-muted leading-relaxed">
                    {canApproveDocuments
                      ? "Enables RAG context search after security processing."
                      : "AI processing starts only after a workspace Owner or Admin approves this document."}
                  </span>
                </div>
                <Switch
                  checked={watch("isAiAllowed")}
                  disabled={selectedFileIsImage}
                  onCheckedChange={(checked: boolean) => setValue("isAiAllowed", checked, { shouldValidate: true })}
                />
              </div>

              {selectedFileIsImage && (
                <Badge
                  variant="outline"
                  className="w-fit border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-700"
                >
                  <Info className="mr-1 h-3.5 w-3.5" />
                  Image files are stored as administrative attachments. AI ingestion will be automatically skipped.
                </Badge>
              )}

              {/* Approval Policy Banner */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  {canApproveDocuments
                    ? "As Workspace Owner/Admin, your upload will be automatically published."
                    : "Your upload will enter Pending Approval. Security and AI processing start only after a workspace Owner or Admin approves it."}
                </p>
              </div>
            </div>

            <DialogFooter className="mt-4 pt-4 border-t border-hairline/40 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="h-10 px-5 rounded-xl border border-hairline bg-surface-1 text-xs font-semibold text-ink hover:bg-surface-2 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 px-6 rounded-xl bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
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
      <Dialog open={!!docToDelete} onOpenChange={(open: boolean) => !open && setDocToDelete(null)}>
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
