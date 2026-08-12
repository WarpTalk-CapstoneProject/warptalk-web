"use client";

import {
  WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL,
  WORKSPACE_DOCUMENT_INGESTION_STATUS,
  WORKSPACE_DOCUMENT_SOURCE_TYPE,
  WORKSPACE_DOCUMENT_STATUS,
} from "@/constants/workspace-document";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  ArrowCounterClockwise,
  Brain,
  CaretDown,
  CaretUp,
  Check,
  Checks,
  Eye,
  FileCode,
  FileCsv,
  FileDoc,
  FileImage,
  FilePdf,
  Funnel,
  Info,
  List,
  PaperPlaneTilt,
  SlidersHorizontal,
  Spinner,
  SquaresFour,
  Trash,
  Upload,
  X,
} from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import gsap from "gsap";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ListDisplayPopover } from "@/components/ui/list-display-popover";
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
import { DocumentActor } from "@/components/documents/document-actor";
import { DocumentDeleteDialog } from "@/components/documents/document-delete-dialog";
import type {
  WorkspaceDocumentDto,
  WorkspaceMemberDto,
} from "@/types/workspace";

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
type SortDirection = "asc" | "desc";
type DocumentSortKey =
  "name" | "classification" | "uploader" | "approver" | "modified" | "size";
type DocumentDisplayProperty =
  "classification" | "uploader" | "approver" | "modified" | "size" | "actions";

const DOCUMENT_SORT_COLUMNS: Array<{
  key: DocumentSortKey;
  label: string;
}> = [
  { key: "name", label: "Name" },
  { key: "classification", label: "Classification" },
  { key: "uploader", label: "Uploader" },
  { key: "approver", label: "Approver" },
  { key: "modified", label: "Modified" },
  { key: "size", label: "Size" },
];

const DOCUMENT_DISPLAY_PROPERTIES: Array<{
  key: DocumentDisplayProperty;
  label: string;
}> = [
  { key: "classification", label: "Classification" },
  { key: "uploader", label: "Uploader" },
  { key: "approver", label: "Approver" },
  { key: "modified", label: "Modified" },
  { key: "size", label: "Size" },
  { key: "actions", label: "Actions" },
];

const DEFAULT_DOCUMENT_DISPLAY_PROPERTIES = DOCUMENT_DISPLAY_PROPERTIES.map(
  (property) => property.key,
);

