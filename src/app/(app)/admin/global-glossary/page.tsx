"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  CheckCircle,
  ClockCounterClockwise,
  FolderSimple,
  Globe,
  PencilSimple,
  Plus,
  ShieldWarning,
  Spinner,
  Translate,
  Trash,
  Upload,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  AdminStatusTabs,
  useAdminActionIntent,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { enumValue, type ListStateConfig } from "@/lib/admin/list-state";
import { languagesInScope } from "@/lib/language/languages";
import type {
  GlobalGlossaryTermDto,
  GlobalGlossaryTermQuery,
  GlobalGlossaryTermSort,
} from "@/types/global-glossary";

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

type TermFormTranslator = (key: string) => string;

/** Schema is built per-render (inside the component) so its messages come from `t`. */
function buildTermSchema(t: TermFormTranslator) {
  /** Empty (all languages) or a known code — nothing else. */
  const glossaryLanguageField = z
    .string()
    .optional()
    .refine((value) => !value || glossaryLanguageCodes.has(value), {
      message: t("validation.invalidLanguage"),
    });

  return z.object({
    term: z.string().min(3, t("validation.termMin")),
    preferredTranslation: z.string().min(1, t("validation.translationRequired")),
    sourceLanguage: glossaryLanguageField,
    targetLanguage: glossaryLanguageField,
    businessDomain: z.string().optional(),
    definition: z.string().optional(),
    usageNote: z.string().optional(),
    priority: z.number().min(0).max(10),
  });
}

type TermFormData = z.infer<ReturnType<typeof buildTermSchema>>;

const statusFilters = ["all", "draft", "published", "archived"] as const;
const TERM_STATUSES = ["draft", "published", "archived"] as const;

const PAGE_SIZE = 20;

/**
 * The glossary listing's view, in the URL. Status is what the tabs write (`status=`); the rest is
 * the Filter menu. Every filter and every order is server-side (GET /admin/global-glossary).
 *
 * Domain is free text on the term, so its def carries no `values`: a link's domain is sent as
 * typed and the server matches it exactly.
 */
const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", values: TERM_STATUSES },
    { key: "domain", kind: "enum" },
    { key: "language", kind: "enum", values: glossaryLanguages.map((language) => language.code) },
  ],
  sortFields: ["priority", "updated", "created", "term"],
  defaultSort: { field: "priority", direction: "desc" },
  columns: [
    { id: "term" },
    { id: "translation" },
    { id: "languages" },
    { id: "domain" },
    { id: "priority" },
    { id: "status" },
    { id: "updated", defaultHidden: true },
    { id: "created", defaultHidden: true },
  ],
  groupings: ["status", "domain"],
};

/** The orders the server runs in one direction only. Term is the one it runs both ways. */
const ONE_WAY_SORTS = new Set(["priority", "updated", "created"]);

