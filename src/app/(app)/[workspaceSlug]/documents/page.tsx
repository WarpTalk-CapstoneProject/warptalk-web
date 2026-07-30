"use client";

import {
  WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL,
  WORKSPACE_DOCUMENT_INGESTION_STATUS,
  WORKSPACE_DOCUMENT_SOURCE_TYPE,
  WORKSPACE_DOCUMENT_STATUS,
} from "@/constants/workspace-document";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  ArrowCounterClockwise,
  Brain,
  CaretDown,
  Eye,
  FileCode,
  FileCsv,
  FileDoc,
  FileImage,
  FilePdf,
  FileText,
  Funnel,
  Info,
  List,
  Lock,
  ShieldWarning,
  SlidersHorizontal,
  Sparkle,
  Spinner,
  SquaresFour,
  Trash,
  Upload,
  Warning,
} from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useArchiveWorkspaceDocument,
  useDeleteWorkspaceDocument,
  useRestoreWorkspaceDocument,
  useUploadWorkspaceDocument,
  useWorkspace,
  useWorkspaceDocuments,
  useWorkspaceMembers,
} from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

const uploadSchema = z.object({
  name: z.string().min(2, "Document name must be at least 2 characters"),
  isAiAllowed: z.boolean(),
});

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];
const ACCEPTED_UPLOAD_EXTENSIONS =
  ".pdf,.docx,.xlsx,.md,.png,.jpg,.jpeg,.webp,.bmp,.gif";

