"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  CheckCircle,
  ClockCounterClockwise,
  Globe,
  PencilSimple,
  Plus,
  ShieldWarning,
  Spinner,
  Trash,
  Upload,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
} from "@/components/admin/admin-page-chrome";

export default function AdminGlobalGlossaryPage() {
  const t = useTranslations("adminGlobalGlossary");
  const isSystemAdmin = useIsSystemAdmin();

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("all");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [termToEdit, setTermToEdit] = useState<GlobalGlossaryTermDto | null>(null);
  const [auditsTermId, setAuditsTermId] = useState<string | null>(null);
  const [termToDelete, setTermToDelete] = useState<{
    id: string;
    term: string;
  } | null>(null);
  const [csvText, setCsvText] = useState("");

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

  if (!isSystemAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <ShieldWarning className="h-10 w-10 text-ink-muted" />
        <p className="text-sm font-semibold text-ink">{t("accessDenied.title")}</p>
        <p className="text-xs text-ink-muted max-w-sm">{t("accessDenied.description")}</p>
      </div>
    );
  }

  const terms = termsQuery.data?.items ?? [];
  const totalCount = termsQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

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

        <AdminFilterTabs
          tabs={statusFilters.map((s) => ({
            value: s,
            label: t(`filters.status.${s}`),
          }))}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          label={t("filters.statusLabel")}
          trailing={
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("filters.searchPlaceholder")}
              className="h-7 w-[240px] text-[12px] shadow-none"
            />
          }
        />

      <Card className="mt-4 border-border bg-surface-1 shadow-none">

        <CardContent className="p-0 overflow-x-auto">
          {termsQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : terms.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center p-6">
              <Globe className="h-8 w-8 text-ink-muted" />
              <p className="text-sm font-medium">{t("table.emptyTitle")}</p>
            </div>
          ) : (
            <div className="min-w-[800px] divide-y divide-hairline">
              <div className="grid grid-cols-[1fr_1fr_100px_80px_90px_140px] items-center gap-3 px-4 py-2 bg-surface-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                <span className="truncate">{t("table.term")}</span>
                <span className="truncate">{t("table.translation")}</span>
                <span className="truncate">{t("table.domain")}</span>
                <span className="truncate">{t("table.priority")}</span>
                <span className="truncate">{t("table.status")}</span>
                <span className="text-right truncate">{t("table.actions")}</span>
              </div>

              {terms.map((term) => (
                <div
                  key={term.id}
                  className="grid grid-cols-[1fr_1fr_100px_80px_90px_140px] items-center gap-3 px-4 py-2.5 hover:bg-surface-2/30 transition-colors"
                >
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
                  <span className="text-xs text-primary font-semibold truncate">
                    {term.preferredTranslation}
                  </span>
                  <span className="text-xs text-ink-muted truncate">
                    {term.businessDomain || t("table.noDomain")}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {term.priority}
                  </span>
                  <Badge
                    variant={
                      term.status === "published" ? "default" : "secondary"
                    }
                    className="w-fit capitalize"
                  >
                    {t(`filters.status.${term.status}`)}
                  </Badge>
                  <div className="flex justify-end items-center gap-1">
                    <button
                      onClick={() => openEditDialog(term)}
                      className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
                      title={t("rowActions.edit")}
                    >
                      <PencilSimple className="h-3.5 w-3.5" />
                    </button>
                    {term.status !== "published" && (
                      <button
                        onClick={() => handlePublish(term.id, term.term)}
                        disabled={publishMutation.isPending}
                        className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-primary/10 hover:text-primary transition-colors"
                        title={t("rowActions.publish")}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {term.status !== "archived" && (
                      <button
                        onClick={() => handleArchive(term.id, term.term)}
                        disabled={archiveMutation.isPending}
                        className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-surface-2 transition-colors"
                        title={t("rowActions.archive")}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setAuditsTermId(term.id)}
                      className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-surface-2 transition-colors"
                      title={t("rowActions.viewAuditHistory")}
                    >
                      <ClockCounterClockwise className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        setTermToDelete({ id: term.id, term: term.term })
                      }
                      className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title={t("rowActions.delete")}
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-ink-muted">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-7 px-2.5 rounded-md border border-hairline bg-surface-1 disabled:opacity-40"
          >
            {t("pagination.previous")}
          </button>
          <span>{t("pagination.summary", { page, totalPages, count: totalCount })}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="h-7 px-2.5 rounded-md border border-hairline bg-surface-1 disabled:opacity-40"
          >
            {t("pagination.next")}
          </button>
        </div>
      )}

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
            className="flex flex-col gap-3 my-2"
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
            className="flex flex-col gap-3 my-2"
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
