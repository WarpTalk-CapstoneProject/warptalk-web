"use client";

/**
 * The workspace's own terminology, and the one place to set it up.
 *
 * WHY THIS PAGE EXISTS AGAIN
 *   It existed once, at /[workspaceSlug]/terminology, and was deleted as dead code — correctly,
 *   because nothing in the app linked to it. Deleting the page did not delete the need, and the
 *   need surfaced immediately as "tại k thấy ws glossary set up ở đâu": the feature was fully
 *   built, reachable only by typing a URL nobody knew. The whole data layer survived that
 *   deletion — WorkspaceService, the nine hooks below, the gateway route — so this rebuild is the
 *   page and a sidebar entry, nothing more.
 *
 * WHY IT IS NOT THE GLOBAL GLOSSARY, AND NOT DOCUMENTS
 *   Three surfaces get confused with each other, so each states its own job here:
 *     - GLOBAL glossary (/admin/global-glossary) is platform-wide and system-managed. A workspace
 *       cannot edit it, and it cannot know that "spread" means one thing in finance and another
 *       in manufacturing.
 *     - THIS is the workspace's answer to exactly that: "1 có từ ngữ tiếng anh mà nhiều nghĩa tùy
 *       lĩnh vực … cần ws glossary set up nghĩa nào phụ thuộc ws ở lĩnh vực nào". Workspace terms
 *       win over global ones on a collision (see GlobalGlossaryTerm's own docs).
 *     - DOCUMENTS is the knowledge base: whole files, chunked and retrieved on demand for
 *       WarpBot. It is asynchronous and about CONTENT. A glossary term is a short record applied
 *       to STT and translation in real time, during the meeting.
 *
 * SHAPE
 *   A glossary is a (source → target) language pair holding terms; a workspace may keep several.
 *   The list of glossaries is the left rail, the selected one's terms fill the page. Terms carry
 *   Domain and Context precisely because a term's correct translation is domain-dependent — that
 *   is the disambiguation the global list cannot do.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  FileArrowUp,
  Plus,
  Trash,
  MagnifyingGlass,
  BookOpen,
  Globe,
  FileXls,
} from "@phosphor-icons/react";

import {
  WorkspaceBody,
  WorkspacePage,
  WorkspacePrimaryButton,
  WorkspaceToolbar,
  WorkspaceToolbarDivider,
} from "@/components/workspace/page-chrome";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api/errors";
import { getLanguageName, meetingLanguagesForPolicy } from "@/lib/language/languages";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useAddGlossaryTerm,
  useBulkImportGlossaryTerms,
  useCreateGlossary,
  useDeleteGlossary,
  useDeleteGlossaryTerm,
  useGlossariesByWorkspace,
  useGlossaryTerms,
  useWorkspaceSettings,
} from "@/hooks/use-workspace";
// Called directly, not through a hook: the terms go into the glossary that was created a line
// earlier, and a hook bound to an id can only be bound to one the component already had.
import { WorkspaceService } from "@/services/workspace.service";
import { getInitialTermsSchema, termRowsToImport } from "@/lib/glossary/initial-terms";
import { InitialTermsField } from "@/components/glossary/initial-terms-field";
import type { GlossaryDto } from "@/types/workspace";
import type { GlobalGlossaryTermDto } from "@/types/global-glossary";
import {
  GlossaryImportDialog,
  type ParsedGlossaryRow,
} from "@/components/glossary/glossary-import-dialog";
import { WorkspaceGlobalGlossaryView } from "@/components/glossary/workspace-global-glossary-view";
import { WorkspaceImportTemplateView } from "@/components/glossary/workspace-import-template-view";
import { GlossaryPairEditor } from "@/components/glossary/glossary-pair-editor";
import { GlossaryWarpBotStatusChip } from "@/components/glossary/glossary-warpbot-status";
import {
  ALL_PAIRS,
  filterAfterPairChange,
  glossaryPairKey,
  groupGlossariesByPair,
} from "@/lib/glossary/glossary-pairs";
import {
  groupTermsByDomain,
  findCrossDomainTerms,
  normalizeDomain,
} from "@/lib/glossary/domain-grouping";

/**
 * What a new glossary starts as, on both sides.
 *
 * A code from the registry rather than a literal, so it cannot drift out of the option list the
 * selects are built from — a default that is not one of the choices renders as an empty box that
 * nonetheless passes validation.
 */
const DEFAULT_GLOSSARY_LANGUAGE = "en";