function getDocumentGridTemplate(visibleProperties: DocumentDisplayProperty[]) {
  return [
    "28px",
    "minmax(320px,1.8fr)",
    visibleProperties.includes("classification") ? "170px" : null,
    visibleProperties.includes("uploader") ? "140px" : null,
    visibleProperties.includes("approver") ? "140px" : null,
    visibleProperties.includes("modified") ? "116px" : null,
    visibleProperties.includes("size") ? "92px" : null,
    visibleProperties.includes("actions") ? "96px" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

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
  const [sortKey, setSortKey] = useState<DocumentSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [visibleDisplayProperties, setVisibleDisplayProperties] = useState<
    DocumentDisplayProperty[]
  >(DEFAULT_DOCUMENT_DISPLAY_PROPERTIES);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileIsImage, setSelectedFileIsImage] = useState(false);
  const [docToDelete, setDocToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [hoveredDocumentId, setHoveredDocumentId] = useState<string | null>(
    null,
  );
  const selectionActionRef = useRef<HTMLDivElement | null>(null);

  // TanStack Query list
  const documentsQuery = useWorkspaceDocuments(
    activeWorkspaceId || "",
    page,
    20,
    query,
  );
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const membersQuery = useWorkspaceMembers(activeWorkspaceId || "", 1, 100);
  const workspaceMembers = membersQuery.data?.items ?? [];

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
  const canApproveDocuments = Boolean(workspaceQuery.data?.canApproveDocuments);

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
  const sortedDocs = [...filteredDocs].sort((first, second) => {
    const result = compareDocuments(first, second, sortKey, workspaceMembers);
    return sortDirection === "asc" ? result : -result;
  });
  const documentGridTemplate = useMemo(
    () => getDocumentGridTemplate(visibleDisplayProperties),
    [visibleDisplayProperties],
  );
  const visibleSortColumns = useMemo(
    () =>
      DOCUMENT_SORT_COLUMNS.filter(
        (column) =>
          column.key === "name" ||
          visibleDisplayProperties.includes(
            column.key as DocumentDisplayProperty,
          ),
      ),
    [visibleDisplayProperties],
  );
  const selectedDocuments = rawDocsList.filter((doc) =>
    selectedDocumentIds.includes(doc.id),
  );
  const visibleDocumentIds = sortedDocs.map((doc) => doc.id);
  const allVisibleDocumentsSelected =
    visibleDocumentIds.length > 0 &&
    visibleDocumentIds.every((id) => selectedDocumentIds.includes(id));
  const hasSelectedDocuments = selectedDocuments.length > 0;
  const selectedManageableDocuments = selectedDocuments.filter((doc) =>
    canManageDocument(doc, canApproveDocuments, currentUser?.id),
  );
  const selectedArchivedDocuments =
    selectedManageableDocuments.filter(isArchivedDocument);
  const selectedArchiveTargets = selectedManageableDocuments.filter(
    (doc) => !isArchivedDocument(doc),
  );
  const selectedRestoreTargets =
    selectedArchiveTargets.length === 0 ? selectedArchivedDocuments : [];
  const selectionArchiveLabel =
    selectedRestoreTargets.length > 0
      ? "Restore selected documents"
      : "Archive selected documents";

  useRegisterAssistantContext(
    activeWorkspaceId
      ? {
          pageType: "documents",
          entityId:
            selectedDocumentIds.length > 0
              ? selectedDocumentIds.join(",")
              : "documents",
          workspaceId: activeWorkspaceId,
          snapshot: {
            query,
            count: String(documentsQuery.data?.items?.length ?? 0),
            selectedCount: String(selectedDocuments.length),
            selectedDocuments: formatSelectedDocumentNames(selectedDocuments),
          },
        }
      : null,
  );

  useEffect(() => {
    if (!hasSelectedDocuments || !selectionActionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        selectionActionRef.current,
        {
          autoAlpha: 0,
          y: 14,
          scale: 0.96,
          filter: "blur(6px)",
          transformOrigin: "50% 100%",
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.34,
          ease: "power3.out",
        },
      );
    }, selectionActionRef);

    return () => ctx.revert();
  }, [hasSelectedDocuments]);

  if (!activeWorkspaceId) return null;

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

  function toggleDocumentSelection(docId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(docId)
        ? current.filter((id) => id !== docId)
        : [...current, docId],
    );
  }

  function toggleSelectAllVisibleDocuments() {
    setSelectedDocumentIds((current) => {
      if (allVisibleDocumentsSelected) {
        return current.filter((id) => !visibleDocumentIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleDocumentIds]));
    });
  }

  function toggleDisplayProperty(property: string) {
    setVisibleDisplayProperties((current) => {
      const typedProperty = property as DocumentDisplayProperty;
      if (current.includes(typedProperty)) {
        if (sortKey === typedProperty) setSortKey("name");
        return current.filter((item) => item !== typedProperty);
      }

      return [...current, typedProperty];
    });
  }

  function handleAskAiAboutSelection() {
    if (selectedDocuments.length === 0) return;

    const prompt =
      selectedDocuments.length === 1
        ? `Review this workspace document: ${selectedDocuments[0].name}. Include its classification, AI-readiness, and any risk that needs attention.`
        : `Review these ${selectedDocuments.length} selected workspace documents. Summarize their classifications, AI-readiness, and any items that need attention.`;

    window.dispatchEvent(
      new CustomEvent("warptalk:open-assistant", { detail: { prompt } }),
    );
    toast.success("Selected documents attached to WarpBot.");
  }

  async function handleArchiveSelectedDocuments() {
    const targets =
      selectedRestoreTargets.length > 0
        ? selectedRestoreTargets
        : selectedArchiveTargets;
    if (targets.length === 0) {
      toast.error("You can only archive or restore documents you manage.");
      return;
    }

    try {
      for (const doc of targets) {
        if (selectedRestoreTargets.length > 0) {
          await restoreMutation.mutateAsync(doc.id);
        } else {
          await archiveMutation.mutateAsync(doc.id);
        }
      }
      setSelectedDocumentIds((current) =>
        current.filter((id) => !targets.some((doc) => doc.id === id)),
      );
      toast.success(
        selectedRestoreTargets.length > 0
          ? "Selected documents restored."
          : "Selected documents archived.",
      );
    } catch {
      toast.error(
        selectedRestoreTargets.length > 0
          ? "Failed to restore selected documents."
          : "Failed to archive selected documents.",
      );
    }
  }

  async function handleDeleteSelectedDocuments() {
    if (selectedManageableDocuments.length === 0) {
      toast.error("You can only delete documents you manage.");
      return;
    }
    const confirmed = window.confirm(
      `Delete ${selectedManageableDocuments.length} selected document${selectedManageableDocuments.length === 1 ? "" : "s"} permanently?`,
    );
    if (!confirmed) return;

    try {
      for (const doc of selectedManageableDocuments) {
        await deleteMutation.mutateAsync(doc.id);
      }
      setSelectedDocumentIds((current) =>
        current.filter(
          (id) => !selectedManageableDocuments.some((doc) => doc.id === id),
        ),
      );
      toast.success("Selected documents deleted.");
    } catch {
      toast.error("Failed to delete selected documents.");
    }
  }

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

  function handleSort(nextSortKey: DocumentSortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

  return (
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* ─── Top Header Section: Title, Search Bar & Upload Button ─── */}
        {/* ─── Pill Category Filters & View Toggle Bar ─── */}
        <div className="flex shrink-0 items-center justify-between gap-4 py-3">
          {/* Left Side: Category Pills.
            One FilterChip per category, same control Meetings and Knowledge render. The leading
            icons are gone on purpose: they were only on five of the six chips, in five different
            colours, so a row of filters read as a row of unrelated actions. A count is the one
            thing worth carrying beside a label, and FilterChip has a slot for it. */}
          <FilterChipGroup label="Filter documents by category">
            <FilterChip
              selected={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            >
              All
            </FilterChip>
            {canApproveDocuments && (
              <FilterChip
                selected={activeCategory === "pending"}
                onClick={() => setActiveCategory("pending")}
                badge={pendingCount > 0 ? pendingCount : undefined}
              >
                Pending Approval
              </FilterChip>
            )}
            <FilterChip
              selected={activeCategory === "ai"}
              onClick={() => setActiveCategory("ai")}
            >
              AI Context
            </FilterChip>
            <FilterChip
              selected={activeCategory === "admin"}
              onClick={() => setActiveCategory("admin")}
            >
              Administrative
            </FilterChip>
            <FilterChip
              selected={activeCategory === "sensitive"}
              onClick={() => setActiveCategory("sensitive")}
            >
              Restricted
            </FilterChip>
            {archivedCount > 0 && (
              <FilterChip
                selected={activeCategory === "archived"}
                onClick={() => setActiveCategory("archived")}
                badge={archivedCount}
              >
                Archived
              </FilterChip>
            )}
          </FilterChipGroup>

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

            <ListDisplayPopover
              trigger={<SlidersHorizontal className="h-3.5 w-3.5" />}
              triggerClassName="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              triggerTitle="Display options"
              ordering={sortKey}
              orderingOptions={DOCUMENT_SORT_COLUMNS.map((column) => ({
                value: column.key,
                label: column.label,
                disabled:
                  column.key !== "name" &&
                  !visibleDisplayProperties.includes(
                    column.key as DocumentDisplayProperty,
                  ),
              }))}
              onOrderingChange={(value) => setSortKey(value as DocumentSortKey)}
              direction={sortDirection}
              onDirectionChange={setSortDirection}
              properties={DOCUMENT_DISPLAY_PROPERTIES}
              visibleProperties={visibleDisplayProperties}
              onToggleProperty={toggleDisplayProperty}
              onReset={() => {
                setSortKey("name");
                setSortDirection("asc");
                setVisibleDisplayProperties(
                  DEFAULT_DOCUMENT_DISPLAY_PROPERTIES,
                );
              }}
            />

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
        {documentsQuery.isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : viewMode === "list" ? (
          /* List View */
          <section className="mt-0.2 min-h-full overflow-x-auto px-2">
            <div className="min-w-[1040px]">
              <div
                className="grid px-2 py-0.5 text-[11px] font-medium text-ink-muted"
                style={{ gridTemplateColumns: documentGridTemplate }}
              >
                <div />
                {visibleSortColumns.map((column) => (
                  <SortableColumnHeader
                    key={column.key}
                    label={column.label}
                    active={sortKey === column.key}
                    direction={sortDirection}
                    onClick={() => handleSort(column.key)}
                  />
                ))}
                {visibleDisplayProperties.includes("actions") && (
                  <span className="text-right">Actions</span>
                )}
              </div>
              <div className="space-y-0">
                {sortedDocs.map((doc, index) => {
                  const isDocOwner =
                    doc.uploadedBy === currentUser?.id ||
                    doc.ownerId === currentUser?.id;
                  const canManageDoc = canApproveDocuments || isDocOwner;
                  const selected = selectedDocumentIds.includes(doc.id);
                  const previousDocument =
                    index > 0 ? sortedDocs[index - 1] : null;
                  const nextDocument =
                    index < sortedDocs.length - 1
                      ? sortedDocs[index + 1]
                      : null;
                  const previousHighlighted =
                    Boolean(previousDocument) &&
                    (selectedDocumentIds.includes(previousDocument!.id) ||
                      hoveredDocumentId === previousDocument!.id);
                  const nextHighlighted =
                    Boolean(nextDocument) &&
                    (selectedDocumentIds.includes(nextDocument!.id) ||
                      hoveredDocumentId === nextDocument!.id);
                  const highlighted = selected || hoveredDocumentId === doc.id;
                  const rowBlockShape = getConnectedRowBlockShape(
                    highlighted,
                    previousHighlighted,
                    nextHighlighted,
                  );
                  const rowStateClass = selected
                    ? hoveredDocumentId === doc.id
                      ? `${rowBlockShape} bg-primary/25 text-ink shadow-[inset_3px_0_0_hsl(var(--primary)/0.65)]`
                      : `${rowBlockShape} bg-primary/15 text-ink hover:!bg-primary/25 hover:!shadow-[inset_3px_0_0_hsl(var(--primary)/0.65)]`
                    : hoveredDocumentId === doc.id
                      ? `${rowBlockShape} bg-surface-2 text-ink shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)]`
                      : "rounded-[7px] hover:!bg-surface-2 hover:!shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)]";

                  return (
                    <div
                      key={doc.id}
                      role="button"
                      tabIndex={0}
                      className={`group grid min-h-[36px] cursor-pointer items-center px-2 py-1 text-[11px] transition-none ${rowStateClass}`}
                      style={{ gridTemplateColumns: documentGridTemplate }}
                      onPointerEnter={() => setHoveredDocumentId(doc.id)}
                      onPointerLeave={() => setHoveredDocumentId(null)}
                      onFocus={() => setHoveredDocumentId(doc.id)}
                      onBlur={() => setHoveredDocumentId(null)}
                      onClick={() => toggleDocumentSelection(doc.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleDocumentSelection(doc.id);
                        }
                      }}
                    >
                      <div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleDocumentSelection(doc.id);
                          }}
                          tabIndex={
                            selected || hoveredDocumentId === doc.id ? 0 : -1
                          }
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition-none ${
                            selected
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                          } ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-surface-1/70 hover:border-primary/70"
                          }`}
                          aria-label={`${selected ? "Unselect" : "Select"} ${doc.name}`}
                        >
                          {selected ? <Check size={10} weight="bold" /> : null}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/${workspaceSlug}/documents/${doc.id}`);
                        }}
                        className="flex min-w-0 items-center gap-2 rounded-[6px] text-left transition-colors hover:bg-surface-3/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        aria-label={`Open ${doc.name}`}
                        title={`Open ${doc.name}`}
                      >
                        {getFileIcon(doc.fileExtension)}
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-ink transition-colors group-hover:text-primary">
                            {doc.name}
                          </span>
                          <span className="truncate font-mono text-[10px] text-ink-muted">
                            {doc.fileName}
                          </span>
                        </div>
                      </button>

                      {visibleDisplayProperties.includes("classification") && (
                        <div onClick={(event) => event.stopPropagation()}>
                          <DocumentClassificationBadge doc={doc} />
                        </div>
                      )}

                      {/* Some rows carry a membership id while others carry a user id. */}
                      {visibleDisplayProperties.includes("uploader") && (
                        <DocumentActor
                          label="Uploader"
                          showLabel={false}
                          member={
                            findDocumentMember(
                              workspaceMembers,
                              doc.uploadedBy,
                            ) ?? undefined
                          }
                        />
                      )}

                      {visibleDisplayProperties.includes("approver") && (
                        <DocumentActor
                          label="Approver"
                          showLabel={false}
                          member={
                            findDocumentMember(
                              workspaceMembers,
                              doc.approvedBy,
                            ) ?? undefined
                          }
                        />
                      )}

                      {visibleDisplayProperties.includes("modified") && (
                        <span className="text-[11px] font-medium text-ink-muted">
                          {formatDate(doc.updatedAt || doc.createdAt)}
                        </span>
                      )}

                      {visibleDisplayProperties.includes("size") && (
                        <span className="font-mono text-[11px] text-ink-muted">
                          {formatBytes(doc.sizeBytes)}
                        </span>
                      )}

                      {visibleDisplayProperties.includes("actions") && (
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              router.push(
                                `/${workspaceSlug}/documents/${doc.id}`,
                              )
                            }
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {canManageDoc &&
                            (doc.status?.toLowerCase() === "archived" ? (
                              <button
                                onClick={() => handleRestore(doc.id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-primary/10 hover:text-primary"
                                title="Restore Document"
                              >
                                <ArrowCounterClockwise className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleArchive(doc.id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-amber-500/10 hover:text-amber-500"
                                title="Archive Document"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            ))}

                          {canManageDoc && (
                            <button
                              onClick={() =>
                                setDocToDelete({ id: doc.id, name: doc.name })
                              }
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Delete Permanently"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          /* Grid Card View */
          <section className="min-h-full px-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {sortedDocs.map((doc) => (
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
                    <DocumentClassificationBadge doc={doc} compact />
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
                        member={
                          findDocumentMember(
                            workspaceMembers,
                            doc.uploadedBy,
                          ) ?? undefined
                        }
                      />
                      <DocumentActor
                        label="Approver"
                        member={
                          findDocumentMember(
                            workspaceMembers,
                            doc.approvedBy,
                          ) ?? undefined
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {hasSelectedDocuments ? (
          <div className="pointer-events-none sticky bottom-5 z-10 flex justify-center">
            <div
              ref={selectionActionRef}
              className="pointer-events-auto flex h-10 w-[344px] items-center justify-center gap-1.5 rounded-full border border-border/60 bg-surface-2/95 px-2.5 text-[11px] font-medium text-ink shadow-xl shadow-black/10 backdrop-blur will-change-transform"
            >
              <span className="w-[74px] shrink-0 text-center">
                {selectedDocuments.length} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-[96px] shrink-0 rounded-full px-2 text-[11px]"
                onClick={toggleSelectAllVisibleDocuments}
              >
                <Checks size={12} />
                {allVisibleDocumentsSelected ? "Unselect all" : "Select all"}
              </Button>
              <button
                type="button"
                onClick={handleAskAiAboutSelection}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                aria-label="Ask AI about selected documents"
                title="Ask AI"
              >
                <PaperPlaneTilt size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={handleArchiveSelectedDocuments}
                disabled={
                  archiveMutation.isPending ||
                  restoreMutation.isPending ||
                  (selectedArchiveTargets.length === 0 &&
                    selectedRestoreTargets.length === 0)
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-amber-500/10 hover:text-amber-500 disabled:pointer-events-none disabled:opacity-50"
                aria-label={selectionArchiveLabel}
                title={
                  selectedRestoreTargets.length > 0 ? "Restore" : "Archive"
                }
              >
                {selectedRestoreTargets.length > 0 ? (
                  <ArrowCounterClockwise size={12} weight="bold" />
                ) : (
                  <Archive size={12} weight="bold" />
                )}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedDocuments}
                disabled={
                  deleteMutation.isPending ||
                  selectedManageableDocuments.length === 0
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                aria-label="Delete selected documents"
                title="Delete"
              >
                <Trash size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDocumentIds([])}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                aria-label="Clear selected documents"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
          </div>
        ) : null}

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
      </div>

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
                    Supported: PDF, DOCX, XLSX, MD, PNG, JPG, JPEG, WEBP, BMP,
                    GIF (Max 10MB)
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
      <DocumentDeleteDialog
        docToDelete={docToDelete}
        onClose={() => setDocToDelete(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

function DocumentClassificationBadge({
  doc,
  compact = false,
}: {
  doc: WorkspaceDocumentDto;
  compact?: boolean;
}) {
  const meta = getDocumentClassificationMeta(doc);

  return (
    <span
      className={`inline-flex max-w-full items-center truncate text-[11px] font-medium text-ink-muted ${compact ? "text-right text-[10px]" : ""}`}
      title={meta.label}
    >
      {meta.label}
    </span>
  );
}

function SortableColumnHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full py-1 text-left transition-colors ${
        active
          ? "-ml-2 bg-surface-2 px-2 font-semibold text-foreground"
          : "px-0 text-ink-muted hover:text-ink"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === "asc" ? (
            <CaretUp size={10} weight="bold" />
          ) : (
            <CaretDown size={10} weight="bold" />
          )
        ) : null}
      </span>
    </button>
  );
}

function compareDocuments(
  first: WorkspaceDocumentDto,
  second: WorkspaceDocumentDto,
  sortKey: DocumentSortKey,
  members: WorkspaceMemberDto[],
) {
  if (sortKey === "name") return compareText(first.name, second.name);
  if (sortKey === "classification") {
    return compareText(
      getDocumentClassificationLabel(first),
      getDocumentClassificationLabel(second),
    );
  }
  if (sortKey === "uploader") {
    return compareText(
      getDocumentActorLabel(first.uploadedBy, members),
      getDocumentActorLabel(second.uploadedBy, members),
    );
  }
  if (sortKey === "approver") {
    return compareText(
      getDocumentActorLabel(first.approvedBy, members),
      getDocumentActorLabel(second.approvedBy, members),
    );
  }
  if (sortKey === "modified") {
    return compareNullableDate(
      first.updatedAt || first.createdAt,
      second.updatedAt || second.createdAt,
    );
  }

  return first.sizeBytes - second.sizeBytes;
}

function getDocumentClassificationLabel(doc: WorkspaceDocumentDto) {
  return getDocumentClassificationMeta(doc).label;
}

function getDocumentClassificationMeta(doc: WorkspaceDocumentDto) {
  const status = doc.status?.toLowerCase() ?? "";
  const ingestionStatus = doc.ingestionStatus?.toLowerCase() ?? "";

  if (
    status === WORKSPACE_DOCUMENT_STATUS.PENDING_APPROVAL ||
    status.includes("pending")
  ) {
    return {
      label: "Pending Approval",
    };
  }
  if (
    doc.confidentialityLevel ===
    WORKSPACE_DOCUMENT_CONFIDENTIALITY_LEVEL.RESTRICTED
  ) {
    return {
      label: "Restricted",
    };
  }
  if (!doc.isAiAllowed) {
    return {
      label: "Administrative",
    };
  }
  if (ingestionStatus === WORKSPACE_DOCUMENT_INGESTION_STATUS.COMPLETED) {
    return {
      label: "AI Ready",
    };
  }
  if (ingestionStatus === WORKSPACE_DOCUMENT_INGESTION_STATUS.FAILED) {
    return {
      label: "AI Failed",
    };
  }
  if (
    ingestionStatus === WORKSPACE_DOCUMENT_INGESTION_STATUS.PENDING ||
    ingestionStatus === WORKSPACE_DOCUMENT_INGESTION_STATUS.PROCESSING
  ) {
    return {
      label: "Processing AI",
    };
  }
  return {
    label: "AI Context",
  };
}

function getDocumentActorLabel(
  memberId: string | null | undefined,
  members: WorkspaceMemberDto[],
) {
  const member = findDocumentMember(members, memberId);
  return member?.fullName || member?.email || "";
}

function findDocumentMember(
  members: WorkspaceMemberDto[],
  memberId: string | null | undefined,
) {
  if (!memberId) return null;
  return (
    members.find(
      (member) => member.userId === memberId || member.id === memberId,
    ) ?? null
  );
}

function compareNullableDate(first: string | null, second: string | null) {
  if (!first && !second) return 0;
  if (!first) return 1;
  if (!second) return -1;
  return new Date(first).getTime() - new Date(second).getTime();
}

function compareText(first: string, second: string) {
  return first.localeCompare(second, undefined, { sensitivity: "base" });
}

function canManageDocument(
  doc: WorkspaceDocumentDto,
  canApproveDocuments: boolean,
  userId: string | null | undefined,
) {
  return (
    canApproveDocuments || doc.uploadedBy === userId || doc.ownerId === userId
  );
}

function isArchivedDocument(doc: WorkspaceDocumentDto) {
  return doc.status?.toLowerCase() === "archived";
}

function formatSelectedDocumentNames(documents: WorkspaceDocumentDto[]) {
  if (documents.length === 0) return "None";
  const names = documents.slice(0, 5).map((doc) => doc.name);
  const suffix =
    documents.length > names.length
      ? ` +${documents.length - names.length} more`
      : "";
  return `${names.join(", ")}${suffix}`;
}

function getConnectedRowBlockShape(
  highlighted: boolean,
  previousHighlighted: boolean,
  nextHighlighted: boolean,
) {
  if (!highlighted) return "rounded-[7px]";
  if (previousHighlighted && nextHighlighted) return "rounded-none";
  if (previousHighlighted) return "rounded-b-[7px] rounded-t-none";
  if (nextHighlighted) return "rounded-b-none rounded-t-[7px]";
  return "rounded-[7px]";
}
