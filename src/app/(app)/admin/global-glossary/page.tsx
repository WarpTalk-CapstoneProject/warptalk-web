"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  CaretDown,
  CaretUp,
  Check,
  CheckCircle,
  Checks,
  ClockCounterClockwise,
  Funnel,
  Globe,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  ShieldWarning,
  SlidersHorizontal,
  Spinner,
  Trash,
  Upload,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import gsap from "gsap";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import {
  useArchiveGlobalGlossaryTerm,
  useBulkImportGlobalGlossaryTerms,
  useCreateGlobalGlossaryTerm,
  useDeleteGlobalGlossaryTerm,
  useGlobalGlossaryAudits,
  useGlobalGlossaryTerms,
  usePublishGlobalGlossaryTerm,
  useUpdateGlobalGlossaryTerm,
} from "@/hooks/use-global-glossary";
import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import { languagesInScope } from "@/lib/language/languages";
import type { GlobalGlossaryTermDto } from "@/types/global-glossary";

/**
 * WT-461: the languages a global glossary term may name.
 *
 * From the shared registry rather than a list written here, because that registry is the one
 * checked against the live catalogue by `./catalog-drift` — a hardcoded array in this file is
 * exactly the drift that check exists to catch.
 *
 * Empty/absent is legal and means "applies to every language"; only a NON-empty value has to be
 * a language the system knows.
 */
const glossaryLanguages = languagesInScope("glossary");
const glossaryLanguageCodes = new Set(glossaryLanguages.map((language) => language.code));

/** Empty (all languages) or a known code — nothing else. */
const glossaryLanguageField = z
  .string()
  .optional()
  .refine((value) => !value || glossaryLanguageCodes.has(value), {
    message: "Choose a language the system supports, or leave it as All languages.",
  });

const termSchema = z.object({
  term: z
    .string()
    .trim()
    .min(
      3,
      "Term must be at least 3 characters — short/common words risk hijacking every meeting's STT.",
    )
    .max(255, "Term cannot exceed 255 characters."),
  preferredTranslation: z
    .string()
    .trim()
    .min(1, "Preferred translation cannot be empty")
    .max(255, "Preferred translation cannot exceed 255 characters."),
  sourceLanguage: glossaryLanguageField,
  targetLanguage: glossaryLanguageField,
  businessDomain: z.string().max(100, "Business domain cannot exceed 100 characters.").optional(),
  definition: z.string().optional(),
  usageNote: z.string().optional(),
  priority: z.number().min(0).max(10),
});

type TermFormData = z.infer<typeof termSchema>;

function getCreateDraftBlockReasons(values: Partial<TermFormData>) {
  const reasons: string[] = [];
  const term = values.term?.trim() ?? "";
  const preferredTranslation = values.preferredTranslation?.trim() ?? "";
  const priority = Number(values.priority);

  if (term.length === 0) {
    reasons.push("Enter a term.");
  } else if (term.length < 3) {
    reasons.push("Use at least 3 characters for the term.");
  } else if (term.length > 255) {
    reasons.push("Keep the term under 255 characters.");
  }

  if (preferredTranslation.length === 0) {
    reasons.push("Enter a preferred translation.");
  } else if (preferredTranslation.length > 255) {
    reasons.push("Keep the preferred translation under 255 characters.");
  }

  if (values.sourceLanguage && values.sourceLanguage.length > 15) {
    reasons.push("Keep source language under 15 characters.");
  }

  if (values.targetLanguage && values.targetLanguage.length > 15) {
    reasons.push("Keep target language under 15 characters.");
  }

  if (values.businessDomain && values.businessDomain.length > 100) {
    reasons.push("Keep business domain under 100 characters.");
  }

  if (!Number.isFinite(priority) || priority < 0 || priority > 10) {
    reasons.push("Set priority from 0 to 10.");
  }

  return reasons;
}

const statusFilters = ["all", "draft", "published", "archived"] as const;

type GlossaryStatusFilter = (typeof statusFilters)[number];
type SortDirection = "asc" | "desc";
type GlossarySortKey =
  "term" | "translation" | "domain" | "priority" | "status" | "updated";
type GlossaryDisplayProperty =
  "translation" | "domain" | "priority" | "status" | "updated" | "actions";

const GLOSSARY_FILTER_WIDTH_CLASS: Record<GlossaryStatusFilter, string> = {
  all: "w-[58px]",
  draft: "w-[78px]",
  published: "w-[104px]",
  archived: "w-[96px]",
};