function getGlossarySchema(t: ReturnType<typeof useTranslations>) {
  return z.object({
    name: z.string().min(2, t("validation.nameMin")),
    description: z.string().optional(),
    sourceLanguage: z.string().min(1, t("validation.sourceLanguageRequired")),
    targetLanguage: z.string().min(1, t("validation.targetLanguageRequired")),
    // WT-558. The rule for what counts as a usable row lives in lib/glossary/initial-terms, so the
    // schema and the field that renders the errors cannot disagree about a half-filled row.
    initialTerms: getInitialTermsSchema((key) => t(`initialTerms.${key}`)),
  });
}
type GlossaryForm = z.infer<ReturnType<typeof getGlossarySchema>>;

function getTermSchema(t: ReturnType<typeof useTranslations>) {
  return z.object({
    sourceTerm: z.string().min(1, t("validation.sourceTermRequired")),
    targetTerm: z.string().min(1, t("validation.targetTermRequired")),
    domain: z.string().optional(),
    partOfSpeech: z.string().optional(),
    definition: z.string().optional(),
    context: z.string().optional(),
  });
}
type TermForm = z.infer<ReturnType<typeof getTermSchema>>;

export default function WorkspaceGlossaryPage() {
  const t = useTranslations("glossary");
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceRole();
  // Owners and admins curate the terminology; a member reads it. The server is the real gate —
  // this only avoids offering a control that would come back 403.
  const canManage = role === "owner" || role === "admin";

  // Tabs: Custom Glossary (Private), Global Glossary (System Reference & Tracking), and WT-880's
  // Import template (the admin-configured file shape; every member may view and download it).
  const [activeTab, setActiveTab] = useState<"custom" | "global" | "template">("custom");
  const [groupBy, setGroupBy] = useState<"domain" | "alphabetical">("domain");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");

  const glossariesQuery = useGlossariesByWorkspace(workspaceId ?? "");
  const glossaries = useMemo(() => glossariesQuery.data ?? [], [glossariesQuery.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // PO 2026-10-02: the chips are grouped by language pair and filterable by it ("English →
  // Vietnamese" is one unit; the same term lives once per pair). Derived rather than synced: the
  // first VISIBLE glossary is selected until the reader picks another, and a selection that no
  // longer exists or is filtered out falls back instead of showing an empty page. A glossary whose
  // pair is changed moves to its new group on the next render.
  const [pairFilter, setPairFilter] = useState<string>(ALL_PAIRS);
  const pairView = useMemo(
    () => groupGlossariesByPair(glossaries, pairFilter, (code) => getLanguageName(code), selectedId),
    [glossaries, pairFilter, selectedId],
  );
  const selected: GlossaryDto | undefined = pairView.selected;

  const [search, setSearch] = useState("");
  const [glossaryDialogOpen, setGlossaryDialogOpen] = useState(false);
  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // Set when the reader chose "Import terms" with no glossary yet, so the create dialog they are
  // sent through first knows to hand them back to the import rather than to an empty page.
  const [importAfterCreate, setImportAfterCreate] = useState(false);

  const termsQuery = useGlossaryTerms(selected?.id ?? "");
  const createGlossary = useCreateGlossary(workspaceId ?? "");
  const deleteGlossary = useDeleteGlossary(workspaceId ?? "");
  const addTerm = useAddGlossaryTerm(selected?.id ?? "");
  const deleteTerm = useDeleteGlossaryTerm(selected?.id ?? "");
  const bulkImport = useBulkImportGlossaryTerms(selected?.id ?? "");

  const glossarySchema = useMemo(() => getGlossarySchema(t), [t]);
  const termSchema = useMemo(() => getTermSchema(t), [t]);

  const glossaryForm = useForm<GlossaryForm>({
    resolver: zodResolver(glossarySchema),
    defaultValues: {
      name: "",
      description: "",
      sourceLanguage: DEFAULT_GLOSSARY_LANGUAGE,
      targetLanguage: DEFAULT_GLOSSARY_LANGUAGE,
      initialTerms: [{ sourceTerm: "", targetTerm: "" }],
    },
  });
  const initialTerms = useFieldArray({ control: glossaryForm.control, name: "initialTerms" });
  const termForm = useForm<TermForm>({
    resolver: zodResolver(termSchema),
    defaultValues: {
      sourceTerm: "",
      targetTerm: "",
      domain: "",
      partOfSpeech: "",
      definition: "",
      context: "",
    },
  });

  const availableCustomDomains = useMemo(() => {
    const set = new Set<string>();
    for (const term of termsQuery.data ?? []) {
      set.add(normalizeDomain(term.domain));
    }
    return Array.from(set).sort((a, b) => {
      if (a === "General") return 1;
      if (b === "General") return -1;
      return a.localeCompare(b, "vi");
    });
  }, [termsQuery.data]);

  // The domain filter belongs to the glossary it was picked in. Derived rather than reset on
  // every switch: a domain the open glossary does not have (another glossary's "Food", or one whose
  // last term was just removed) reads as "all" instead of filtering the page down to nothing while
  // the pill row — which only shows when there are 2+ domains — offers no way back.
  const activeDomain = availableCustomDomains.includes(selectedDomain) ? selectedDomain : "all";

  const terms = useMemo(() => {
    const all = termsQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter((term) => {
      if (activeDomain !== "all" && normalizeDomain(term.domain) !== activeDomain) {
        return false;
      }
      if (!needle) return true;
      return [term.sourceTerm, term.targetTerm, term.domain, term.definition, term.context]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });
  }, [termsQuery.data, search, activeDomain]);

  const customDomainGroups = useMemo(() => {
    return groupTermsByDomain(terms);
  }, [terms]);

  const crossDomainMap = useMemo(() => {
    return findCrossDomainTerms(termsQuery.data ?? [], (t) => t.sourceTerm);
  }, [termsQuery.data]);

  // WT-875 — the languages a NEW glossary may be created in are the workspace's allowed target
  // languages (Settings → Allowed Target Translation Languages), not the whole meeting scope. The
  // hierarchy is L1 workspace ⊇ L2 meeting ⊇ L3 artifact: creating something new is bounded by
  // the workspace's CURRENT policy, while reading what already exists is never filtered — so the
  // glossary pills and footer below keep naming a glossary's languages through `getLanguageName`
  // even after the policy has dropped one of them.
  //
  // Same read and same fallback as the voice page and the create-room picker: an empty or absent
  // policy means unrestricted (see `isLanguageAllowedByPolicy`), and a failed read leaves the
  // policy unknown, which the app reads the same way.
  const settingsQuery = useWorkspaceSettings(workspaceId ?? "");
  const allowedTargetLanguages = settingsQuery.data?.allowedTargetLanguages;
  // Settled, not merely successful. Until then the unrestricted fallback would briefly offer
  // languages the workspace forbids, so the pickers wait instead.
  const languagePolicyReady = settingsQuery.isFetched;
  const languageOptions = useMemo(
    () => meetingLanguagesForPolicy(allowedTargetLanguages),
    [allowedTargetLanguages],
  );
  // English when the workspace allows it, otherwise the first language it does allow. A default
  // outside the option list renders as an empty select that nonetheless passes validation.
  const defaultGlossaryLanguage = languageOptions.some(
    (language) => language.code === DEFAULT_GLOSSARY_LANGUAGE,
  )
    ? DEFAULT_GLOSSARY_LANGUAGE
    : (languageOptions[0]?.code ?? DEFAULT_GLOSSARY_LANGUAGE);

  // The form's defaults are fixed at mount, before the policy has loaded, and `reset()` after a
  // create returns to them. So whenever the dialog is open, a language the policy does not allow
  // is snapped to the default — including when the policy changes while the dialog is open.
  useEffect(() => {
    if (!glossaryDialogOpen || !languagePolicyReady) return;
    const allowed = new Set(languageOptions.map((language) => language.code));
    for (const field of ["sourceLanguage", "targetLanguage"] as const) {
      if (!allowed.has(glossaryForm.getValues(field))) {
        glossaryForm.setValue(field, defaultGlossaryLanguage);
      }
    }
  }, [glossaryDialogOpen, languagePolicyReady, languageOptions, defaultGlossaryLanguage, glossaryForm]);

  /**
   * Grouped by initial letter, alphabetical within each group.
   */
  const groupedTerms = useMemo(() => {
    const groups = new Map<string, typeof terms>();
    for (const term of terms) {
      const first = term.sourceTerm.trim().charAt(0).toLocaleUpperCase("vi");
      const letter = /\p{Letter}/u.test(first) ? first : "#";
      const bucket = groups.get(letter);
      if (bucket) bucket.push(term);
      else groups.set(letter, [term]);
    }
    for (const bucket of groups.values()) {
      bucket.sort((a, b) => a.sourceTerm.localeCompare(b.sourceTerm, "vi"));
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b, "vi");
    });
  }, [terms]);

  async function importTerms(rows: ParsedGlossaryRow[]) {
    if (!selected) return;
    try {
      const result = await bulkImport.mutateAsync(rows);
      const summary =
        result.skipped > 0
          ? t("toasts.importedSkipped", { count: result.imported, skipped: result.skipped })
          : t("toasts.imported", { count: result.imported });

      toast.success(summary, {
        description:
          result.errors.length > 0
            ? [
                ...result.errors.slice(0, 3),
                result.errors.length > 3
                  ? t("toasts.moreErrors", { count: result.errors.length - 3 })
                  : null,
              ]
                .filter(Boolean)
                .join(" ")
            : undefined,
      });
      setImportDialogOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.importFailed")));
    }
  }

  async function submitGlossary(values: GlossaryForm) {
    try {
      const created = await createGlossary.mutateAsync({
        name: values.name,
        description: values.description || null,
        sourceLanguage: values.sourceLanguage,
        targetLanguage: values.targetLanguage,
      });

      const rows = termRowsToImport(values.initialTerms);

      let importedCount = 0;
      if (rows.length > 0) {
        try {
          const result = await WorkspaceService.bulkImportTerms(created.id, rows);
          importedCount = result.imported;
        } catch (error) {
          toast.error(getErrorMessage(error, t("toasts.glossaryTermsFailed")));
        }
      }

      toast.success(
        importedCount > 0
          ? t("toasts.glossaryCreatedWithTerms", { count: importedCount })
          : t("toasts.glossaryCreated"),
      );
      setGlossaryDialogOpen(false);
      glossaryForm.reset();

      setSelectedId(created.id);
      await glossariesQuery.refetch();

      if (importAfterCreate) {
        setImportAfterCreate(false);
        setImportDialogOpen(true);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.glossaryCreateFailed")));
    }
  }

  async function submitTerm(values: TermForm) {
    if (!selected) return;
    try {
      await addTerm.mutateAsync({
        sourceTerm: values.sourceTerm,
        targetTerm: values.targetTerm,
        domain: values.domain || null,
        partOfSpeech: values.partOfSpeech || null,
        definition: values.definition || null,
        context: values.context || null,
      });
      toast.success(t("toasts.termAdded"));
      setTermDialogOpen(false);
      termForm.reset();
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.termAddFailed")));
    }
  }

  async function removeGlossary(glossary: GlossaryDto) {
    try {
      await deleteGlossary.mutateAsync(glossary.id);
      if (selectedId === glossary.id) setSelectedId(null);
      toast.success(t("toasts.glossaryDeleted"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.glossaryDeleteFailed")));
    }
  }

  async function removeTerm(termId: string) {
    try {
      await deleteTerm.mutateAsync(termId);
      toast.success(t("toasts.termRemoved"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.termRemoveFailed")));
    }
  }

  // 1-Click Customize from Global Term
  function handleCustomizeGlobalTerm(globalTerm: GlobalGlossaryTermDto) {
    setActiveTab("custom");
    termForm.reset({
      sourceTerm: globalTerm.term,
      targetTerm: globalTerm.preferredTranslation,
      domain: globalTerm.businessDomain || "",
      partOfSpeech: "",
      definition: globalTerm.definition || "",
      context: globalTerm.usageNote || "",
    });
    if (glossaries.length === 0) {
      setGlossaryDialogOpen(true);
      toast.info(t("toasts.createGlossaryFirstForCustom"));
    } else {
      setTermDialogOpen(true);
      toast.info(t("toasts.customizingTerm", { term: globalTerm.term }));
    }
  }

  if (glossariesQuery.isLoading) {
    return (
      <WorkspacePage>
        <WorkspaceBody className="pt-6">
          <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
        </WorkspaceBody>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      {/* Top Workspace Toolbar */}
      <WorkspaceToolbar
        filters={
          activeTab === "custom" && glossaries.length > 0 ? (
            // One row, two filters in order: WHICH PAIR (the select), then WHICH GLOSSARY (the
            // chips). It used to wrap, so a second pair's label and chips dropped under the select
            // and read as a stray line. The toolbar's filter slot scrolls sideways; nothing wraps.
            <div className="flex items-center gap-2">
              {/* PO 2026-10-02: filter by language pair, one unit, with counts. */}
              {pairView.options.length > 1 ? (
                <>
                  <Select value={pairView.filter} onValueChange={(value) => value && setPairFilter(value)}>
                    {/* size="sm": the trigger's own `data-[size=default]:h-9` outranks a bare `h-7`. */}
                    <SelectTrigger
                      size="sm"
                      className="shrink-0 py-0 text-[12px]"
                      aria-label={t("pairs.filterLabel")}
                    >
                      {/* WT-937: the key ("en>vi") is not a label; render what the menu item says. */}
                      <SelectValue>
                        {(value) => {
                          const option = pairView.options.find((candidate) => candidate.key === value);
                          return option
                            ? t("pairs.option", {
                                source: getLanguageName(option.source),
                                target: getLanguageName(option.target),
                                count: option.count,
                              })
                            : t("pairs.all", { count: glossaries.length });
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    {/* Below the trigger and as wide as its longest pair, not the trigger's width. */}
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      className="w-auto min-w-(--anchor-width)"
                    >
                      <SelectItem value={ALL_PAIRS} className="text-[12px]">
                        {t("pairs.all", { count: glossaries.length })}
                      </SelectItem>
                      {pairView.options.map((option) => (
                        <SelectItem key={option.key} value={option.key} className="text-[12px]">
                          {t("pairs.option", {
                            source: getLanguageName(option.source),
                            target: getLanguageName(option.target),
                            count: option.count,
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <WorkspaceToolbarDivider />
                </>
              ) : null}
              {pairView.groups.map((group, index) => (
                <Fragment key={group.key}>
                  {index > 0 ? <WorkspaceToolbarDivider /> : null}
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Filtered to one pair, the select already names it. */}
                    {pairView.filter === ALL_PAIRS ? (
                      <span className="mr-0.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                        {getLanguageName(group.source)} → {getLanguageName(group.target)}
                      </span>
                    ) : null}
                    {group.glossaries.map((glossary) => {
                      const active = selected?.id === glossary.id;
                      return (
                        <button
                          key={glossary.id}
                          type="button"
                          onClick={() => setSelectedId(glossary.id)}
                          aria-pressed={active}
                          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] transition-colors ${
                            active
                              ? "border-border bg-surface-2 font-medium text-ink"
                              : "border-transparent text-ink-muted hover:bg-surface-2"
                          }`}
                        >
                          {glossary.name}
                        </button>
                      );
                    })}
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null
        }
        actions={
          activeTab === "custom" ? (
            <>
              {selected ? (
                <div className="relative">
                  <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="h-8 w-44 pl-8 text-[12px]"
                  />
                </div>
              ) : null}
              {canManage ? (
                <>
                  <WorkspacePrimaryButton onClick={() => setGlossaryDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    {t("newGlossary")}
                  </WorkspacePrimaryButton>
                  {selected ? (
                    <>
                      <WorkspacePrimaryButton onClick={() => setImportDialogOpen(true)}>
                        <FileArrowUp className="h-3.5 w-3.5" />
                        {t("import")}
                      </WorkspacePrimaryButton>
                      <WorkspacePrimaryButton onClick={() => setTermDialogOpen(true)}>
                        <Plus className="h-3.5 w-3.5" />
                        {t("addTerm")}
                      </WorkspacePrimaryButton>
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null
        }
      />

      <WorkspaceBody>
        {/* Top Dual Tabs: Custom Glossary vs Global Glossary (Linear style) */}
        <div className="mb-4 flex items-center gap-2 border-b border-hairline pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("custom")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors -mb-[9px] ${
              activeTab === "custom"
                ? "border-ink text-ink font-semibold"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            {t("tabs.custom")}
            {glossaries.length > 0 && (
              <span className="rounded-full border border-hairline bg-surface-2 px-1.5 py-0.2 text-[10px] text-ink-subtle">
                {glossaries.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("global")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors -mb-[9px] ${
              activeTab === "global"
                ? "border-ink text-ink font-semibold"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <Globe className="h-4 w-4" />
            {t("tabs.global")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("template")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors -mb-[9px] ${
              activeTab === "template"
                ? "border-ink text-ink font-semibold"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <FileXls className="h-4 w-4" />
            {t("tabs.importTemplate")}
          </button>
        </div>

        {/* PO 2026-10-02: the open glossary's language pair, changeable in place (Owner/Admin). */}
        {activeTab === "custom" && selected && workspaceId ? (
          <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[13px] font-semibold text-ink">{selected.name}</span>
            <GlossaryPairEditor
              key={selected.id}
              workspaceId={workspaceId}
              glossary={selected}
              termCount={termsQuery.data?.length ?? selected.termCount}
              canManage={canManage}
              languages={languageOptions}
              languagesReady={languagePolicyReady}
              onChanged={(pair) => {
                // WT-937: stay on the glossary that was just relabelled. With the filter left on
                // the old pair it was filtered out and a different glossary opened in its place.
                setSelectedId(selected.id);
                setPairFilter((current) => filterAfterPairChange(current, glossaryPairKey(pair)));
              }}
            />
            {/* PO 2026-10-02: real "Loading into WarpBot knowledgebase…" → Ready / Couldn't load. */}
            <GlossaryWarpBotStatusChip
              key={`warpbot-${selected.id}`}
              glossaryId={selected.id}
              glossaryName={selected.name}
            />
          </div>
        ) : null}

        {/* Tab 3 (WT-880): the import template — view and download, every member */}
        {activeTab === "template" ? (
          <WorkspaceImportTemplateView
            initialPair={
              selected
                ? { sourceLanguage: selected.sourceLanguage, targetLanguage: selected.targetLanguage }
                : undefined
            }
          />
        ) : activeTab === "global" ? (
          /* Tab 2: Global Glossary Reference & Tracking */
          <WorkspaceGlobalGlossaryView
            canManage={canManage}
            onCustomizeTerm={handleCustomizeGlobalTerm}
          />
        ) : glossaries.length === 0 ? (
          /* Empty Workspace State */
          <PagePlaceholder
            kind="glossary"
            title={t("emptyState.title")}
            description={t("emptyState.description")}
            action={
              canManage ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <WorkspacePrimaryButton onClick={() => setGlossaryDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    {t("newGlossary")}
                  </WorkspacePrimaryButton>
                  <WorkspacePrimaryButton
                    onClick={() => {
                      setImportAfterCreate(true);
                      setGlossaryDialogOpen(true);
                    }}
                  >
                    <FileArrowUp className="h-3.5 w-3.5" />
                    {t("emptyState.importTerms")}
                  </WorkspacePrimaryButton>
                </div>
              ) : undefined
            }
          />
        ) : !selected ? null : termsQuery.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
        ) : terms.length === 0 ? (
          <PagePlaceholder
            kind="glossary"
            title={search ? t("emptyTerms.titleSearch") : t("emptyTerms.titleEmpty")}
            description={search ? undefined : t("emptyTerms.description")}
            action={
              !search && canManage ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <WorkspacePrimaryButton onClick={() => setImportDialogOpen(true)}>
                    <FileArrowUp className="h-3.5 w-3.5" />
                    {t("emptyState.importTerms")}
                  </WorkspacePrimaryButton>
                  <WorkspacePrimaryButton onClick={() => setTermDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    {t("addTerm")}
                  </WorkspacePrimaryButton>
                </div>
              ) : undefined
            }
          />
        ) : (
          /* Custom Glossary Terms View (Domain Grouping & Alphabetical) */
          <div className="flex flex-col gap-3">
            {/* View Switcher & Domain Jump Bar */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* Domain Jump Navigation (Linear pills) */}
              {availableCustomDomains.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedDomain("all")}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      activeDomain === "all"
                        ? "border-border bg-surface-3 font-semibold text-ink"
                        : "border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    {t("domains.all")}
                    <span className="text-[10px] text-ink-subtle">
                      ({termsQuery.data?.length ?? 0})
                    </span>
                  </button>
                  {availableCustomDomains.map((domain) => {
                    const domainCount = (termsQuery.data ?? []).filter(
                      (t) => normalizeDomain(t.domain) === domain,
                    ).length;
                    const active = activeDomain === domain;
                    return (
                      <button
                        key={domain}
                        type="button"
                        onClick={() => setSelectedDomain(domain)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                          active
                            ? "border-border bg-surface-3 font-semibold text-ink"
                            : "border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
                        }`}
                      >
                        {domain}
                        <span className="text-[10px] text-ink-subtle">({domainCount})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Grouping Toggle (Domain vs A-Z) */}
              <div className="flex items-center gap-1.5 self-end sm:ml-auto sm:self-auto">
                <span className="text-[11px] text-ink-subtle">{t("grouping.label")}:</span>
                <div className="inline-flex rounded-[6px] border border-hairline bg-surface-2 p-0.5">
                  <button
                    type="button"
                    onClick={() => setGroupBy("domain")}
                    className={`rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                      groupBy === "domain"
                        ? "bg-surface-1 text-ink shadow-xs"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {t("grouping.byDomain")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupBy("alphabetical")}
                    className={`rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                      groupBy === "alphabetical"
                        ? "bg-surface-1 text-ink shadow-xs"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {t("grouping.alphabetical")}
                  </button>
                </div>
              </div>
            </div>

            {/* List Rendering */}
            {groupBy === "domain" ? (
              <div className="flex flex-col gap-4">
                {customDomainGroups.map((group) => (
                  <div
                    key={group.domain}
                    className="overflow-clip rounded-lg border border-hairline"
                  >
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        {group.domain}
                        <span className="font-normal normal-case text-ink-subtle">
                          ({group.count} {t("termsCount")})
                        </span>
                      </span>
                    </div>
                    <ul className="divide-y divide-hairline bg-surface-1">
                      {group.terms.map((term) => {
                        const otherDomains = crossDomainMap.get(term);
                        return (
                          <li
                            key={term.id}
                            className="group flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-surface-2/30"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-baseline gap-1.5">
                                <span className="text-[13px] font-medium text-ink">
                                  {term.sourceTerm}
                                </span>
                                {term.partOfSpeech && (
                                  <span className="text-[11px] italic text-ink-subtle">
                                    {term.partOfSpeech}
                                  </span>
                                )}
                                <span className="text-ink-subtle">→</span>
                                <span className="text-[13px] font-medium text-ink">
                                  {term.targetTerm}
                                </span>
                              </p>
                              {term.definition && (
                                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                                  {term.definition}
                                </p>
                              )}
                              {term.context && (
                                <p className="mt-0.5 text-[11px] italic text-ink-subtle">
                                  <span className="font-medium not-italic text-ink-muted">
                                    {t("contextLabel")}:{" "}
                                  </span>
                                  &ldquo;{term.context}&rdquo;
                                </p>
                              )}
                              {otherDomains && otherDomains.length > 0 && (
                                <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-subtle">
                                  <span>{t("multiDomainNotice")}:</span>
                                  {otherDomains.map((od) => (
                                    <button
                                      key={od}
                                      type="button"
                                      onClick={() => setSelectedDomain(od)}
                                      className="underline hover:text-ink"
                                    >
                                      {od}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => removeTerm(term.id)}
                                disabled={deleteTerm.isPending}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-ink-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                                title={t("removeTermTitle")}
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              /* Alphabetical A-Z view */
              <div className="flex flex-col gap-3">
                {groupedTerms.length > 1 && (
                  <nav className="flex flex-wrap gap-1" aria-label={t("jumpToLetter")}>
                    {groupedTerms.map(([letter]) => (
                      <a
                        key={letter}
                        href={`#glossary-letter-${letter}`}
                        className="grid h-6 min-w-6 place-items-center rounded-[5px] border border-hairline px-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                      >
                        {letter}
                      </a>
                    ))}
                  </nav>
                )}

                <div className="overflow-clip rounded-lg border border-hairline">
                  {groupedTerms.map(([letter, letterTerms]) => (
                    <section key={letter}>
                      <h3
                        id={`glossary-letter-${letter}`}
                        className="sticky top-0 z-10 scroll-mt-2 border-b border-hairline bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
                      >
                        {letter}
                        <span className="ml-1.5 font-normal normal-case tracking-normal text-ink-subtle">
                          {letterTerms.length}
                        </span>
                      </h3>
                      <ul className="divide-y divide-hairline bg-surface-1">
                        {letterTerms.map((term) => (
                          <li
                            key={term.id}
                            className="group flex items-start justify-between gap-3 px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-baseline gap-1.5">
                                <span className="text-[13px] font-medium text-ink">
                                  {term.sourceTerm}
                                </span>
                                {term.partOfSpeech && (
                                  <span className="text-[11px] italic text-ink-subtle">
                                    {term.partOfSpeech}
                                  </span>
                                )}
                                <span className="text-ink-subtle">→</span>
                                <span className="text-[13px] text-ink">{term.targetTerm}</span>
                                {term.domain && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {term.domain}
                                  </Badge>
                                )}
                              </p>
                              {term.definition && (
                                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                                  {term.definition}
                                </p>
                              )}
                              {term.context && (
                                <p className="mt-0.5 text-[11px] italic text-ink-subtle">
                                  <span className="font-medium not-italic text-ink-muted">
                                    {t("contextLabel")}:{" "}
                                  </span>
                                  &ldquo;{term.context}&rdquo;
                                </p>
                              )}
                            </div>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => removeTerm(term.id)}
                                disabled={deleteTerm.isPending}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-ink-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                                title={t("removeTermTitle")}
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "custom" && selected && canManage ? (
          <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted">
            <span>
              {selected.description ||
                `${getLanguageName(selected.sourceLanguage)} → ${getLanguageName(selected.targetLanguage)}`}
            </span>
            <button
              type="button"
              onClick={() => removeGlossary(selected)}
              disabled={deleteGlossary.isPending}
              className="text-ink-subtle transition-colors hover:text-red-600"
            >
              {t("deleteThisGlossary")}
            </button>
          </div>
        ) : null}
      </WorkspaceBody>

      {/* Create Glossary Dialog */}
      <Dialog
        open={glossaryDialogOpen}
        onOpenChange={(open) => {
          setGlossaryDialogOpen(open);
          if (!open) setImportAfterCreate(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogs.newGlossary.title")}</DialogTitle>
            <DialogDescription>{t("dialogs.newGlossary.description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={glossaryForm.handleSubmit(submitGlossary)} className="space-y-3">
            <div>
              <Input
                placeholder={t("dialogs.newGlossary.namePlaceholder")}
                {...glossaryForm.register("name")}
              />
              {glossaryForm.formState.errors.name && (
                <p className="mt-1 text-[11px] text-red-600">
                  {glossaryForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <Input
              placeholder={t("dialogs.newGlossary.descriptionPlaceholder")}
              {...glossaryForm.register("description")}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                disabled={!languagePolicyReady}
                value={glossaryForm.watch("sourceLanguage")}
                onValueChange={(value: string | null) =>
                  glossaryForm.setValue("sourceLanguage", value ?? "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("dialogs.newGlossary.spokenLanguagePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((language) => (
                    <SelectItem key={language.code} value={language.code}>
                      {language.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                disabled={!languagePolicyReady}
                value={glossaryForm.watch("targetLanguage")}
                onValueChange={(value: string | null) =>
                  glossaryForm.setValue("targetLanguage", value ?? "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("dialogs.newGlossary.translatedIntoPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((language) => (
                    <SelectItem key={language.code} value={language.code}>
                      {language.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(glossaryForm.formState.errors.sourceLanguage ||
              glossaryForm.formState.errors.targetLanguage) && (
              <p className="text-[11px] text-red-600">
                {t("dialogs.newGlossary.chooseBothLanguages")}
              </p>
            )}

            <InitialTermsField
              fields={initialTerms.fields}
              register={glossaryForm.register}
              errors={glossaryForm.formState.errors.initialTerms}
              sourceLanguageName={getLanguageName(glossaryForm.watch("sourceLanguage"))}
              targetLanguageName={getLanguageName(glossaryForm.watch("targetLanguage"))}
              onAppend={() => initialTerms.append({ sourceTerm: "", targetTerm: "" })}
              onRemove={(index) => initialTerms.remove(index)}
            />

            <DialogFooter>
              <WorkspacePrimaryButton
                type="submit"
                disabled={createGlossary.isPending || !languagePolicyReady}
              >
                {createGlossary.isPending
                  ? t("dialogs.newGlossary.creating")
                  : t("dialogs.newGlossary.create")}
              </WorkspacePrimaryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Term Dialog */}
      <Dialog open={termDialogOpen} onOpenChange={setTermDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogs.addTerm.title")}</DialogTitle>
            <DialogDescription>{t("dialogs.addTerm.description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={termForm.handleSubmit(submitTerm)} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Input
                  placeholder={t("dialogs.addTerm.termAsSpokenPlaceholder")}
                  {...termForm.register("sourceTerm")}
                />
                {termForm.formState.errors.sourceTerm && (
                  <p className="mt-1 text-[11px] text-red-600">
                    {termForm.formState.errors.sourceTerm.message}
                  </p>
                )}
              </div>
              <div>
                <Input
                  placeholder={t("dialogs.addTerm.translateAsPlaceholder")}
                  {...termForm.register("targetTerm")}
                />
                {termForm.formState.errors.targetTerm && (
                  <p className="mt-1 text-[11px] text-red-600">
                    {termForm.formState.errors.targetTerm.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder={t("dialogs.addTerm.domainPlaceholder")}
                {...termForm.register("domain")}
              />
              <Input
                placeholder={t("dialogs.addTerm.partOfSpeechPlaceholder")}
                {...termForm.register("partOfSpeech")}
              />
            </div>
            <Input
              placeholder={t("dialogs.addTerm.definitionPlaceholder")}
              {...termForm.register("definition")}
            />
            <Input
              placeholder={t("dialogs.addTerm.contextPlaceholder")}
              {...termForm.register("context")}
            />
            <DialogFooter>
              <WorkspacePrimaryButton type="submit" disabled={addTerm.isPending}>
                {addTerm.isPending ? t("dialogs.addTerm.adding") : t("dialogs.addTerm.addTerm")}
              </WorkspacePrimaryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import dialog. WT-880: its quick download is the admin's template for this glossary's
          pair; "View template" opens the Import template tab. */}
      {selected ? (
        <GlossaryImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          glossaryName={selected.name}
          sourceLanguage={selected.sourceLanguage}
          targetLanguage={selected.targetLanguage}
          isImporting={bulkImport.isPending}
          onImport={importTerms}
          onViewTemplate={() => {
            setImportDialogOpen(false);
            setActiveTab("template");
          }}
        />
      ) : null}
    </WorkspacePage>
  );
}
