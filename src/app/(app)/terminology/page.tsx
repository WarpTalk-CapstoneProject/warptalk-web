"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  BookOpen,
  Plus,
  Trash,
  Spinner,
  Download,
  Upload,
  Warning,
  Globe,
  ArrowBendUpLeft,
} from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useGlossariesByWorkspace,
  useCreateGlossary,
  useDeleteGlossary,
  useGlossaryTerms,
  useAddGlossaryTerm,
  useDeleteGlossaryTerm,
  usePublishedGlobalGlossaryTerms,
} from "@/hooks/use-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const glossarySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  sourceLanguage: z.string().min(1, "Select source language"),
  targetLanguage: z.string().min(1, "Select target language"),
});

const termSchema = z.object({
  sourceTerm: z.string().min(1, "Term cannot be empty"),
  targetTerm: z.string().min(1, "Translation cannot be empty"),
  definition: z.string().optional(),
  usageNote: z.string().optional(),
});

type GlossaryFormData = z.infer<typeof glossarySchema>;
type TermFormData = z.infer<typeof termSchema>;

const langPairs = [
  { code: "en", label: "English" },
  { code: "vi", label: "Vietnamese" },
  { code: "ja", label: "Japanese" },
];

export default function WorkspaceTerminologyPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);

  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(null);
  
  // Dialog visibility states
  const [isGlossaryDialogOpen, setIsGlossaryDialogOpen] = useState(false);
  const [isTermDialogOpen, setIsTermDialogOpen] = useState(false);
  const [glossaryToDelete, setGlossaryToDelete] = useState<{ id: string; name: string } | null>(null);
  const [termToDelete, setTermToDelete] = useState<{ id: string; term: string } | null>(null);

  // Queries & Mutations
  const glossariesQuery = useGlossariesByWorkspace(activeWorkspaceId || "");
  const createGlossaryMutation = useCreateGlossary(activeWorkspaceId || "");
  const deleteGlossaryMutation = useDeleteGlossary(activeWorkspaceId || "");
  const glossaries = glossariesQuery.data || [];
  const effectiveGlossaryId = selectedGlossaryId || glossaries[0]?.id || null;

  const termsQuery = useGlossaryTerms(effectiveGlossaryId || "");
  const addTermMutation = useAddGlossaryTerm(effectiveGlossaryId || "");
  const deleteTermMutation = useDeleteGlossaryTerm(effectiveGlossaryId || "");
  const globalTermsQuery = usePublishedGlobalGlossaryTerms();

  const {
    register: registerGlossary,
    handleSubmit: handleGlossarySubmit,
    setValue: setGlossaryValue,
    reset: resetGlossary,
    formState: { errors: glossaryErrors, isSubmitting: isGlossarySubmitting },
  } = useForm<GlossaryFormData>({
    resolver: zodResolver(glossarySchema),
    defaultValues: {
      name: "",
      description: "",
      sourceLanguage: "en",
      targetLanguage: "vi",
    },
  });

  const {
    register: registerTerm,
    handleSubmit: handleTermSubmit,
    reset: resetTerm,
    formState: { errors: termErrors, isSubmitting: isTermSubmitting },
  } = useForm<TermFormData>({
    resolver: zodResolver(termSchema),
    defaultValues: {
      sourceTerm: "",
      targetTerm: "",
      definition: "",
      usageNote: "",
    },
  });

  if (!activeWorkspaceId) return null;

  const isOwnerOrAdmin = role === "Owner" || role === "Admin";
  const selectedGlossary = glossaries.find((g) => g.id === effectiveGlossaryId);

  // Global terms applicable to the selected glossary's language pair — language-agnostic
  // terms (sourceLanguage/targetLanguage both null on the global row) apply to every pair.
  const applicableGlobalTerms = (globalTermsQuery.data || []).filter((t) => {
    if (!selectedGlossary) return false;
    const sourceMatches = !t.sourceLanguage || t.sourceLanguage === selectedGlossary.sourceLanguage;
    const targetMatches = !t.targetLanguage || t.targetLanguage === selectedGlossary.targetLanguage;
    return sourceMatches && targetMatches;
  });

  const workspaceTermKeys = new Set((termsQuery.data || []).map((t) => t.sourceTerm.trim().toLowerCase()));

  const handleOverrideGlobalTerm = (term: string, translation: string, definition?: string | null, usageNote?: string | null) => {
    resetTerm({
      sourceTerm: term,
      targetTerm: translation,
      definition: definition || "",
      usageNote: usageNote || "",
    });
    setIsTermDialogOpen(true);
  };

  const handleCreateGlossary = async (data: GlossaryFormData) => {
    try {
      await createGlossaryMutation.mutateAsync({
        name: data.name,
        description: data.description || null,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
      });
      toast.success("Glossary dictionary created successfully.");
      resetGlossary();
      setIsGlossaryDialogOpen(false);
    } catch {
      toast.error("Failed to create glossary.");
    }
  };

  const handleDeleteGlossary = async () => {
    if (!glossaryToDelete) return;
    try {
      await deleteGlossaryMutation.mutateAsync(glossaryToDelete.id);
      toast.success(`Glossary "${glossaryToDelete.name}" deleted.`);
      if (selectedGlossaryId === glossaryToDelete.id) {
        setSelectedGlossaryId(null);
      }
      setGlossaryToDelete(null);
    } catch {
      toast.error("Failed to delete glossary.");
    }
  };

  const handleAddTerm = async (data: TermFormData) => {
    if (!effectiveGlossaryId) return;

    // Check duplicate term locally first to prevent API collision
    const existingTerms = termsQuery.data || [];
    const isDuplicate = existingTerms.some(
      (t) => t.sourceTerm.toLowerCase() === data.sourceTerm.toLowerCase()
    );

    if (isDuplicate) {
      toast.error(`The term "${data.sourceTerm}" already exists in this glossary.`);
      return;
    }

    try {
      await addTermMutation.mutateAsync({
        sourceTerm: data.sourceTerm,
        targetTerm: data.targetTerm,
        definition: data.definition || null,
        usageNote: data.usageNote || null,
      });
      toast.success(`Term "${data.sourceTerm}" added.`);
      resetTerm();
      setIsTermDialogOpen(false);
    } catch {
      toast.error("Failed to add term.");
    }
  };

  const handleDeleteTerm = async () => {
    if (!termToDelete || !effectiveGlossaryId) return;
    try {
      await deleteTermMutation.mutateAsync(termToDelete.id);
      toast.success(`Term "${termToDelete.term}" deleted.`);
      setTermToDelete(null);
    } catch {
      toast.error("Failed to delete term.");
    }
  };

  // CSV Import parser
  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!effectiveGlossaryId || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).map((line) => line.split(","));
      const headers = lines[0]?.map((h) => h.trim()) || [];

      // Validate required headers
      const required = ["Term", "Translation", "Definition", "UsageNote"];
      const isValid = required.every((req) => headers.includes(req));

      if (!isValid) {
        toast.error("Invalid CSV headers. Must match: Term, Translation, Definition, UsageNote");
        return;
      }

      const termIdx = headers.indexOf("Term");
      const transIdx = headers.indexOf("Translation");
      const defIdx = headers.indexOf("Definition");
      const noteIdx = headers.indexOf("UsageNote");

      let addedCount = 0;
      let dupCount = 0;
      const existingTerms = termsQuery.data || [];

      toast.info("Importing terms...");

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (row.length < 2 || !row[termIdx]) continue;

        const term = row[termIdx].trim();
        const translation = row[transIdx].trim();
        const definition = row[defIdx]?.trim() || null;
        const usageNote = row[noteIdx]?.trim() || null;

        // Skip duplicates
        const isDuplicate = existingTerms.some((t) => t.sourceTerm.toLowerCase() === term.toLowerCase());
        if (isDuplicate) {
          dupCount++;
          continue;
        }

        try {
          await addTermMutation.mutateAsync({
            sourceTerm: term,
            targetTerm: translation,
            definition,
            usageNote,
          });
          addedCount++;
        } catch {
          // Skip failing rows
        }
      }

      toast.success(`Import complete. Added ${addedCount} terms. Skipped ${dupCount} duplicates.`);
      e.target.value = ""; // Reset input
    };
    reader.readAsText(file);
  };

  // CSV Export builder
  const handleCSVExport = () => {
    const terms = termsQuery.data || [];
    if (terms.length === 0) {
      toast.error("No terms available to export.");
      return;
    }

    const headers = "Term,Translation,Definition,UsageNote\n";
    const rows = terms
      .map(
        (t) =>
          `"${t.sourceTerm.replace(/"/g, '""')}","${t.targetTerm.replace(/"/g, '""')}","${(
            t.definition || ""
          ).replace(/"/g, '""')}","${(t.usageNote || "").replace(/"/g, '""')}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${selectedGlossary?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-export.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV export download started.");
  };

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-6 text-ink max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Terminology</h1>
          <p className="text-sm text-ink-muted mt-1">
            Build specialized glossaries to train and optimize consistent live AI translation quality.
          </p>
        </div>
        {isOwnerOrAdmin && (
          <button
            onClick={() => setIsGlossaryDialogOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover transition duration-150"
          >
            <Plus className="h-4 w-4" />
            <span>Create Glossary</span>
          </button>
        )}
      </div>

      {/* Grid Layout */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left Side: Glossaries Sidebar */}
        <Card className="border-hairline bg-surface-1 shadow-sm h-fit">
          <CardHeader className="pb-3 border-b border-hairline">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-ink-muted">Glossary Dictionaries</CardTitle>
          </CardHeader>
          <CardContent className="p-2 flex flex-col gap-1.5 max-h-[500px] overflow-y-auto">
            {glossariesQuery.isLoading ? (
              <div className="flex h-20 items-center justify-center">
                <Spinner className="h-4 w-4 animate-spin text-primary" />
              </div>
            ) : glossaries.length === 0 ? (
              <div className="text-center py-6 text-xs text-ink-muted">No glossaries registered.</div>
            ) : (
              glossaries.map((g) => {
                const isSelected = effectiveGlossaryId === g.id;
                return (
                  <div
                    key={g.id}
                    className={`group w-full rounded-md border p-3 text-left transition duration-150 flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 text-ink"
                        : "border-hairline bg-surface-2 hover:bg-surface-2/65"
                    }`}
                    onClick={() => setSelectedGlossaryId(g.id)}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold leading-normal truncate">{g.name}</span>
                      <span className="text-[10px] text-ink-muted font-mono mt-0.5 uppercase">
                        {g.sourceLanguage} → {g.targetLanguage}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setGlossaryToDelete({ id: g.id, name: g.name });
                      }}
                      disabled={!isOwnerOrAdmin}
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity h-7 w-7 flex items-center justify-center rounded text-ink-muted hover:bg-destructive/10"
                      title="Delete Glossary"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Right Side: Selected Glossary Terms table */}
        {selectedGlossary ? (
          <Card className="border-hairline bg-surface-1 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 border-b border-hairline pb-3">
              <div>
                <CardTitle className="text-base font-semibold">{selectedGlossary.name}</CardTitle>
                <CardDescription className="text-xs">
                  {selectedGlossary.description ? `${selectedGlossary.description} • ` : ""}Pair: {selectedGlossary.sourceLanguage.toUpperCase()} → {selectedGlossary.targetLanguage.toUpperCase()}
                </CardDescription>
              </div>

              {/* CSV Triggers & Add Term Button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCSVExport}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 text-xs font-semibold hover:bg-surface-2 transition"
                >
                  <Download className="h-4 w-4" />
                  <span>Export CSV</span>
                </button>
                {isOwnerOrAdmin && (
                  <label className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 text-xs font-semibold hover:bg-surface-2 transition cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <span>Import CSV</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVImport}
                      className="hidden"
                    />
                  </label>
                )}
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => setIsTermDialogOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover transition"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Term</span>
                  </button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              {termsQuery.isLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Spinner className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !termsQuery.data || termsQuery.data.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-center p-6">
                  <BookOpen className="h-8 w-8 text-ink-muted" />
                  <p className="text-sm font-medium">No terms registered</p>
                  <p className="text-xs text-ink-muted">
                    Click &apos;Add Term&apos; or upload a custom CSV to build this dictionary.
                  </p>
                </div>
              ) : (
                <div className="min-w-[650px] divide-y divide-hairline">
                  <div className="grid grid-cols-[1fr_1fr_1.5fr_1fr_48px] items-center gap-4 px-4 py-2 bg-surface-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                    <span>Source Term</span>
                    <span>Translation</span>
                    <span>Definition</span>
                    <span>Usage Note</span>
                    <span className="text-right">Action</span>
                  </div>

                  {termsQuery.data.map((term) => (
                    <div
                      key={term.id}
                      className="grid grid-cols-[1fr_1fr_1.5fr_1fr_48px] items-center gap-4 px-4 py-2.5 hover:bg-surface-2/30 transition-colors"
                    >
                      <span className="text-xs font-semibold text-ink truncate">{term.sourceTerm}</span>
                      <span className="text-xs text-primary font-semibold truncate">
                        {term.targetTerm}
                      </span>
                      <span className="text-xs text-ink-muted truncate">
                        {term.definition || "—"}
                      </span>
                      <span className="text-xs text-ink-muted truncate">
                        {term.usageNote || "—"}
                      </span>
                      <div className="flex justify-end">
                        <button
                          onClick={() => setTermToDelete({ id: term.id, term: term.sourceTerm })}
                          disabled={!isOwnerOrAdmin}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30"
                          title="Delete Term"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex h-48 items-center justify-center text-xs text-ink-muted border border-hairline rounded bg-surface-2">
            Please select or create a dictionary to manage vocabulary terms.
          </div>
        )}
      </div>

      {/* Global (System) Terms — read-only baseline applied to every workspace unless overridden */}
      {selectedGlossary && applicableGlobalTerms.length > 0 && (
        <Card className="border-hairline bg-surface-1 shadow-sm">
          <CardHeader className="border-b border-hairline pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" weight="duotone" />
              System Terms
            </CardTitle>
            <CardDescription className="text-xs">
              Platform-wide baseline terms for this language pair, managed centrally. A workspace
              term with the same source term always overrides the one shown here.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[650px] divide-y divide-hairline">
              <div className="grid grid-cols-[1fr_1fr_1.5fr_110px] items-center gap-4 px-4 py-2 bg-surface-2 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                <span>Source Term</span>
                <span>Translation</span>
                <span>Definition</span>
                <span className="text-right">Status</span>
              </div>

              {applicableGlobalTerms.map((term) => {
                const isOverridden = workspaceTermKeys.has(term.term.trim().toLowerCase());
                return (
                  <div
                    key={term.id}
                    className="grid grid-cols-[1fr_1fr_1.5fr_110px] items-center gap-4 px-4 py-2.5"
                  >
                    <span className="text-xs font-semibold text-ink truncate">{term.term}</span>
                    <span className="text-xs text-ink-muted font-semibold truncate">{term.preferredTranslation}</span>
                    <span className="text-xs text-ink-muted truncate">{term.definition || "—"}</span>
                    <div className="flex justify-end">
                      {isOverridden ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Overridden
                        </Badge>
                      ) : isOwnerOrAdmin && effectiveGlossaryId ? (
                        <button
                          onClick={() => handleOverrideGlobalTerm(term.term, term.preferredTranslation, term.definition, term.usageNote)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                          title="Create a workspace term that overrides this system term"
                        >
                          <ArrowBendUpLeft className="h-3 w-3" />
                          Override
                        </button>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          From system
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Glossary Dialog */}
      <Dialog open={isGlossaryDialogOpen} onOpenChange={setIsGlossaryDialogOpen}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold text-base">Create Glossary</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Add a new vocabulary pair dictionary for localized translations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGlossarySubmit(handleCreateGlossary)} className="flex flex-col gap-3 my-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Glossary Name</label>
              <Input
                type="text"
                placeholder="e.g. Legal Terms"
                className="h-8 border-hairline text-xs"
                {...registerGlossary("name")}
              />
              {glossaryErrors.name && (
                <p className="text-[10px] text-destructive">{glossaryErrors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Description (Optional)</label>
              <Input
                type="text"
                placeholder="e.g. Finance & Legal terminology"
                className="h-8 border-hairline text-xs"
                {...registerGlossary("description")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Source Language</label>
                <Select
                  defaultValue="en"
                  onValueChange={(val) => setGlossaryValue("sourceLanguage", val || "")}
                >
                  <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {langPairs.map((l) => (
                      <SelectItem key={`src-${l.code}`} value={l.code} className="text-xs">
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Target Language</label>
                <Select
                  defaultValue="vi"
                  onValueChange={(val) => setGlossaryValue("targetLanguage", val || "")}
                >
                  <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {langPairs.map((l) => (
                      <SelectItem key={`tgt-${l.code}`} value={l.code} className="text-xs">
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setIsGlossaryDialogOpen(false)}
                className="h-8 px-3 rounded border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isGlossarySubmitting}
                className="h-8 px-4 rounded bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition"
              >
                {isGlossarySubmitting ? <Spinner className="h-4 w-4 animate-spin" /> : "Create"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Term Dialog */}
      <Dialog open={isTermDialogOpen} onOpenChange={setIsTermDialogOpen}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold text-base">Add Glossary Term</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Add a localized term override for translations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTermSubmit(handleAddTerm)} className="flex flex-col gap-3 my-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Source Term</label>
              <Input
                type="text"
                placeholder="e.g. ARR"
                className="h-8 border-hairline text-xs"
                {...registerTerm("sourceTerm")}
              />
              {termErrors.sourceTerm && (
                <p className="text-[10px] text-destructive">{termErrors.sourceTerm.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Preferred Translation</label>
              <Input
                type="text"
                placeholder="e.g. Doanh thu định kỳ năm"
                className="h-8 border-hairline text-xs"
                {...registerTerm("targetTerm")}
              />
              {termErrors.targetTerm && (
                <p className="text-[10px] text-destructive">{termErrors.targetTerm.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Definition (Optional)</label>
              <Input
                type="text"
                placeholder="e.g. Annual Recurring Revenue"
                className="h-8 border-hairline text-xs"
                {...registerTerm("definition")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Usage Note (Optional)</label>
              <Input
                type="text"
                placeholder="e.g. Use in financial translations"
                className="h-8 border-hairline text-xs"
                {...registerTerm("usageNote")}
              />
            </div>

            <DialogFooter className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setIsTermDialogOpen(false)}
                className="h-8 px-3 rounded border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isTermSubmitting}
                className="h-8 px-4 rounded bg-primary text-xs font-semibold text-white hover:bg-primary-hover transition"
              >
                {isTermSubmitting ? <Spinner className="h-4 w-4 animate-spin" /> : "Add Term"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Glossary Confirmation Dialog */}
      <Dialog open={!!glossaryToDelete} onOpenChange={(open) => !open && setGlossaryToDelete(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base">Delete Glossary?</DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Are you sure you want to delete <span className="font-semibold text-ink">{glossaryToDelete?.name}</span>? This will permanently delete the glossary and all terms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setGlossaryToDelete(null)}
              className="flex-1 h-8 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteGlossary}
              className="flex-1 h-8 rounded-md bg-destructive text-xs font-semibold text-white hover:bg-destructive/90 transition"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Term Confirmation Dialog */}
      <Dialog open={!!termToDelete} onOpenChange={(open) => !open && setTermToDelete(null)}>
        <DialogContent className="border-hairline bg-surface-1 max-w-sm">
          <DialogHeader className="flex flex-col gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
              <Warning className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-bold text-base">Delete Term?</DialogTitle>
            <DialogDescription className="text-center text-xs text-ink-muted leading-normal">
              Are you sure you want to delete the term <span className="font-semibold text-ink">{termToDelete?.term}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setTermToDelete(null)}
              className="flex-1 h-8 rounded-md border border-hairline bg-surface-1 text-xs font-semibold hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteTerm}
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
