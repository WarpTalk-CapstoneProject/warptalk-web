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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BookOpen, Plus, Trash, MagnifyingGlass, Translate } from "@phosphor-icons/react";

import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspacePrimaryButton,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
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
  useCreateGlossary,
  useDeleteGlossary,
  useDeleteGlossaryTerm,
  useGlossariesByWorkspace,
  useGlossaryTerms,
} from "@/hooks/use-workspace";
import type { GlossaryDto } from "@/types/workspace";

const glossarySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  sourceLanguage: z.string().min(1, "Select the language people speak"),
  targetLanguage: z.string().min(1, "Select the language it is translated into"),
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

  const termsQuery = useGlossaryTerms(selected?.id ?? "");
  const createGlossary = useCreateGlossary(workspaceId ?? "");
  const deleteGlossary = useDeleteGlossary(workspaceId ?? "");
  const addTerm = useAddGlossaryTerm(selected?.id ?? "");
  const deleteTerm = useDeleteGlossaryTerm(selected?.id ?? "");

  const glossaryForm = useForm<GlossaryForm>({
    resolver: zodResolver(glossarySchema),
    defaultValues: { name: "", description: "", sourceLanguage: "", targetLanguage: "" },
  });
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

  async function submitGlossary(values: GlossaryForm) {
    try {
      await createGlossary.mutateAsync({
        name: values.name,
        description: values.description || null,
        sourceLanguage: values.sourceLanguage,
        targetLanguage: values.targetLanguage,
      });
      toast.success("Glossary created.");
      setGlossaryDialogOpen(false);
      glossaryForm.reset();
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
                  <WorkspacePrimaryButton onClick={() => setTermDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Add term
                  </WorkspacePrimaryButton>
                ) : null}
              </>
            ) : null}
          </>
        }
      />

      <WorkspaceBody>
        {glossaries.length === 0 ? (
          <WorkspaceEmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No glossary yet"
            description="A glossary fixes how your terms are heard and translated during a meeting — product names, acronyms, and words whose meaning depends on your field. Terms here override the platform-wide glossary."
            action={
              canManage ? (
                <WorkspacePrimaryButton onClick={() => setGlossaryDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  New glossary
                </WorkspacePrimaryButton>
              ) : undefined
            }
          />
        ) : !selected ? null : termsQuery.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
        ) : terms.length === 0 ? (
          <WorkspaceEmptyState
            icon={<Translate className="h-6 w-6" />}
            title={search ? "No term matches that search" : "This glossary has no terms yet"}
            description={
              search
                ? undefined
                : "Add the words this workspace wants heard and translated a particular way."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-hairline">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Term</th>
                  <th className="px-3 py-2 font-medium">Translate as</th>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Definition</th>
                  {canManage ? <th className="w-10 px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id} className="border-t border-hairline align-top">
                    <td className="px-3 py-2">
                      <span className="font-medium text-ink">{term.sourceTerm}</span>
                      {term.partOfSpeech ? (
                        <span className="ml-1.5 text-[11px] italic text-ink-subtle">
                          {term.partOfSpeech}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-ink">{term.targetTerm}</td>
                    <td className="px-3 py-2">
                      {term.domain ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {term.domain}
                        </Badge>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="max-w-[320px] px-3 py-2 text-[12px] text-ink-muted">
                      {term.definition || term.context || (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    {canManage ? (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeTerm(term.id)}
                          disabled={deleteTerm.isPending}
                          className="grid h-6 w-6 place-items-center rounded-sm text-ink-subtle hover:bg-surface-2 hover:text-red-600"
                          title="Remove term"
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
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

      <Dialog open={glossaryDialogOpen} onOpenChange={setGlossaryDialogOpen}>
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
    </WorkspacePage>
  );
}
