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

import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FileArrowUp, Plus, Trash, MagnifyingGlass } from "@phosphor-icons/react";

import {
  WorkspaceBody,
  WorkspacePage,
  WorkspacePrimaryButton,
  WorkspaceToolbar,
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
import { getLanguageName, languagesInScope } from "@/lib/language/languages";
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
} from "@/hooks/use-workspace";
// Called directly, not through a hook: the terms go into the glossary that was created a line
// earlier, and a hook bound to an id can only be bound to one the component already had.
import { WorkspaceService } from "@/services/workspace.service";
import { initialTermsSchema, termRowsToImport } from "@/lib/glossary/initial-terms";
import { InitialTermsField } from "@/components/glossary/initial-terms-field";
import type { GlossaryDto } from "@/types/workspace";
import {
  GlossaryImportDialog,
  type ParsedGlossaryRow,
} from "@/components/glossary/glossary-import-dialog";

/**
 * What a new glossary starts as, on both sides.
 *
 * A code from the registry rather than a literal, so it cannot drift out of the option list the
 * selects are built from — a default that is not one of the choices renders as an empty box that
 * nonetheless passes validation.
 */
const DEFAULT_GLOSSARY_LANGUAGE = "en";

const glossarySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  sourceLanguage: z.string().min(1, "Select the language people speak"),
  targetLanguage: z.string().min(1, "Select the language it is translated into"),
  // WT-558. The rule for what counts as a usable row lives in lib/glossary/initial-terms, so the
  // schema and the field that renders the errors cannot disagree about a half-filled row.
  initialTerms: initialTermsSchema,
});
type GlossaryForm = z.infer<typeof glossarySchema>;

const termSchema = z.object({
  sourceTerm: z.string().min(1, "The term is required"),
  targetTerm: z.string().min(1, "The translation to use is required"),
  domain: z.string().optional(),
  partOfSpeech: z.string().optional(),
  definition: z.string().optional(),
  context: z.string().optional(),
});
type TermForm = z.infer<typeof termSchema>;

