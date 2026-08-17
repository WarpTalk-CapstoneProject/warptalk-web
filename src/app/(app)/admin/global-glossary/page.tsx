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
import { useState } from "react";
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
    .min(
      3,
      "Term must be at least 3 characters — short/common words risk hijacking every meeting's STT.",
    ),
  preferredTranslation: z
    .string()
    .min(1, "Preferred translation cannot be empty"),
  sourceLanguage: glossaryLanguageField,
  targetLanguage: glossaryLanguageField,
  businessDomain: z.string().optional(),
  definition: z.string().optional(),
  usageNote: z.string().optional(),
  priority: z.number().min(0).max(10),
});

type TermFormData = z.infer<typeof termSchema>;

const statusFilters = ["all", "draft", "published", "archived"] as const;
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
} from "@/components/admin/admin-page-chrome";

export default function AdminGlobalGlossaryPage() {
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
        <p className="text-sm font-semibold text-ink">Admin access required</p>
        <p className="text-xs text-ink-muted max-w-sm">
          The global glossary is a system-wide baseline applied to every
          workspace. Only platform administrators can view or edit it.
        </p>
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
      setTermToDelete(null);
    } catch {
      toast.error("Failed to delete term.");
    }
  };

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
    <AdminPage>
        <AdminPageHeader
          eyebrow="Platform terminology"
          eyebrowIcon={<Globe size={14} weight="fill" />}
          title="Global Glossary"
          description="System-wide terminology baseline applied to every workspace (unless it opts out). A workspace’s own glossary term always overrides a matching global term."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsBulkImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Bulk import CSV
              </Button>
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New term
              </Button>
            </>
          }
        />

        <AdminFilterTabs
          tabs={statusFilters.map((s) => ({
            value: s,
            label: s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1),
          }))}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          label="Term status"
          trailing={
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search term or translation…"
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
              <p className="text-sm font-medium">No terms found</p>
            </div>
          ) : (
            <div className="min-w-[800px] divide-y divide-hairline">
              <div className="grid grid-cols-[1fr_1fr_100px_80px_90px_140px] items-center gap-3 px-4 py-2 bg-surface-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                <span>Term</span>
                <span>Translation</span>
                <span>Domain</span>
                <span>Priority</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
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
                    {term.businessDomain || "—"}
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
                    {term.status}
                  </Badge>
                  <div className="flex justify-end items-center gap-1">
                    <button
                      onClick={() => openEditDialog(term)}
                      className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
                      title="Edit"
                    >
                      <PencilSimple className="h-3.5 w-3.5" />
                    </button>
                    {term.status !== "published" && (
                      <button
                        onClick={() => handlePublish(term.id, term.term)}
                        disabled={publishMutation.isPending}
                        className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-primary/10 hover:text-primary transition-colors"
                        title="Publish"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {term.status !== "archived" && (
                      <button
                        onClick={() => handleArchive(term.id, term.term)}
                        disabled={archiveMutation.isPending}
                        className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-surface-2 transition-colors"
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setAuditsTermId(term.id)}
                      className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-surface-2 transition-colors"
                      title="View audit history"
                    >
                      <ClockCounterClockwise className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        setTermToDelete({ id: term.id, term: term.term })
                      }
                      className="h-6 w-6 flex items-center justify-center rounded text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete"
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

      {/* Create Term Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold text-base">
              New Global Glossary Term
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Created as a draft — publish explicitly to make it live for every
              workspace.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit(handleCreate)}
            className="flex flex-col gap-3 my-2 max-h-[60vh] overflow-y-auto pr-1"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Term</label>
              <Input
                className="h-8 border-hairline text-xs"
                placeholder="e.g. architect"
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
                Preferred Translation
              </label>
              <Input
                className="h-8 border-hairline text-xs"
                placeholder="e.g. architect (keep verbatim)"
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
                <label className="text-xs font-semibold">Source Lang (opt.)</label>
                <select
                  className="h-8 rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink"
                  {...register("sourceLanguage")}
                >
                  {/* Empty is a real, meaningful choice: a term with no language applies to
                      ALL of them. Named so nobody has to guess what a blank row means. */}
                  <option value="">All languages</option>
                  {glossaryLanguages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Target Lang (opt.)</label>
                <select
                  className="h-8 rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink"
                  {...register("targetLanguage")}
                >
                  <option value="">All languages</option>
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
                Business Domain (opt.)
              </label>
              <Input
                className="h-8 border-hairline text-xs"
                placeholder="e.g. IT, Finance"
                {...register("businessDomain")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Definition</label>
              <Input
                className="h-8 border-hairline text-xs"
                placeholder="required before publishing"
                {...register("definition")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Usage Note (opt.)</label>
              <Input
                className="h-8 border-hairline text-xs"
                {...register("usageNote")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Priority (0-10)</label>
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-8 px-4 rounded bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition"
              >
                {isSubmitting ? (
                  <Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  "Create Draft"
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
              Edit Global Glossary Term
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Updates are audited and apply immediately when the term is published.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={editForm.handleSubmit(handleUpdate)}
            className="flex flex-col gap-3 my-2 max-h-[60vh] overflow-y-auto pr-1"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Term</label>
              <Input className="h-8 border-hairline text-xs" {...editForm.register("term")} />
              {editForm.formState.errors.term && (
                <p className="text-[10px] text-destructive">
                  {editForm.formState.errors.term.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Preferred Translation</label>
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
                <Input className="h-8 border-hairline text-xs" {...editForm.register("sourceLanguage")} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Target Lang</label>
                <Input className="h-8 border-hairline text-xs" {...editForm.register("targetLanguage")} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Business Domain</label>
              <Input className="h-8 border-hairline text-xs" {...editForm.register("businessDomain")} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Definition</label>
              <Input className="h-8 border-hairline text-xs" {...editForm.register("definition")} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Usage Note</label>
              <Input className="h-8 border-hairline text-xs" {...editForm.register("usageNote")} />
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
            <DialogFooter className="mt-2 flex gap-2">
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
          <div className="max-h-[50vh] overflow-y-auto flex flex-col gap-2">
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
    </AdminPage>
  );
}