type UploadFormData = z.infer<typeof uploadSchema>;
type FilterCategory =
  "all" | "pending" | "ai" | "admin" | "sensitive" | "archived";
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
  const [docToDelete, setDocToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // TanStack Query list
  const documentsQuery = useWorkspaceDocuments(
    activeWorkspaceId || "",
    page,
    20,
    query,
  );
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const workspaceMembersQuery = useWorkspaceMembers(
    activeWorkspaceId || "",
    1,
    100,
  );

  // Mutations
  const uploadMutation = useUploadWorkspaceDocument(activeWorkspaceId || "");
  const deleteMutation = useDeleteWorkspaceDocument(activeWorkspaceId || "");
  const archiveMutation = useArchiveWorkspaceDocument(activeWorkspaceId || "");
  const restoreMutation = useRestoreWorkspaceDocument(activeWorkspaceId || "");

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      name: "",
      isAiAllowed: true,
    },
  });
  const isAiAllowed = useWatch({ control, name: "isAiAllowed" });

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
      : null,
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

      const nameWithoutExt =
        file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
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
        uploadedDocument.status?.toLowerCase() ===
          WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL
          ? "Document uploaded! Submitted for approval."
          : canApproveDocuments
            ? "Document uploaded & published successfully!"
            : "Document uploaded successfully.",
      );
      setSelectedFile(null);
      setSelectedFileIsImage(false);
      reset({ name: "", isAiAllowed: true });
      setIsUploadModalOpen(false);
      const fileInput = document.getElementById(
        "file-upload-input",
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err: unknown) {
      const response = (
        err as { response?: { status?: number; data?: { error?: string } } }
      )?.response;
      const errorMsg =
        response?.status === 401
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
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to archive document.";
      toast.error(errorMsg);
    }
  };

  const handleRestore = async (docId: string) => {
    try {
      await restoreMutation.mutateAsync(docId);
      toast.success("Document restored.");
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to restore document.";
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
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to delete document.";
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
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")} ${d.getDate()} ${months[d.getMonth()]}`;
  };

  const getFileIcon = (ext?: string) => {
    const cleanExt = ext?.toLowerCase().replace(".", "");
    if (cleanExt === "pdf")
      return <FilePdf className="h-6 w-6 text-red-500 shrink-0" />;
    if (cleanExt === "csv")
      return <FileCsv className="h-6 w-6 text-emerald-500 shrink-0" />;
    if (cleanExt === "txt" || cleanExt === "json" || cleanExt === "md")
      return <FileCode className="h-6 w-6 text-blue-500 shrink-0" />;
    if (["png", "jpg", "jpeg", "webp", "bmp"].includes(cleanExt || ""))
      return <FileImage className="h-6 w-6 text-purple-500 shrink-0" />;
    return <FileDoc className="h-6 w-6 text-primary shrink-0" />;
  };

  // Filter raw documents list based on Category Pills
  const rawDocsList = documentsQuery.data?.items || [];
  const pendingCount = rawDocsList.filter(
    (doc) =>
      doc.status?.toLowerCase() ===
        WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL ||
      doc.status?.toLowerCase().includes("pending"),
  ).length;
  const archivedCount = rawDocsList.filter(
    (doc) => doc.status?.toLowerCase() === "archived",
  ).length;

  const filteredDocs = rawDocsList.filter((doc) => {
    const isArchived = doc.status?.toLowerCase() === "archived";
    if (activeCategory === "archived") {
      return isArchived;
    }
    // Filter out archived documents from all other category views
    if (isArchived) return false;

    if (activeCategory === "pending") {
      return (
        doc.status?.toLowerCase() ===
          WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL ||
        doc.status?.toLowerCase().includes("pending")
      );
    }
    if (activeCategory === "ai") {
      return doc.isAiAllowed;
    }
    if (activeCategory === "admin") {
      return !doc.isAiAllowed;
    }
    if (activeCategory === "sensitive") {
      return (
        doc.confidentialityLevel ===
        WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL.RESTRICTED
      );
    }
    return true; // "all"
  });

  return (
    <div className="flex h-full flex-col bg-surface-1 px-4 pb-12 text-ink">
      {/* ─── Top Header Section: Title, Search Bar & Upload Button ─── */}
      {/* ─── Pill Category Filters & View Toggle Bar ─── */}
      <div className="flex shrink-0 items-center justify-between gap-4 py-3">
        {/* Left Side: Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveCategory("all")}
            className={`rounded-full border px-4 py-1.5 text-[13px] transition-all ${
              activeCategory === "all"
                ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            All
          </button>
          {canApproveDocuments && (
            <button
              onClick={() => setActiveCategory("pending")}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] transition-all ${
                activeCategory === "pending"
                  ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                  : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] transition-all ${
              activeCategory === "ai"
                ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Sparkle className="h-3.5 w-3.5 text-emerald-500" />
            <span>AI Context</span>
          </button>
          <button
            onClick={() => setActiveCategory("admin")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] transition-all ${
              activeCategory === "admin"
                ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-ink-muted" />
            <span>Administrative</span>
          </button>
          <button
            onClick={() => setActiveCategory("sensitive")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] transition-all ${
              activeCategory === "sensitive"
                ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Lock className="h-3.5 w-3.5 text-destructive" />
            <span>Restricted</span>
          </button>
          {archivedCount > 0 && (
            <button
              onClick={() => setActiveCategory("archived")}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] transition-all ${
                activeCategory === "archived"
                  ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                  : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
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
          <ExpandingSearchDock
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search documents..."
            ariaLabel="Search documents"
            collapsedWidth={28}
            expandedWidth={220}
            className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
            iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
            clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
            inputClassName="h-[26px] text-[12px]"
          />
          <button
            className="relative inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Filter options"
          >
            <Funnel className="h-3.5 w-3.5" />
            {activeCategory !== "all" && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
            )}
          </button>

          <button
            className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Display options"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-px bg-hairline/50 mx-1" />

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90"
          >
            <span>New</span>
            <CaretDown className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setViewMode("grid")}
            className={`inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 transition-colors ${
              viewMode === "grid"
                ? "bg-surface-3 text-ink shadow-sm"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
            title="Grid View"
          >
            <SquaresFour className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 transition-colors ${
              viewMode === "list"
                ? "bg-surface-3 text-ink shadow-sm"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
            title="List View"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Document Content: List View vs Grid View ─── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
                <th className="py-3 px-4 font-semibold">Classification / AI</th>
                <th className="py-3 px-4 font-semibold">People</th>
                <th className="py-3 px-4 font-semibold">Last Modified</th>
                <th className="py-3 px-4 font-semibold">Size</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/20">
              {filteredDocs.map((doc) => {
                const isDocOwner =
                  doc.uploadedBy === currentUser?.id ||
                  doc.ownerId === currentUser?.id;
                const canManageDoc = canApproveDocuments || isDocOwner;

                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-surface-2/40 transition-colors group cursor-pointer"
                    onClick={() =>
                      router.push(`/${workspaceSlug}/documents/${doc.id}`)
                    }
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

                    {/* Classification / Status Badge */}
                    <td
                      className="py-3.5 px-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {doc.status?.toLowerCase() ===
                        WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL ||
                      doc.status?.toLowerCase().includes("pending") ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          <Info className="h-3 w-3 text-amber-500" />
                          <span>Pending Approval</span>
                        </span>
                      ) : !doc.isAiAllowed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-muted bg-surface-3 border border-hairline px-2 py-0.5 rounded-full">
                          <FileText className="h-3 w-3" />
                          <span>Administrative</span>
                        </span>
                      ) : doc.ingestionStatus?.toLowerCase() ===
                        WORKSPACE_DOCUMENT_INGESTION_STATUS.COMPLETED ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <Sparkle className="h-3 w-3 text-emerald-500" />
                          <span>AI Ready</span>
                        </span>
                      ) : doc.ingestionStatus?.toLowerCase() ===
                        WORKSPACE_DOCUMENT_INGESTION_STATUS.FAILED ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full">
                          <ShieldWarning className="h-3 w-3" />
                          <span>AI Failed</span>
                        </span>
                      ) : doc.ingestionStatus?.toLowerCase() ===
                          WORKSPACE_DOCUMENT_INGESTION_STATUS.PENDING ||
                        doc.ingestionStatus?.toLowerCase() ===
                          WORKSPACE_DOCUMENT_INGESTION_STATUS.PROCESSING ? (
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

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <DocumentActor
                          label="Uploader"
                          member={workspaceMembersQuery.data?.items.find(
                            (member) => member.userId === doc.uploadedBy,
                          )}
                        />
                        <DocumentActor
                          label="Approver"
                          member={workspaceMembersQuery.data?.items.find(
                            (member) => member.userId === doc.approvedBy,
                          )}
                        />
                      </div>
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
                    <td
                      className="py-3.5 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() =>
                            router.push(`/${workspaceSlug}/documents/${doc.id}`)
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {canManageDoc &&
                          (doc.status?.toLowerCase() === "archived" ? (
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
                          ))}

                        {canManageDoc && (
                          <button
                            onClick={() =>
                              setDocToDelete({ id: doc.id, name: doc.name })
                            }
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
              onClick={() =>
                router.push(`/${workspaceSlug}/documents/${doc.id}`)
              }
              className="border-hairline/30 bg-surface-1/50 hover:bg-surface-2/40 transition-all cursor-pointer rounded-xl group shadow-sm flex flex-col justify-between"
            >
              <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                <div className="p-2 rounded-lg bg-surface-2 group-hover:bg-surface-3 transition-colors">
                  {getFileIcon(doc.fileExtension)}
                </div>
                {!doc.isAiAllowed ? (
                  <span
                    className="p-1 text-ink-muted bg-surface-3 rounded-full"
                    title="Administrative"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                ) : doc.ingestionStatus?.toLowerCase() ===
                  WORKSPACE_DOCUMENT_INGESTION_STATUS.COMPLETED ? (
                  <span
                    className="p-1 text-emerald-500 bg-emerald-500/10 rounded-full"
                    title="AI Ready"
                  >
                    <Sparkle className="h-3.5 w-3.5 text-emerald-500" />
                  </span>
                ) : doc.ingestionStatus?.toLowerCase() ===
                  WORKSPACE_DOCUMENT_INGESTION_STATUS.FAILED ? (
                  <span
                    className="p-1 text-destructive bg-destructive/10 rounded-full"
                    title="AI Ingestion Failed"
                  >
                    <ShieldWarning className="h-3.5 w-3.5" />
                  </span>
                ) : doc.ingestionStatus?.toLowerCase() ===
                    WORKSPACE_DOCUMENT_INGESTION_STATUS.PENDING ||
                  doc.ingestionStatus?.toLowerCase() ===
                    WORKSPACE_DOCUMENT_INGESTION_STATUS.PROCESSING ? (
                  <span
                    className="p-1 text-amber-500 bg-amber-500/10 rounded-full"
                    title="Processing AI..."
                  >
                    <Spinner className="h-3.5 w-3.5 animate-spin" />
                  </span>
                ) : (
                  <span
                    className="p-1 text-primary bg-primary/10 rounded-full"
                    title="AI Context"
                  >
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
                <div className="flex items-center gap-3 pt-1">
                  <DocumentActor
                    label="Uploader"
                    member={workspaceMembersQuery.data?.items.find(
                      (member) => member.userId === doc.uploadedBy,
                    )}
                  />
                  <DocumentActor
                    label="Approver"
                    member={workspaceMembersQuery.data?.items.find(
                      (member) => member.userId === doc.approvedBy,
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>

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
          <span className="text-xs text-ink-muted font-medium">
            Page {page}
          </span>
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
              Add reference documents to your workspace library. Configure AI
              search context and member access permissions.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit(handleUploadSubmit)}
            className="flex flex-col gap-6 overflow-y-auto pr-1.5 pt-5 flex-1"
          >
            {/* Step 1: File Selection & Document Name */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-ink flex items-center justify-between">
                  <span>1. Select Reference File</span>
                  <span className="text-[11px] font-normal text-ink-muted">
                    Supported: PDF, DOCX, DOC, TXT, CSV, MD, JSON, PNG, JPG,
                    JPEG, WEBP (Max 10MB)
                  </span>
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
                        {getFileIcon(
                          selectedFile.name.substring(
                            selectedFile.name.lastIndexOf("."),
                          ),
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-ink truncate">
                          {selectedFile.name}
                        </span>
                        <span className="text-[11px] text-ink-muted font-mono">
                          {formatBytes(selectedFile.size)}
                        </span>
                        {selectedFileIsImage && (
                          <Badge
                            variant="outline"
                            className="mt-2 w-fit border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                          >
                            <Info className="mr-1 h-3 w-3" />
                            Image files will be stored as administrative
                            attachments
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
                <label className="text-xs font-bold text-ink">
                  Document Display Name
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Legal Glossaries 2026"
                  className="h-10 border-hairline focus:ring-1 focus:ring-primary text-xs rounded-xl px-3"
                  {...register("name")}
                  disabled={isSubmitting}
                />
                {errors.name && (
                  <p className="text-[11px] text-destructive mt-0.5">
                    {errors.name.message}
                  </p>
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
                      {canApproveDocuments
                        ? "Allow AI Assistant indexing"
                        : "Request AI Assistant indexing"}
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-muted leading-relaxed">
                    {canApproveDocuments
                      ? "Enables RAG context search after security processing."
                      : "AI processing starts only after a workspace Owner or Admin approves this document."}
                  </span>
                </div>
                <Switch
                  checked={isAiAllowed}
                  disabled={selectedFileIsImage}
                  onCheckedChange={(checked: boolean) =>
                    setValue("isAiAllowed", checked, { shouldValidate: true })
                  }
                />
              </div>

              {selectedFileIsImage && (
                <Badge
                  variant="outline"
                  className="w-fit border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-700"
                >
                  <Info className="mr-1 h-3.5 w-3.5" />
                  Image files are stored as administrative attachments. AI
                  ingestion will be automatically skipped.
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
      <Dialog
        open={!!docToDelete}
        onOpenChange={(open) => !open && setDocToDelete(null)}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-sm rounded-2xl">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base">
              Delete Document?
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-ink">
                {docToDelete?.name}
              </span>
              ? This will remove file content, AI context, and access policies
              from workspace.
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

function DocumentActor({
  label,
  member,
}: {
  label: "Uploader" | "Approver";
  member?: {
    fullName: string;
    email: string;
    avatarUrl?: string | null;
  };
}) {
  if (!member) {
    return (
      <span className="text-[10px] text-ink-muted" title={`${label} unavailable`}>
        {label}: —
      </span>
    );
  }

  const name = member.fullName || member.email;
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={`${label}: ${name}`}>
      <Avatar size="sm">
        {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={name} /> : null}
        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="hidden min-w-0 flex-col xl:flex">
        <span className="text-[9px] uppercase tracking-wide text-ink-muted">{label}</span>
        <span className="max-w-24 truncate text-[10px] font-medium text-ink">{name}</span>
      </div>
    </div>
  );
}