export default function WorkspaceGlossaryPage() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceRole();
  // Owners and admins curate the terminology; a member reads it. The server is the real gate —
  // this only avoids offering a control that would come back 403.
  const canManage = role === "owner" || role === "admin";

  const glossariesQuery = useGlossariesByWorkspace(workspaceId ?? "");
  const glossaries = useMemo(() => glossariesQuery.data ?? [], [glossariesQuery.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Derived rather than synced: the first glossary is selected until the reader picks another,
  // and a selection that no longer exists (deleted) falls back instead of showing an empty page.
  const selected: GlossaryDto | undefined =
    glossaries.find((glossary) => glossary.id === selectedId) ?? glossaries[0];

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

  const glossaryForm = useForm<GlossaryForm>({
    resolver: zodResolver(glossarySchema),
    // English on both sides, prefilled rather than left empty.
    //
    // Every glossary this workspace has made is English-sourced, and the pair was being picked
    // from two empty dropdowns each time — so the commonest answer cost two decisions, and a
    // half-filled form failed validation on a field nobody had thought about. The selects are
    // still there and still change it; this only decides what they start on.
    defaultValues: {
      name: "",
      description: "",
      sourceLanguage: DEFAULT_GLOSSARY_LANGUAGE,
      targetLanguage: DEFAULT_GLOSSARY_LANGUAGE,
      // One blank row, offered rather than hidden behind "+ Add term". A section that starts
      // empty reads as optional detail; a row with the cursor in it reads as the next thing to
      // do, which is what the ticket is asking for.
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

  const terms = useMemo(() => {
    const all = termsQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((term) =>
      [term.sourceTerm, term.targetTerm, term.domain, term.definition]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    );
  }, [termsQuery.data, search]);

  const languageOptions = useMemo(() => languagesInScope("meeting"), []);

  /**
   * WT-472: the terms as a DICTIONARY — grouped by initial letter, alphabetical within each group.
   *
   * A flat table sorted by insertion order is a log of what somebody typed. A vocabulary is looked
   * up, not scrolled: you arrive knowing the word and wanting the entry. Grouping by letter and
   * offering the letters as an index is what makes that a jump instead of a scan.
   *
   * `localeCompare` rather than `<`, because Vietnamese is a first-class source language here and
   * codepoint order puts every accented letter after "z" — "Đ" would sort past "Z" and "ế" would
   * not sit with "e". The `#` bucket catches digits and symbols, which is where acronyms with
   * leading numbers land.
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
      // "#" last: a reader scanning the index wants the letters first.
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b, "vi");
    });
  }, [terms]);

  /**
   * WT-472. Reports BOTH numbers, because the server skips terms already present and only one of
   * "imported 40" and "imported 40, skipped 60" is true of the same file.
   *
   * WT-601 — and it says WHICH rows were skipped. The server has always sent one message per
   * rejected row and this threw the list away, so "skipped 12" was a number with nothing to act
   * on: no way to tell a re-import of terms already here from a spreadsheet that names a word
   * twice. Three are shown because a toast is not a report and the rest are still in the file.
   */
  async function importTerms(rows: ParsedGlossaryRow[]) {
    if (!selected) return;
    try {
      const result = await bulkImport.mutateAsync(rows);
      const summary =
        result.skipped > 0
          ? `Imported ${result.imported} term${result.imported === 1 ? "" : "s"}, skipped ${result.skipped} already in this glossary.`
          : `Imported ${result.imported} term${result.imported === 1 ? "" : "s"}.`;

      toast.success(summary, {
        description:
          result.errors.length > 0
            ? [
                ...result.errors.slice(0, 3),
                result.errors.length > 3 ? `…and ${result.errors.length - 3} more.` : null,
              ]
                .filter(Boolean)
                .join(" ")
            : undefined,
      });
      setImportDialogOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not import the file."));
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

      /**
       * WT-558: the terms typed alongside the name, written into the glossary that was just made.
       *
       * Two requests rather than one, because the create endpoint takes no terms — and that is
       * the right seam: a glossary whose terms failed to import is still a glossary, and the
       * reader is told exactly that instead of being shown a failure that rolled back the name
       * they had already chosen. Which is why this is not inside the try that reports "could not
       * create the glossary": by here, it has been created.
       *
       * Blank rows are dropped. Half-filled ones never get here — the schema refuses them, so a
       * word somebody typed cannot be silently discarded.
       */
      const rows = termRowsToImport(values.initialTerms);

      let importedCount = 0;
      if (rows.length > 0) {
        try {
          const result = await WorkspaceService.bulkImportTerms(created.id, rows);
          importedCount = result.imported;
        } catch (error) {
          toast.error(
            getErrorMessage(error, `Glossary created, but its terms could not be added.`),
          );
        }
      }

      toast.success(
        importedCount > 0
          ? `Glossary created with ${importedCount} term${importedCount === 1 ? "" : "s"}.`
          : "Glossary created.",
      );
      setGlossaryDialogOpen(false);
      glossaryForm.reset();

      // Land on what was just made, rather than leaving the reader on whichever glossary happened
      // to be selected before. The list is refetched AFTER the import so the term count on the
      // new entry is the real one — the create mutation's own invalidation fires before the terms
      // exist and would show 0.
      setSelectedId(created.id);
      await glossariesQuery.refetch();

      /**
       * Carry on into the import the reader actually asked for.
       *
       * Terms cannot be imported into nothing — a glossary is a source/target language PAIR, and
       * the pair is what tells the importer which column is which. So "Import terms" from the
       * empty state has to create the glossary first. Dropping the reader back on a bare page at
       * that point loses what they came to do, which is how the import ended up looking absent:
       * it was reachable only from inside a glossary nobody had yet.
       *
       * `refetch` rather than the mutation's result, which is typed `void`; and `data[0]` is
       * unambiguous because this path is only offered when there were no glossaries at all.
       */
      if (importAfterCreate) {
        setImportAfterCreate(false);
        // WT-558: named directly now. This used to refetch and take `data[0]`, which was only
        // unambiguous because the path was offered exclusively from the empty state; the create
        // endpoint returns the row it made, so there is nothing left to infer.
        setImportDialogOpen(true);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create the glossary."));
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
      toast.success("Term added.");
      setTermDialogOpen(false);
      termForm.reset();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add the term."));
    }
  }

  async function removeGlossary(glossary: GlossaryDto) {
    try {
      await deleteGlossary.mutateAsync(glossary.id);
      if (selectedId === glossary.id) setSelectedId(null);
      toast.success("Glossary deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete the glossary."));
    }
  }

  async function removeTerm(termId: string) {
    try {
      await deleteTerm.mutateAsync(termId);
      toast.success("Term removed.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not remove the term."));
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
      <WorkspaceToolbar
        filters={
          glossaries.length > 0 ? (
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
              {glossaries.map((glossary) => {
                const active = selected?.id === glossary.id;
                return (
                  <button
                    key={glossary.id}
                    type="button"
                    onClick={() => setSelectedId(glossary.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors ${
                      active
                        ? "border-border bg-surface-2 font-medium text-ink"
                        : "border-transparent text-ink-muted hover:bg-surface-2"
                    }`}
                  >
                    {glossary.name}
                    <span className="text-[10px] text-ink-subtle">
                      {getLanguageName(glossary.sourceLanguage)} →{" "}
                      {getLanguageName(glossary.targetLanguage)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null
        }
        actions={
          <>
            {selected ? (
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search terms"
                  className="h-8 w-44 pl-8 text-[12px]"
                />
              </div>
            ) : null}
            {canManage ? (
              <>
                <WorkspacePrimaryButton onClick={() => setGlossaryDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  New glossary
                </WorkspacePrimaryButton>
                {selected ? (
                  <>
                    {/* Import sits BESIDE Add term, not inside a menu. A domain vocabulary
                        arrives as a spreadsheet far more often than it is typed word by word,
                        so the bulk path is the primary one for anyone setting a glossary up. */}
                    <WorkspacePrimaryButton onClick={() => setImportDialogOpen(true)}>
                      <FileArrowUp className="h-3.5 w-3.5" />
                      Import
                    </WorkspacePrimaryButton>
                    <WorkspacePrimaryButton onClick={() => setTermDialogOpen(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      Add term
                    </WorkspacePrimaryButton>
                  </>
                ) : null}
              </>
            ) : null}
          </>
        }
      />

      <WorkspaceBody>
        {glossaries.length === 0 ? (
          <PagePlaceholder
            kind="glossary"
            title="No glossary yet"
            description="A glossary fixes how your terms are heard and translated during a meeting — product names, acronyms, and words whose meaning depends on your field. Terms here override the platform-wide glossary. Already have a list? Import a CSV or spreadsheet instead of typing it out."
            action={
              canManage ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <WorkspacePrimaryButton onClick={() => setGlossaryDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    New glossary
                  </WorkspacePrimaryButton>
                  {/*
                    Import is offered from the empty state as well as from inside a glossary.
                    It only ever lived inside one, so with no glossary yet — the state every
                    workspace starts in — the product looked like it could not import at all.
                    This route creates the glossary first and then opens the importer, because
                    terms need a language pair to land in.
                  */}
                  <WorkspacePrimaryButton
                    onClick={() => {
                      setImportAfterCreate(true);
                      setGlossaryDialogOpen(true);
                    }}
                  >
                    <FileArrowUp className="h-3.5 w-3.5" />
                    Import terms
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
            title={search ? "No term matches that search" : "This glossary has no terms yet"}
            description={
              search
                ? undefined
                : "Add the words this workspace wants heard and translated a particular way, or import a CSV or spreadsheet you already have."
            }
            action={
              // Offered here too, not only in the header bar. This is the screen someone lands on
              // straight after creating a glossary, and a vocabulary arrives as a spreadsheet far
              // more often than it is typed in word by word.
              !search && canManage ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <WorkspacePrimaryButton onClick={() => setImportDialogOpen(true)}>
                    <FileArrowUp className="h-3.5 w-3.5" />
                    Import terms
                  </WorkspacePrimaryButton>
                  <WorkspacePrimaryButton onClick={() => setTermDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Add term
                  </WorkspacePrimaryButton>
                </div>
              ) : undefined
            }
          />
        ) : (
          /* WT-472: a dictionary, not a table.
             The letters are an index you click, and each entry reads term → translation with its
             definition underneath, the way a lexicon does. The previous flat table was sorted by
             insertion order, which is the order somebody happened to type things in and is of no
             use to a reader who arrives already knowing the word. */
          <div className="flex flex-col gap-3">
            {groupedTerms.length > 1 ? (
              <nav className="flex flex-wrap gap-1" aria-label="Jump to letter">
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
            ) : null}

            <div className="overflow-clip rounded-lg border border-hairline">
              {groupedTerms.map(([letter, letterTerms]) => (
                <section key={letter}>
                  {/* Sticky so the letter stays visible while its entries scroll — otherwise a
                      long section leaves the reader with no idea where they are. */}
                  <h3
                    id={`glossary-letter-${letter}`}
                    className="sticky top-0 z-10 scroll-mt-2 border-b border-hairline bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
                  >
                    {letter}
                    <span className="ml-1.5 font-normal normal-case tracking-normal text-ink-subtle">
                      {letterTerms.length}
                    </span>
                  </h3>
                  <ul className="divide-y divide-hairline">
                    {letterTerms.map((term) => (
                      <li
                        key={term.id}
                        className="group flex items-start justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-baseline gap-1.5">
                            <span className="text-[13px] font-medium text-ink">
                              {term.sourceTerm}
                            </span>
                            {term.partOfSpeech ? (
                              <span className="text-[11px] italic text-ink-subtle">
                                {term.partOfSpeech}
                              </span>
                            ) : null}
                            <span className="text-ink-subtle">→</span>
                            <span className="text-[13px] text-ink">{term.targetTerm}</span>
                            {term.domain ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {term.domain}
                              </Badge>
                            ) : null}
                          </p>
                          {term.definition || term.context ? (
                            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                              {term.definition || term.context}
                            </p>
                          ) : null}
                          {term.usageNote ? (
                            <p className="mt-0.5 text-[11px] italic text-ink-subtle">
                              {term.usageNote}
                            </p>
                          ) : null}
                        </div>
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => removeTerm(term.id)}
                            disabled={deleteTerm.isPending}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-ink-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                            title="Remove term"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        {selected && canManage ? (
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
              Delete this glossary
            </button>
          </div>
        ) : null}
      </WorkspaceBody>

      <Dialog
        open={glossaryDialogOpen}
        onOpenChange={(open) => {
          setGlossaryDialogOpen(open);
          // Abandoning the create step abandons the import it was standing in for. Left set, the
          // flag would fire the importer open after some unrelated glossary created later.
          if (!open) setImportAfterCreate(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New glossary</DialogTitle>
            <DialogDescription>
              One glossary covers one direction of translation. Add another for a second language
              pair.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={glossaryForm.handleSubmit(submitGlossary)} className="space-y-3">
            <div>
              <Input placeholder="Name" {...glossaryForm.register("name")} />
              {glossaryForm.formState.errors.name ? (
                <p className="mt-1 text-[11px] text-red-600">
                  {glossaryForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            <Input
              placeholder="Description (optional)"
              {...glossaryForm.register("description")}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={glossaryForm.watch("sourceLanguage")}
                onValueChange={(value: string | null) =>
                  glossaryForm.setValue("sourceLanguage", value ?? "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Spoken language" />
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
                value={glossaryForm.watch("targetLanguage")}
                onValueChange={(value: string | null) =>
                  glossaryForm.setValue("targetLanguage", value ?? "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Translated into" />
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
            {glossaryForm.formState.errors.sourceLanguage ||
            glossaryForm.formState.errors.targetLanguage ? (
              <p className="text-[11px] text-red-600">Choose both languages.</p>
            ) : null}

            {/* WT-558 — the first terms, typed here rather than after the fact.
                Creating a glossary and putting a word in it used to be two separate errands:
                create an empty set, find it in the list, open it, then add a term. Everything a
                person came to do belongs in the action they started. */}
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
              <WorkspacePrimaryButton type="submit" disabled={createGlossary.isPending}>
                {createGlossary.isPending ? "Creating…" : "Create glossary"}
              </WorkspacePrimaryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={termDialogOpen} onOpenChange={setTermDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add term</DialogTitle>
            <DialogDescription>
              Applied live, to both speech recognition and translation, for every meeting in this
              workspace.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={termForm.handleSubmit(submitTerm)} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Input placeholder="Term as spoken" {...termForm.register("sourceTerm")} />
                {termForm.formState.errors.sourceTerm ? (
                  <p className="mt-1 text-[11px] text-red-600">
                    {termForm.formState.errors.sourceTerm.message}
                  </p>
                ) : null}
              </div>
              <div>
                <Input placeholder="Translate as" {...termForm.register("targetTerm")} />
                {termForm.formState.errors.targetTerm ? (
                  <p className="mt-1 text-[11px] text-red-600">
                    {termForm.formState.errors.targetTerm.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* The field that makes this a WORKSPACE glossary: the same word means different
                  things in different industries, and this is where a workspace says which. */}
              <Input placeholder="Field / domain (optional)" {...termForm.register("domain")} />
              <Input
                placeholder="Part of speech (optional)"
                {...termForm.register("partOfSpeech")}
              />
            </div>
            <Input placeholder="Definition (optional)" {...termForm.register("definition")} />
            <Input
              placeholder="Context — when this reading applies (optional)"
              {...termForm.register("context")}
            />
            <DialogFooter>
              <WorkspacePrimaryButton type="submit" disabled={addTerm.isPending}>
                {addTerm.isPending ? "Adding…" : "Add term"}
              </WorkspacePrimaryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selected ? (
        <GlossaryImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          glossaryName={selected.name}
          sourceLanguage={selected.sourceLanguage}
          targetLanguage={selected.targetLanguage}
          isImporting={bulkImport.isPending}
          onImport={importTerms}
        />
      ) : null}
    </WorkspacePage>
  );
}