const GLOSSARY_SORT_COLUMNS: Array<{
  key: GlossarySortKey;
  label: string;
  align?: "right";
}> = [
  { key: "term", label: "Term" },
  { key: "translation", label: "Translation" },
  { key: "domain", label: "Domain" },
  { key: "priority", label: "Priority", align: "right" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Updated", align: "right" },
];

const GLOSSARY_DISPLAY_PROPERTIES: Array<{
  key: GlossaryDisplayProperty;
  label: string;
}> = [
  { key: "translation", label: "Translation" },
  { key: "domain", label: "Domain" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Updated" },
  { key: "actions", label: "Actions" },
];

const DEFAULT_GLOSSARY_DISPLAY_PROPERTIES = GLOSSARY_DISPLAY_PROPERTIES.map(
  (property) => property.key,
);

function getGlossaryGridTemplate(visibleProperties: GlossaryDisplayProperty[]) {
  return [
    "16px",
    "minmax(260px,1.55fr)",
    visibleProperties.includes("translation") ? "minmax(220px,1.2fr)" : null,
    visibleProperties.includes("domain") ? "130px" : null,
    visibleProperties.includes("priority") ? "80px" : null,
    visibleProperties.includes("status") ? "100px" : null,
    visibleProperties.includes("updated") ? "122px" : null,
    visibleProperties.includes("actions") ? "150px" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function AdminGlobalGlossaryPage() {
  const isSystemAdmin = useIsSystemAdmin();

  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<GlossarySortKey>("term");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [visibleDisplayProperties, setVisibleDisplayProperties] = useState<
    GlossaryDisplayProperty[]
  >(DEFAULT_GLOSSARY_DISPLAY_PROPERTIES);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [termToEdit, setTermToEdit] = useState<GlobalGlossaryTermDto | null>(
    null,
  );
  const [auditsTermId, setAuditsTermId] = useState<string | null>(null);
  const [termToDelete, setTermToDelete] = useState<{
    id: string;
    term: string;
  } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [selectedTermIds, setSelectedTermIds] = useState<string[]>([]);
  const [hoveredTermId, setHoveredTermId] = useState<string | null>(null);
  const selectionActionRef = useRef<HTMLDivElement | null>(null);

  const query = {
    page,
    pageSize,
    status: status === "all" ? undefined : status,
    search: search || undefined,
  };

  const termsQuery = useGlobalGlossaryTerms(query);
  const auditsQuery = useGlobalGlossaryAudits(auditsTermId || "");
  const createMutation = useCreateGlobalGlossaryTerm();
  const updateMutation = useUpdateGlobalGlossaryTerm(termToEdit?.id ?? "");
  const deleteMutation = useDeleteGlobalGlossaryTerm();
  const publishMutation = usePublishGlobalGlossaryTerm();
  const archiveMutation = useArchiveGlobalGlossaryTerm();
  const bulkImportMutation = useBulkImportGlobalGlossaryTerms();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TermFormData>({
    resolver: zodResolver(termSchema),
    mode: "onChange",
    defaultValues: { term: "", preferredTranslation: "", priority: 5 },
  });
  const editForm = useForm<TermFormData>({
    resolver: zodResolver(termSchema),
    defaultValues: { term: "", preferredTranslation: "", priority: 5 },
  });

  const terms = useMemo(
    () => termsQuery.data?.items ?? [],
    [termsQuery.data?.items],
  );
  const totalCount = termsQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const glossaryGridTemplate = useMemo(
    () => getGlossaryGridTemplate(visibleDisplayProperties),
    [visibleDisplayProperties],
  );
  const sortedTerms = useMemo(() => {
    return [...terms].sort((first, second) => {
      const result = compareGlossaryTerms(first, second, sortKey);
      return sortDirection === "asc" ? result : -result;
    });
  }, [sortDirection, sortKey, terms]);
  const selectedTerms = terms.filter((term) =>
    selectedTermIds.includes(term.id),
  );
  const visibleTermIds = sortedTerms.map((term) => term.id);
  const allVisibleTermsSelected =
    visibleTermIds.length > 0 &&
    visibleTermIds.every((id) => selectedTermIds.includes(id));
  const hasSelectedTerms = selectedTerms.length > 0;
  const createFormValues = useWatch({ control });
  const createDraftBlockReasons =
    getCreateDraftBlockReasons(createFormValues);
  const isCreateDraftBlocked =
    createDraftBlockReasons.length > 0 ||
    isSubmitting ||
    createMutation.isPending;
  const selectedPublishTargets = selectedTerms.filter(
    (term) => term.status !== "published",
  );
  const selectedArchiveTargets = selectedTerms.filter(
    (term) => term.status !== "archived",
  );

  useEffect(() => {
    if (!hasSelectedTerms || !selectionActionRef.current) return;

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
  }, [hasSelectedTerms]);

  function toggleDisplayProperty(property: string) {
    setVisibleDisplayProperties((current) => {
      const typedProperty = property as GlossaryDisplayProperty;
      if (current.includes(typedProperty)) {
        if (sortKey === typedProperty) setSortKey("term");
        return current.filter((item) => item !== typedProperty);
      }

      return [...current, typedProperty];
    });
  }

  function handleSort(nextSortKey: GlossarySortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

  if (!isSystemAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <ShieldWarning className="h-10 w-10 text-ink-muted" />
        <p className="text-sm font-semibold text-ink">Admin access required</p>
        <p className="max-w-sm text-xs text-ink-muted">
          The global glossary is a system-wide baseline applied to every
          workspace. Only platform administrators can view or edit it.
        </p>
      </div>
    );
  }

  const handleCreate = async (data: TermFormData) => {
    try {
      await createMutation.mutateAsync({
        term: data.term,
        preferredTranslation: data.preferredTranslation,
        sourceLanguage: data.sourceLanguage || null,
        targetLanguage: data.targetLanguage || null,
        businessDomain: data.businessDomain || null,
        definition: data.definition || null,
        usageNote: data.usageNote || null,
        priority: data.priority,
      });
      toast.success(`Term "${data.term}" created as draft.`);
      reset();
      setIsCreateOpen(false);
    } catch {
      toast.error("Failed to create term.");
    }
  };

  const openEditDialog = (term: GlobalGlossaryTermDto) => {
    setTermToEdit(term);
    editForm.reset({
      term: term.term,
      preferredTranslation: term.preferredTranslation,
      sourceLanguage: term.sourceLanguage ?? "",
      targetLanguage: term.targetLanguage ?? "",
      businessDomain: term.businessDomain ?? "",
      definition: term.definition ?? "",
      usageNote: term.usageNote ?? "",
      priority: term.priority,
    });
  };

  const handleUpdate = async (data: TermFormData) => {
    if (!termToEdit) return;
    try {
      await updateMutation.mutateAsync({
        term: data.term,
        preferredTranslation: data.preferredTranslation,
        sourceLanguage: data.sourceLanguage || null,
        targetLanguage: data.targetLanguage || null,
        businessDomain: data.businessDomain || null,
        definition: data.definition || null,
        usageNote: data.usageNote || null,
        priority: data.priority,
      });
      toast.success(`Term "${data.term}" updated.`);
      setTermToEdit(null);
    } catch {
      toast.error("Failed to update term.");
    }
  };

  const handlePublish = async (id: string, term: string) => {
    try {
      await publishMutation.mutateAsync(id);
      toast.success(
        `"${term}" published — now live for every opted-in workspace.`,
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to publish term (a definition is required).";
      toast.error(message);
    }
  };

  const handleArchive = async (id: string, term: string) => {
    try {
      await archiveMutation.mutateAsync(id);
      toast.success(`"${term}" archived.`);
    } catch {
      toast.error("Failed to archive term.");
    }
  };

  const handleDelete = async () => {
    if (!termToDelete) return;
    try {
      await deleteMutation.mutateAsync(termToDelete.id);
      toast.success(`"${termToDelete.term}" deleted.`);
      setSelectedTermIds((current) =>
        current.filter((id) => id !== termToDelete.id),
      );
      setTermToDelete(null);
    } catch {
      toast.error("Failed to delete term.");
    }
  };

  function toggleTermSelection(termId: string) {
    setSelectedTermIds((current) =>
      current.includes(termId)
        ? current.filter((id) => id !== termId)
        : [...current, termId],
    );
  }

  function toggleSelectAllVisibleTerms() {
    setSelectedTermIds((current) => {
      if (allVisibleTermsSelected) {
        return current.filter((id) => !visibleTermIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleTermIds]));
    });
  }

  function handleAskAiAboutSelection() {
    if (selectedTerms.length === 0) return;

    const prompt =
      selectedTerms.length === 1
        ? `Review this global glossary term: ${selectedTerms[0].term} -> ${selectedTerms[0].preferredTranslation}. Include its status, priority, domain, definition readiness, and any risk before it applies platform-wide.`
        : `Review these ${selectedTerms.length} selected global glossary terms: ${formatSelectedGlossaryTermNames(selectedTerms)}. Summarize duplicates, weak definitions, risky translations, priority conflicts, and which ones should be published, archived, or revised.`;

    window.dispatchEvent(
      new CustomEvent("warptalk:open-assistant", { detail: { prompt } }),
    );
    toast.success("Selected terms attached to WarpBot.");
  }

  async function handlePublishSelectedTerms() {
    if (selectedPublishTargets.length === 0) {
      toast.error("Selected terms are already published.");
      return;
    }

    try {
      for (const term of selectedPublishTargets) {
        await publishMutation.mutateAsync(term.id);
      }
      setSelectedTermIds((current) =>
        current.filter(
          (id) => !selectedPublishTargets.some((term) => term.id === id),
        ),
      );
      toast.success(
        `${selectedPublishTargets.length} selected term${
          selectedPublishTargets.length === 1 ? "" : "s"
        } published.`,
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to publish selected terms.";
      toast.error(message);
    }
  }

  async function handleArchiveSelectedTerms() {
    if (selectedArchiveTargets.length === 0) {
      toast.error("Selected terms are already archived.");
      return;
    }

    try {
      for (const term of selectedArchiveTargets) {
        await archiveMutation.mutateAsync(term.id);
      }
      setSelectedTermIds((current) =>
        current.filter(
          (id) => !selectedArchiveTargets.some((term) => term.id === id),
        ),
      );
      toast.success(
        `${selectedArchiveTargets.length} selected term${
          selectedArchiveTargets.length === 1 ? "" : "s"
        } archived.`,
      );
    } catch {
      toast.error("Failed to archive selected terms.");
    }
  }

  async function handleDeleteSelectedTerms() {
    if (selectedTerms.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${selectedTerms.length} selected term${
        selectedTerms.length === 1 ? "" : "s"
      } permanently?`,
    );
    if (!confirmed) return;

    try {
      for (const term of selectedTerms) {
        await deleteMutation.mutateAsync(term.id);
      }
      setSelectedTermIds([]);
      toast.success("Selected terms deleted.");
    } catch {
      toast.error("Failed to delete selected terms.");
    }
  }

  const handleBulkImport = async () => {
    const lines = csvText.split(/\r?\n/).map((l) => l.split(","));
    const headers = lines[0]?.map((h) => h.trim()) || [];
    const idx = (name: string) => headers.indexOf(name);
    const termIdx = idx("Term");
    const transIdx = idx("Translation");

    if (termIdx === -1 || transIdx === -1) {
      toast.error("CSV must include at least Term and Translation columns.");
      return;
    }

    const rows = lines
      .slice(1)
      .filter((r) => r.length >= 2 && r[termIdx]?.trim())
      .map((r) => ({
        term: r[termIdx].trim(),
        preferredTranslation: r[transIdx]?.trim() || r[termIdx].trim(),
        sourceLanguage:
          idx("SourceLanguage") >= 0
            ? r[idx("SourceLanguage")]?.trim() || null
            : null,
        targetLanguage:
          idx("TargetLanguage") >= 0
            ? r[idx("TargetLanguage")]?.trim() || null
            : null,
        businessDomain:
          idx("BusinessDomain") >= 0
            ? r[idx("BusinessDomain")]?.trim() || null
            : null,
        definition:
          idx("Definition") >= 0 ? r[idx("Definition")]?.trim() || null : null,
        usageNote:
          idx("UsageNote") >= 0 ? r[idx("UsageNote")]?.trim() || null : null,
        priority: idx("Priority") >= 0 ? Number(r[idx("Priority")]) || 5 : 5,
      }));

    if (rows.length === 0) {
      toast.error("No valid rows found.");
      return;
    }

    // WT-461: the CSV path bypasses the form, so it needs the same rule stated again here.
    // Rejecting the whole file rather than dropping the offending rows: a partial import that
    // silently skipped lines would leave the admin believing terms exist that do not, and a bad
    // language is not visibly broken — it stores fine and simply never matches.
    const badLanguages = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.sourceLanguage, row.targetLanguage])
          .filter((value): value is string => Boolean(value))
          .filter((value) => !glossaryLanguageCodes.has(value)),
      ),
    );
    if (badLanguages.length > 0) {
      toast.error(
        `Unknown language code(s): ${badLanguages.join(", ")}. Use ${[...glossaryLanguageCodes].join(", ")}, or leave the column blank for all languages.`,
      );
      return;
    }

    try {
      const result = await bulkImportMutation.mutateAsync({ rows });
      toast.success(`Imported ${result.imported}, skipped ${result.skipped}.`);
      if (result.errors.length > 0) {
        toast.info(
          `${result.errors.length} row(s) had issues — check console.`,
        );
        console.warn("Bulk import issues:", result.errors);
      }
      setCsvText("");
      setIsBulkImportOpen(false);
    } catch {
      toast.error("Bulk import failed.");
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-2 px-2 pb-1.5 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-[260px] flex-1 items-center gap-2 overflow-x-auto hide-scrollbar">
            {statusFilters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setStatus(item);
                  setPage(1);
                }}
                className={`flex h-[26px] ${GLOSSARY_FILTER_WIDTH_CLASS[item]} items-center justify-center rounded-full border px-3 text-[12px] font-medium capitalize transition-colors select-none ${
                  status === item
                    ? "border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
                    : "border-[#e2e3e7] bg-transparent text-[#6b7280] hover:border-[#d6d7dc] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:border-[#25272b] dark:text-[#9fa0a5] dark:hover:border-[#303236] dark:hover:bg-[#232524] dark:hover:text-white"
                }`}
              >
                {item === "all" ? "All" : item}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ExpandingSearchDock
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search terms..."
              ariaLabel="Search glossary terms"
              collapsedWidth={28}
              expandedWidth={220}
              className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
              iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
              clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
              inputClassName="h-[26px] text-[12px]"
            />
            <button
              type="button"
              className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              title="Glossary filters"
            >
              <Funnel weight="bold" size={13} />
              {(status !== "all" || Boolean(search.trim())) && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
              )}
            </button>
            <ListDisplayPopover
              trigger={<SlidersHorizontal weight="bold" size={13} />}
              triggerClassName="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              triggerTitle={`${totalCount} terms`}
              ordering={sortKey}
              orderingOptions={GLOSSARY_SORT_COLUMNS.map((column) => ({
                value: column.key,
                label: column.label,
                disabled:
                  column.key !== "term" &&
                  !visibleDisplayProperties.includes(
                    column.key as GlossaryDisplayProperty,
                  ),
              }))}
              onOrderingChange={(value) => setSortKey(value as GlossarySortKey)}
              direction={sortDirection}
              onDirectionChange={setSortDirection}
              properties={GLOSSARY_DISPLAY_PROPERTIES}
              visibleProperties={visibleDisplayProperties}
              onToggleProperty={toggleDisplayProperty}
              onReset={() => {
                setSortKey("term");
                setSortDirection("asc");
                setVisibleDisplayProperties(
                  DEFAULT_GLOSSARY_DISPLAY_PROPERTIES,
                );
              }}
            />
            <div className="mx-1 h-4 w-[1px] bg-border" />
            <button
              type="button"
              onClick={() => setIsBulkImportOpen(true)}
              className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[12px] font-medium text-ink shadow-sm transition hover:bg-surface-2"
            >
              <Upload className="h-3.5 w-3.5 text-primary" />
              <span>Bulk import CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground pl-2.5 pr-3 text-[13px] font-medium text-background shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New term</span>
            </button>
          </div>
        </div>

        <section className="mt-0.2 min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-2 pb-2">
          {termsQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : terms.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center p-6">
              <Globe className="h-8 w-8 text-ink-muted" />
              <p className="text-sm font-medium">No terms found</p>
            </div>
          ) : (
            <div className="min-w-[1080px]">
              <div
                className="grid items-center gap-3 px-2 py-0.5 text-[11px] font-medium text-ink-muted"
                style={{ gridTemplateColumns: glossaryGridTemplate }}
              >
                <div />
                <SortableColumnHeader
                  label="Term"
                  active={sortKey === "term"}
                  direction={sortDirection}
                  onClick={() => handleSort("term")}
                />
                {visibleDisplayProperties.includes("translation") && (
                  <SortableColumnHeader
                    label="Translation"
                    active={sortKey === "translation"}
                    direction={sortDirection}
                    onClick={() => handleSort("translation")}
                  />
                )}
                {visibleDisplayProperties.includes("domain") && (
                  <SortableColumnHeader
                    label="Domain"
                    active={sortKey === "domain"}
                    direction={sortDirection}
                    onClick={() => handleSort("domain")}
                  />
                )}
                {visibleDisplayProperties.includes("priority") && (
                  <SortableColumnHeader
                    label="Priority"
                    active={sortKey === "priority"}
                    direction={sortDirection}
                    align="right"
                    onClick={() => handleSort("priority")}
                  />
                )}
                {visibleDisplayProperties.includes("status") && (
                  <SortableColumnHeader
                    label="Status"
                    active={sortKey === "status"}
                    direction={sortDirection}
                    onClick={() => handleSort("status")}
                  />
                )}
                {visibleDisplayProperties.includes("updated") && (
                  <SortableColumnHeader
                    label="Updated"
                    active={sortKey === "updated"}
                    direction={sortDirection}
                    align="right"
                    onClick={() => handleSort("updated")}
                  />
                )}
                {visibleDisplayProperties.includes("actions") && (
                  <span className="text-right">Actions</span>
                )}
              </div>

              <div className="space-y-0">
                {sortedTerms.map((term, index) => {
                  const selected = selectedTermIds.includes(term.id);
                  const previousTerm =
                    index > 0 ? sortedTerms[index - 1] : null;
                  const nextTerm =
                    index < sortedTerms.length - 1
                      ? sortedTerms[index + 1]
                      : null;
                  const previousHighlighted =
                    Boolean(previousTerm) &&
                    (selectedTermIds.includes(previousTerm!.id) ||
                      hoveredTermId === previousTerm!.id);
                  const nextHighlighted =
                    Boolean(nextTerm) &&
                    (selectedTermIds.includes(nextTerm!.id) ||
                      hoveredTermId === nextTerm!.id);
                  const highlighted = selected || hoveredTermId === term.id;
                  const rowBlockShape = getConnectedRowBlockShape(
                    highlighted,
                    previousHighlighted,
                    nextHighlighted,
                  );
                  const rowStateClass = selected
                    ? hoveredTermId === term.id
                      ? `${rowBlockShape} bg-primary/25 text-ink shadow-[inset_3px_0_0_hsl(var(--primary)/0.65)]`
                      : `${rowBlockShape} bg-primary/15 text-ink hover:!bg-primary/25 hover:!shadow-[inset_3px_0_0_hsl(var(--primary)/0.65)]`
                    : hoveredTermId === term.id
                      ? `${rowBlockShape} bg-surface-2 text-ink shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)]`
                      : "rounded-[7px] hover:!bg-surface-2 hover:!shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)]";

                  return (
                    <div
                      key={term.id}
                      role="button"
                      tabIndex={0}
                      className={`group grid min-h-[36px] cursor-pointer items-center gap-3 px-2 py-1 text-[11px] transition-none ${rowStateClass}`}
                      style={{ gridTemplateColumns: glossaryGridTemplate }}
                      onPointerEnter={() => setHoveredTermId(term.id)}
                      onPointerLeave={() => setHoveredTermId(null)}
                      onFocus={() => setHoveredTermId(term.id)}
                      onBlur={() => setHoveredTermId(null)}
                      onClick={() => toggleTermSelection(term.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleTermSelection(term.id);
                        }
                      }}
                    >
                      <div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleTermSelection(term.id);
                          }}
                          tabIndex={
                            selected || hoveredTermId === term.id ? 0 : -1
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
                          aria-label={`${selected ? "Unselect" : "Select"} ${term.term}`}
                        >
                          {selected ? <Check size={10} weight="bold" /> : null}
                        </button>
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-ink truncate block">
                          {term.term}
                        </span>
                        {term.definition && (
                          <span className="text-[10px] text-ink-muted truncate block">
                            {term.definition}
                          </span>
                        )}
                      </div>
                      {visibleDisplayProperties.includes("translation") && (
                        <span className="text-xs text-primary font-semibold truncate">
                          {term.preferredTranslation}
                        </span>
                      )}
                      {visibleDisplayProperties.includes("domain") && (
                        <span className="text-xs text-ink-muted truncate">
                          {term.businessDomain || "—"}
                        </span>
                      )}
                      {visibleDisplayProperties.includes("priority") && (
                        <span className="text-xs text-ink-muted">
                          {term.priority}
                        </span>
                      )}
                      {visibleDisplayProperties.includes("status") && (
                        <Badge
                          variant={
                            term.status === "published"
                              ? "default"
                              : "secondary"
                          }
                          className="w-fit capitalize"
                        >
                          {term.status}
                        </Badge>
                      )}
                      {visibleDisplayProperties.includes("updated") && (
                        <span className="text-right text-xs font-medium text-ink-muted">
                          {formatDate(term.updatedAt)}
                        </span>
                      )}
                      {visibleDisplayProperties.includes("actions") && (
                        <div
                          className="flex justify-end items-center gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            onClick={() => openEditDialog(term)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                            title="Edit"
                          >
                            <PencilSimple className="h-3.5 w-3.5" />
                          </button>
                          {term.status !== "published" && (
                            <button
                              onClick={() => handlePublish(term.id, term.term)}
                              disabled={publishMutation.isPending}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                              title="Publish"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {term.status !== "archived" && (
                            <button
                              onClick={() => handleArchive(term.id, term.term)}
                              disabled={archiveMutation.isPending}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-amber-500/10 hover:text-amber-500 disabled:pointer-events-none disabled:opacity-50"
                              title="Archive"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setAuditsTermId(term.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                            title="View audit history"
                          >
                            <ClockCounterClockwise className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setTermToDelete({ id: term.id, term: term.term })
                            }
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {hasSelectedTerms ? (
          <div className="pointer-events-none sticky bottom-5 z-10 flex justify-center">
            <div
              ref={selectionActionRef}
              className="pointer-events-auto flex h-10 w-[392px] items-center justify-center gap-1.5 rounded-full border border-border/60 bg-surface-2/95 px-2.5 text-[11px] font-medium text-ink shadow-xl shadow-black/10 backdrop-blur will-change-transform"
            >
              <span className="w-[74px] shrink-0 text-center">
                {selectedTerms.length} selected
              </span>
              <button
                type="button"
                onClick={toggleSelectAllVisibleTerms}
                className="inline-flex h-7 w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-2 text-[11px] font-medium text-ink transition-colors hover:bg-surface-3"
              >
                <Checks size={12} weight="bold" />
                {allVisibleTermsSelected ? "Unselect all" : "Select all"}
              </button>
              <button
                type="button"
                onClick={handleAskAiAboutSelection}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                aria-label="Ask AI about selected terms"
                title="Ask AI"
              >
                <PaperPlaneTilt size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() =>
                  selectedTerms[0] && openEditDialog(selectedTerms[0])
                }
                disabled={selectedTerms.length !== 1}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                aria-label="Edit selected term"
                title="Edit"
              >
                <PencilSimple size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={handlePublishSelectedTerms}
                disabled={
                  publishMutation.isPending ||
                  selectedPublishTargets.length === 0
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                aria-label="Publish selected terms"
                title="Publish"
              >
                <CheckCircle size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={handleArchiveSelectedTerms}
                disabled={
                  archiveMutation.isPending ||
                  selectedArchiveTargets.length === 0
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-amber-500/10 hover:text-amber-500 disabled:pointer-events-none disabled:opacity-50"
                aria-label="Archive selected terms"
                title="Archive"
              >
                <Archive size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedTerms}
                disabled={deleteMutation.isPending}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                aria-label="Delete selected terms"
                title="Delete"
              >
                <Trash size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedTermIds([])}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                aria-label="Clear selected terms"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
          </div>
        ) : null}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2 text-xs text-ink-muted">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2.5 rounded-md border border-hairline bg-surface-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({totalCount} terms)
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 px-2.5 rounded-md border border-hairline bg-surface-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create Term Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden border-hairline bg-surface-1 p-0 sm:max-w-[960px]">
          <DialogHeader className="border-b border-hairline px-6 py-4">
            <DialogTitle className="text-base font-semibold tracking-[-0.01em] text-ink">
              New Global Glossary Term
            </DialogTitle>
            <DialogDescription className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
              Created as a draft — publish explicitly to make it live for every
              workspace.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit(handleCreate)}
            className="grid min-w-0 gap-4 px-6 py-4"
          >
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_140px]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink">
                  Term <span className="text-destructive">*</span>
                </label>
                <Input
                  className="h-10 border-hairline bg-surface-0 text-sm"
                  placeholder="e.g. architect"
                  aria-invalid={!!errors.term}
                  {...register("term")}
                />
                <p className="min-h-4 text-[11px] leading-4 text-ink-muted">
                  {errors.term?.message ?? "At least 3 characters."}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink">
                  Preferred Translation{" "}
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  className="h-10 border-hairline bg-surface-0 text-sm"
                  placeholder="e.g. architect (keep verbatim)"
                  aria-invalid={!!errors.preferredTranslation}
                  {...register("preferredTranslation")}
                />
                <p className="min-h-4 text-[11px] leading-4 text-ink-muted">
                  {errors.preferredTranslation?.message ??
                    "The term's preferred rendering."}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink">
                  Priority (0-10)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  className="h-10 border-hairline bg-surface-0 text-sm"
                  aria-invalid={!!errors.priority}
                  {...register("priority", { valueAsNumber: true })}
                />
                <p className="min-h-4 text-[11px] leading-4 text-ink-muted">
                  {errors.priority?.message ?? "Higher terms win conflicts."}
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[150px_150px_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink">
                  Source Lang
                </label>
                <select
                  className="h-10 rounded-md border border-hairline bg-surface-0 px-2 text-sm text-ink"
                  {...register("sourceLanguage")}
                >
                  <option value="">All languages</option>
                  {glossaryLanguages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
                <p className="min-h-4 text-[11px] leading-4 text-ink-muted">
                  {errors.sourceLanguage?.message ?? "Optional."}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink">
                  Target Lang
                </label>
                <select
                  className="h-10 rounded-md border border-hairline bg-surface-0 px-2 text-sm text-ink"
                  {...register("targetLanguage")}
                >
                  <option value="">All languages</option>
                  {glossaryLanguages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
                <p className="min-h-4 text-[11px] leading-4 text-ink-muted">
                  {errors.targetLanguage?.message ?? "Optional."}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink">
                  Business Domain
                </label>
                <Input
                  className="h-10 border-hairline bg-surface-0 text-sm"
                  placeholder="e.g. IT, Finance"
                  aria-invalid={!!errors.businessDomain}
                  {...register("businessDomain")}
                />
                <p className="min-h-4 text-[11px] leading-4 text-ink-muted">
                  {errors.businessDomain?.message ?? "Optional, max 100."}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink">
                  Definition
                </label>
                <Textarea
                  className="min-h-16 resize-none border-hairline bg-surface-0 text-sm"
                  placeholder="Required before publishing"
                  {...register("definition")}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink">
                  Usage Note
                </label>
                <Textarea
                  className="min-h-16 resize-none border-hairline bg-surface-0 text-sm"
                  placeholder="Optional context for translators"
                  {...register("usageNote")}
                />
              </div>
            </div>
            <DialogFooter className="-mx-6 -mb-4 mt-0 flex border-t border-hairline bg-surface-0 px-6 py-3">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="h-9 rounded-md border border-hairline bg-surface-1 px-3 text-xs font-semibold text-ink transition hover:bg-surface-2"
              >
                Cancel
              </button>
              <span className="group relative inline-flex">
                <button
                  type="submit"
                  disabled={isCreateDraftBlocked}
                  aria-describedby={
                    createDraftBlockReasons.length > 0
                      ? "create-draft-requirements"
                      : undefined
                  }
                  className="inline-flex h-9 min-w-[118px] items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-ink/25 disabled:text-white/80"
                >
                  {isSubmitting || createMutation.isPending ? (
                    <Spinner className="h-4 w-4 animate-spin" />
                  ) : (
                    "Create Draft"
                  )}
                </button>
                {createDraftBlockReasons.length > 0 ? (
                  <div
                    id="create-draft-requirements"
                    role="tooltip"
                    className="pointer-events-none absolute bottom-[calc(100%+10px)] right-0 z-20 w-72 translate-y-1 rounded-lg border border-hairline bg-surface-1 p-3 text-left text-xs text-ink opacity-0 shadow-xl transition-all delay-500 duration-150 group-hover:translate-y-0 group-hover:opacity-100"
                  >
                    <p className="font-semibold">Complete these first</p>
                    <ul className="mt-2 space-y-1 text-ink-muted">
                      {createDraftBlockReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </span>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Term Dialog */}
      <Dialog
        open={!!termToEdit}
        onOpenChange={(open) => !open && setTermToEdit(null)}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-bold text-base">
              Edit Global Glossary Term
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Updates are audited and apply immediately when the term is
              published.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={editForm.handleSubmit(handleUpdate)}
            className="my-2 grid min-w-0 gap-3 overflow-hidden sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Term</label>
              <Input
                className="h-8 border-hairline text-xs"
                {...editForm.register("term")}
              />
              {editForm.formState.errors.term && (
                <p className="text-[10px] text-destructive">
                  {editForm.formState.errors.term.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">
                Preferred Translation
              </label>
              <Input
                className="h-8 border-hairline text-xs"
                {...editForm.register("preferredTranslation")}
              />
              {editForm.formState.errors.preferredTranslation && (
                <p className="text-[10px] text-destructive">
                  {editForm.formState.errors.preferredTranslation.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Source Lang</label>
                <Input
                  className="h-8 border-hairline text-xs"
                  {...editForm.register("sourceLanguage")}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Target Lang</label>
                <Input
                  className="h-8 border-hairline text-xs"
                  {...editForm.register("targetLanguage")}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Business Domain</label>
              <Input
                className="h-8 border-hairline text-xs"
                {...editForm.register("businessDomain")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Definition</label>
              <Input
                className="h-8 border-hairline text-xs"
                {...editForm.register("definition")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Usage Note</label>
              <Input
                className="h-8 border-hairline text-xs"
                {...editForm.register("usageNote")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Priority (0-10)</label>
              <Input
                type="number"
                min={0}
                max={10}
                className="h-8 border-hairline text-xs"
                {...editForm.register("priority", { valueAsNumber: true })}
              />
            </div>
            <DialogFooter className="col-span-full !mx-0 !mb-0 mt-1 flex gap-2 bg-transparent p-0">
              <button
                type="button"
                onClick={() => setTermToEdit(null)}
                className="h-8 px-3 rounded border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="h-8 px-4 rounded bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition disabled:opacity-50"
              >
                {updateMutation.isPending ? (
                  <Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  "Save Changes"
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={isBulkImportOpen} onOpenChange={setIsBulkImportOpen}>
        <DialogContent className="border-hairline bg-surface-1 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-bold text-base">
              Bulk Import (CSV)
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Headers:
              Term,Translation,SourceLanguage,TargetLanguage,BusinessDomain,Definition,UsageNote,Priority
              (only Term and Translation are required). Imported rows land as
              drafts.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Term,Translation,Definition&#10;sprint,sprint,A fixed short work cycle in Agile"
            className="h-40 w-full rounded-md border border-hairline bg-surface-2 p-2 text-xs font-mono outline-none focus:border-primary"
          />
          <DialogFooter className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setIsBulkImportOpen(false)}
              className="h-8 px-3 rounded border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkImport}
              disabled={bulkImportMutation.isPending || !csvText.trim()}
              className="h-8 px-4 rounded bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition disabled:opacity-50"
            >
              {bulkImportMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin" />
              ) : (
                "Import"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog
        open={!!auditsTermId}
        onOpenChange={(open) => !open && setAuditsTermId(null)}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-bold text-base">
              Audit History
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Who changed this term, and when.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-hidden">
            {auditsQuery.isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Spinner className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : !auditsQuery.data || auditsQuery.data.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-6">
                No audit entries yet.
              </p>
            ) : (
              auditsQuery.data.map((audit) => (
                <div
                  key={audit.id}
                  className="rounded-md border border-hairline bg-surface-2 p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {audit.action}
                    </Badge>
                    <span className="text-[10px] text-ink-muted">
                      {new Date(audit.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-ink-muted mt-1">
                    Actor: {audit.actorUserId}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!termToDelete}
        onOpenChange={(open) => !open && setTermToDelete(null)}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center font-bold text-base">
              Delete Term?
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted">
              This removes{" "}
              <span className="font-semibold text-ink">
                {termToDelete?.term}
              </span>{" "}
              from the global glossary for every workspace. This cannot be
              undone from the UI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <button
              onClick={() => setTermToDelete(null)}
              className="flex-1 h-8 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 h-8 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableColumnHeader({
  label,
  active,
  direction,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  align?: "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full py-1 text-left transition-colors ${
        align === "right" ? "justify-self-end pr-2 text-right" : ""
      } ${
        active
          ? align === "right"
            ? "bg-surface-2 px-2 font-semibold text-foreground"
            : "-ml-2 bg-surface-2 px-2 font-semibold text-foreground"
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

function compareGlossaryTerms(
  first: GlobalGlossaryTermDto,
  second: GlobalGlossaryTermDto,
  sortKey: GlossarySortKey,
) {
  if (sortKey === "term") return compareText(first.term, second.term);
  if (sortKey === "translation") {
    return compareText(first.preferredTranslation, second.preferredTranslation);
  }
  if (sortKey === "domain") {
    return compareText(first.businessDomain || "", second.businessDomain || "");
  }
  if (sortKey === "priority") return first.priority - second.priority;
  if (sortKey === "status") return compareText(first.status, second.status);
  return (
    new Date(first.updatedAt).getTime() - new Date(second.updatedAt).getTime()
  );
}

function compareText(first: string, second: string) {
  return first.localeCompare(second, undefined, { sensitivity: "base" });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatSelectedGlossaryTermNames(terms: GlobalGlossaryTermDto[]) {
  if (terms.length === 0) return "None";
  const names = terms
    .slice(0, 5)
    .map((term) => `${term.term} -> ${term.preferredTranslation}`);
  const suffix =
    terms.length > names.length ? ` +${terms.length - names.length} more` : "";
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