function apiSort(field: string, direction: "asc" | "desc"): GlobalGlossaryTermSort {
  if (field === "term") return direction === "desc" ? "term_desc" : "term_asc";
  if (field === "updated") return "updated_desc";
  if (field === "created") return "created_desc";
  return "priority_desc";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

/**
 * Every business domain this page has seen, so the Domain filter can offer them. Accumulated, not
 * read off the current page: with "Domain is legal" applied every row says legal, and a menu built
 * from the page would offer nothing else. Adjusted during render, React's pattern for derived state.
 */
function useSeenDomains(values: readonly string[]): string[] {
  const [seen, setSeen] = useState<string[]>([]);
  const missing = Array.from(new Set(values.filter((value) => value && !seen.includes(value))));
  if (missing.length > 0) setSeen([...seen, ...missing]);
  return missing.length > 0 ? [...seen, ...missing] : seen;
}

function GlobalGlossaryAdmin() {
  const t = useTranslations("adminGlobalGlossary");
  const isSystemAdmin = useIsSystemAdmin();
  const list = useAdminListState(LIST_CONFIG);
  const { state } = list;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [termToEdit, setTermToEdit] = useState<GlobalGlossaryTermDto | null>(null);
  const [auditsTermId, setAuditsTermId] = useState<string | null>(null);
  const [termToDelete, setTermToDelete] = useState<{
    id: string;
    term: string;
  } | null>(null);
  const [csvText, setCsvText] = useState("");

  // The palette's "Add glossary term" and "Import glossary" actions.
  useAdminActionIntent({
    create: () => setIsCreateOpen(true),
    import: () => setIsBulkImportOpen(true),
  });

  // Priority, updated and created run newest/highest first only. A link or the Display panel's
  // direction button can still ask for ascending; snap back rather than show an arrow the rows
  // do not follow.
  const { setSort } = list;
  useEffect(() => {
    if (ONE_WAY_SORTS.has(state.sort.field) && state.sort.direction === "asc") {
      setSort(state.sort.field, "desc");
    }
  }, [state.sort.field, state.sort.direction, setSort]);

  const status = enumValue(state.filters, "status");
  const domain = enumValue(state.filters, "domain");
  const language = enumValue(state.filters, "language");

  const query = useMemo<GlobalGlossaryTermQuery>(
    () => ({
      page: state.page,
      pageSize: PAGE_SIZE,
      status,
      businessDomain: domain,
      language,
      search: state.search || undefined,
      sort: apiSort(state.sort.field, state.sort.direction),
    }),
    [state.page, status, domain, language, state.search, state.sort.field, state.sort.direction],
  );

  const termsQuery = useGlobalGlossaryTerms(query);
  const auditsQuery = useGlobalGlossaryAudits(auditsTermId || "");
  const createMutation = useCreateGlobalGlossaryTerm();
  const updateMutation = useUpdateGlobalGlossaryTerm(termToEdit?.id ?? "");
  const deleteMutation = useDeleteGlobalGlossaryTerm();
  const publishMutation = usePublishGlobalGlossaryTerm();
  const archiveMutation = useArchiveGlobalGlossaryTerm();
  const bulkImportMutation = useBulkImportGlobalGlossaryTerms();

  const termSchema = useMemo(() => buildTermSchema(t), [t]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TermFormData>({
    resolver: zodResolver(termSchema),
    defaultValues: { term: "", preferredTranslation: "", priority: 5 },
  });
  const editForm = useForm<TermFormData>({
    resolver: zodResolver(termSchema),
    defaultValues: { term: "", preferredTranslation: "", priority: 5 },
  });

  const terms = termsQuery.data?.items ?? [];
  const domains = useSeenDomains([
    ...terms.map((term) => term.businessDomain ?? ""),
    ...(domain ? [domain] : []),
  ]);

  if (!isSystemAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <ShieldWarning className="h-10 w-10 text-ink-muted" />
        <p className="text-sm font-semibold text-ink">{t("accessDenied.title")}</p>
        <p className="text-xs text-ink-muted max-w-sm">{t("accessDenied.description")}</p>
      </div>
    );
  }

  const totalCount = termsQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
      toast.success(t("toasts.createdDraft", { term: data.term }));
      reset();
      setIsCreateOpen(false);
    } catch {
      toast.error(t("toasts.createFailed"));
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
      toast.success(t("toasts.updated", { term: data.term }));
      setTermToEdit(null);
    } catch {
      toast.error(t("toasts.updateFailed"));
    }
  };

  const handlePublish = async (id: string, term: string) => {
    try {
      await publishMutation.mutateAsync(id);
      toast.success(t("toasts.published", { term }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("toasts.publishFailedDefault");
      toast.error(message);
    }
  };

  const handleArchive = async (id: string, term: string) => {
    try {
      await archiveMutation.mutateAsync(id);
      toast.success(t("toasts.archived", { term }));
    } catch {
      toast.error(t("toasts.archiveFailed"));
    }
  };

  const handleDelete = async () => {
    if (!termToDelete) return;
    try {
      await deleteMutation.mutateAsync(termToDelete.id);
      toast.success(t("toasts.deleted", { term: termToDelete.term }));
      setTermToDelete(null);
    } catch {
      toast.error(t("toasts.deleteFailed"));
    }
  };

  const handleBulkImport = async () => {
    const lines = csvText.split(/\r?\n/).map((l) => l.split(","));
    const headers = lines[0]?.map((h) => h.trim()) || [];
    const idx = (name: string) => headers.indexOf(name);
    const termIdx = idx("Term");
    const transIdx = idx("Translation");

    if (termIdx === -1 || transIdx === -1) {
      toast.error(t("toasts.csvMissingColumns"));
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
      toast.error(t("toasts.csvNoValidRows"));
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
        t("toasts.csvUnknownLanguages", {
          codes: badLanguages.join(", "),
          allowed: [...glossaryLanguageCodes].join(", "),
        }),
      );
      return;
    }

    try {
      const result = await bulkImportMutation.mutateAsync({ rows });
      toast.success(
        t("toasts.bulkImported", {
          imported: result.imported,
          skipped: result.skipped,
        }),
      );
      if (result.errors.length > 0) {
        toast.info(t("toasts.bulkImportIssues", { count: result.errors.length }));
        console.warn("Bulk import issues:", result.errors);
      }
      setCsvText("");
      setIsBulkImportOpen(false);
    } catch {
      toast.error(t("toasts.bulkImportFailed"));
    }
  };

  const statusTabs = statusFilters.map((s) => ({ value: s, label: t(`filters.status.${s}`) }));
  const statusLabel = (value: string) =>
    (TERM_STATUSES as readonly string[]).includes(value) ? t(`filters.status.${value}`) : value;
  const languageName = (code: string) =>
    glossaryLanguages.find((candidate) => candidate.code === code)?.name ?? code;

  const filterFields: AdminFilterField[] = [
    {
      key: "domain",
      label: t("list.filters.domain"),
      icon: <FolderSimple size={13} />,
      kind: "enum",
      options: domains
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value })),
    },
    {
      key: "language",
      label: t("list.filters.language"),
      icon: <Translate size={13} />,
      kind: "enum",
      options: glossaryLanguages.map((candidate) => ({ value: candidate.code, label: candidate.name, hint: candidate.code })),
    },
  ];

  const rowAction =
    "h-6 w-6 flex items-center justify-center rounded text-ink-muted transition-colors";

  const columns: AdminColumn<GlobalGlossaryTermDto>[] = [
    {
      id: "term",
      header: t("table.term"),
      primary: true,
      sortField: "term",
      cell: (term) => (
        <div className="min-w-0">
          <span className="block truncate text-xs font-semibold text-ink">{term.term}</span>
          {term.definition ? (
            <span className="block truncate text-[10px] font-normal text-ink-muted">{term.definition}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "translation",
      header: t("table.translation"),
      cell: (term) => <span className="block truncate text-xs font-semibold text-primary">{term.preferredTranslation}</span>,
    },
    {
      id: "languages",
      header: t("list.columns.languages"),
      className: "w-[120px]",
      cell: (term) => (
        <span
          className="font-mono text-[11px] uppercase text-ink-muted"
          title={`${term.sourceLanguage ? languageName(term.sourceLanguage) : t("list.anyLanguage")} → ${term.targetLanguage ? languageName(term.targetLanguage) : t("list.anyLanguage")}`}
        >
          {term.sourceLanguage ?? "*"} → {term.targetLanguage ?? "*"}
        </span>
      ),
    },
    {
      id: "domain",
      header: t("table.domain"),
      className: "w-[120px]",
      cell: (term) => <span className="block truncate text-xs text-ink-muted">{term.businessDomain || t("table.noDomain")}</span>,
    },
    {
      id: "priority",
      header: t("table.priority"),
      align: "right",
      className: "w-[90px]",
      sortField: "priority",
      defaultDirection: "desc",
      cell: (term) => <span className="text-xs text-ink-muted">{term.priority}</span>,
    },
    {
      id: "status",
      header: t("table.status"),
      className: "w-[110px]",
      cell: (term) => (
        <Badge variant={term.status === "published" ? "default" : "secondary"} className="w-fit capitalize">
          {statusLabel(term.status)}
        </Badge>
      ),
    },
    {
      id: "updated",
      header: t("list.columns.updated"),
      align: "right",
      className: "w-[120px]",
      sortField: "updated",
      defaultDirection: "desc",
      cell: (term) => <span className="text-xs text-ink-muted">{formatDate(term.updatedAt)}</span>,
    },
    {
      id: "created",
      header: t("list.columns.created"),
      align: "right",
      className: "w-[120px]",
      sortField: "created",
      defaultDirection: "desc",
      cell: (term) => <span className="text-xs text-ink-muted">{formatDate(term.createdAt)}</span>,
    },
    {
      id: "actions",
      header: t("table.actions"),
      align: "right",
      className: "w-[150px]",
      cell: (term) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openEditDialog(term)}
            className={`${rowAction} hover:bg-surface-2 hover:text-ink`}
            title={t("rowActions.edit")}
            aria-label={t("rowActions.edit")}
          >
            <PencilSimple className="h-3.5 w-3.5" />
          </button>
          {term.status !== "published" && (
            <button
              type="button"
              onClick={() => handlePublish(term.id, term.term)}
              disabled={publishMutation.isPending}
              className={`${rowAction} hover:bg-primary/10 hover:text-primary`}
              title={t("rowActions.publish")}
              aria-label={t("rowActions.publish")}
            >
              <CheckCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {term.status !== "archived" && (
            <button
              type="button"
              onClick={() => handleArchive(term.id, term.term)}
              disabled={archiveMutation.isPending}
              className={`${rowAction} hover:bg-surface-2`}
              title={t("rowActions.archive")}
              aria-label={t("rowActions.archive")}
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setAuditsTermId(term.id)}
            className={`${rowAction} hover:bg-surface-2`}
            title={t("rowActions.viewAuditHistory")}
            aria-label={t("rowActions.viewAuditHistory")}
          >
            <ClockCounterClockwise className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTermToDelete({ id: term.id, term: term.term })}
            className={`${rowAction} hover:bg-destructive/10 hover:text-destructive`}
            title={t("rowActions.delete")}
            aria-label={t("rowActions.delete")}
          >
            <Trash className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("header.eyebrow")}
        eyebrowIcon={<Globe size={14} weight="fill" />}
        title={t("header.title")}
        description={t("header.description")}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsBulkImportOpen(true)}>
              <Upload className="h-4 w-4" />
              {t("actions.bulkImportCsv")}
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("actions.newTerm")}
            </Button>
          </>
        }
      />

      <AdminStatusTabs list={list} filterKey="status" tabs={statusTabs} label={t("filters.statusLabel")} />

      <AdminListToolbar
        list={list}
        searchPlaceholder={t("filters.searchPlaceholder")}
        filters={filterFields}
        count={termsQuery.isPending ? null : totalCount}
        countLabel={t("list.termCount", { count: totalCount })}
        isFetching={termsQuery.isFetching && !termsQuery.isPending}
        display={{
          sortOptions: [
            { field: "priority", label: t("list.sortFields.priority") },
            { field: "updated", label: t("list.sortFields.updated") },
            { field: "created", label: t("list.sortFields.created") },
            { field: "term", label: t("list.sortFields.term") },
          ],
          groupOptions: [
            { key: "status", label: t("table.status") },
            { key: "domain", label: t("table.domain") },
          ],
          columns: columns
            .filter((column) => !column.primary && column.id !== "actions")
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={terms}
          rowKey={(term) => term.id}
          isPending={termsQuery.isPending}
          isError={termsQuery.isError}
          onRetry={() => void termsQuery.refetch()}
          empty={{
            title: t("table.emptyTitle"),
            description: t("list.emptyDescription"),
            icon: <Globe size={20} weight="duotone" />,
          }}
          groupings={{
            status: {
              keyOf: (term) => term.status,
              label: statusLabel,
              order: TERM_STATUSES,
            },
            domain: {
              keyOf: (term) => term.businessDomain ?? "",
              label: (key) => key || t("list.noDomainGroup"),
            },
          }}
          pagination={{ page: state.page, pageCount: totalPages, total: totalCount, pageSize: PAGE_SIZE }}
          caption={t("header.title")}
          minWidth={900}
        />
      </AdminPanel>

      {/* Create Term Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold text-base">
              {t("createDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              {t("createDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit(handleCreate)}
            className="flex flex-col gap-3 my-2 max-h-[60vh] overflow-y-auto pr-1"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.term")}</label>
              <Input
                className="h-8 border-hairline text-xs"
                placeholder={t("fields.termPlaceholder")}
                {...register("term")}
              />
              {errors.term && (
                <p className="text-[10px] text-destructive">
                  {errors.term.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">
                {t("fields.preferredTranslation")}
              </label>
              <Input
                className="h-8 border-hairline text-xs"
                placeholder={t("fields.preferredTranslationPlaceholder")}
                {...register("preferredTranslation")}
              />
              {errors.preferredTranslation && (
                <p className="text-[10px] text-destructive">
                  {errors.preferredTranslation.message}
                </p>
              )}
            </div>
            {/* WT-461. Chosen, not typed.
                These were free-text inputs, and a language the system does not know is not a
                harmless typo here: GlossaryStartedEventConsumer selects terms BY language, so a
                term saved as "Vietnamese" or "vn" instead of "vi" is stored, listed, and matches
                nothing for the rest of its life. It looks saved and silently never applies.
                The options come from the shared registry's `glossary` scope — the same source
                every other picker uses — so this cannot drift from what the pipeline accepts. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">{t("fields.sourceLanguageOptional")}</label>
                <select
                  className="h-8 rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink"
                  {...register("sourceLanguage")}
                >
                  {/* Empty is a real, meaningful choice: a term with no language applies to
                      ALL of them. Named so nobody has to guess what a blank row means. */}
                  <option value="">{t("fields.allLanguages")}</option>
                  {glossaryLanguages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">{t("fields.targetLanguageOptional")}</label>
                <select
                  className="h-8 rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink"
                  {...register("targetLanguage")}
                >
                  <option value="">{t("fields.allLanguages")}</option>
                  {glossaryLanguages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">
                {t("fields.businessDomainOptional")}
              </label>
              <Input
                className="h-8 border-hairline text-xs"
                placeholder={t("fields.businessDomainPlaceholder")}
                {...register("businessDomain")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.definition")}</label>
              <Input
                className="h-8 border-hairline text-xs"
                placeholder={t("fields.definitionPlaceholder")}
                {...register("definition")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.usageNoteOptional")}</label>
              <Input
                className="h-8 border-hairline text-xs"
                {...register("usageNote")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.priority")}</label>
              <Input
                type="number"
                min={0}
                max={10}
                className="h-8 border-hairline text-xs"
                {...register("priority", { valueAsNumber: true })}
              />
            </div>

            <DialogFooter className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="h-8 px-3 rounded border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
              >
                {t("createDialog.cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-8 px-4 rounded bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition"
              >
                {isSubmitting ? (
                  <Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  t("createDialog.submit")
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Term Dialog */}
      <Dialog
        open={!!termToEdit}
        onOpenChange={(open) => !open && setTermToEdit(null)}
      >
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold text-base">
              {t("editDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              {t("editDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={editForm.handleSubmit(handleUpdate)}
            className="flex flex-col gap-3 my-2 max-h-[60vh] overflow-y-auto pr-1"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.term")}</label>
              <Input className="h-8 border-hairline text-xs" {...editForm.register("term")} />
              {editForm.formState.errors.term && (
                <p className="text-[10px] text-destructive">
                  {editForm.formState.errors.term.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.preferredTranslation")}</label>
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
                <label className="text-xs font-semibold">{t("fields.sourceLanguage")}</label>
                <Input className="h-8 border-hairline text-xs" {...editForm.register("sourceLanguage")} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">{t("fields.targetLanguage")}</label>
                <Input className="h-8 border-hairline text-xs" {...editForm.register("targetLanguage")} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.businessDomain")}</label>
              <Input className="h-8 border-hairline text-xs" {...editForm.register("businessDomain")} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.definition")}</label>
              <Input className="h-8 border-hairline text-xs" {...editForm.register("definition")} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.usageNote")}</label>
              <Input className="h-8 border-hairline text-xs" {...editForm.register("usageNote")} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">{t("fields.priority")}</label>
              <Input
                type="number"
                min={0}
                max={10}
                className="h-8 border-hairline text-xs"
                {...editForm.register("priority", { valueAsNumber: true })}
              />
            </div>
            <DialogFooter className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setTermToEdit(null)}
                className="h-8 px-3 rounded border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
              >
                {t("editDialog.cancel")}
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="h-8 px-4 rounded bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition disabled:opacity-50"
              >
                {updateMutation.isPending ? (
                  <Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  t("editDialog.submit")
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
              {t("bulkImportDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              {t("bulkImportDialog.description")}
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
              {t("bulkImportDialog.cancel")}
            </button>
            <button
              onClick={handleBulkImport}
              disabled={bulkImportMutation.isPending || !csvText.trim()}
              className="h-8 px-4 rounded bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition disabled:opacity-50"
            >
              {bulkImportMutation.isPending ? (
                <Spinner className="h-4 w-4 animate-spin" />
              ) : (
                t("bulkImportDialog.submit")
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
              {t("auditDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              {t("auditDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto flex flex-col gap-2">
            {auditsQuery.isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Spinner className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : !auditsQuery.data || auditsQuery.data.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-6">
                {t("auditDialog.noEntries")}
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
                    {t("auditDialog.actor", { actorId: audit.actorUserId })}
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
              {t("deleteDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted">
              {t.rich("deleteDialog.description", {
                term: () => (
                  <span className="font-semibold text-ink">{termToDelete?.term}</span>
                ),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <button
              onClick={() => setTermToDelete(null)}
              className="flex-1 h-8 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
            >
              {t("deleteDialog.cancel")}
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 h-8 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition"
            >
              {t("deleteDialog.confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}

export default function AdminGlobalGlossaryPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <GlobalGlossaryAdmin />
    </Suspense>
  );
}
