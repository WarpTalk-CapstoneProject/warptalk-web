"use client";

import { useEffect, useState } from "react";
import { Plus, Trash, Sparkle } from "@phosphor-icons/react";
import {
  type GlossaryTemplateDefinition,
  type GlossaryTemplateCategory,
  type GlossaryTemplateLanguage,
  type GlossaryTemplateTermItem,
} from "@/lib/glossary/glossary-templates-catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface GlossaryTemplateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateToEdit?: GlossaryTemplateDefinition | null;
  onSave: (template: GlossaryTemplateDefinition) => void;
  takenKeys: ReadonlySet<string>;
}

export function GlossaryTemplateWizard({
  open,
  onOpenChange,
  templateToEdit,
  onSave,
  takenKeys,
}: GlossaryTemplateWizardProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<GlossaryTemplateCategory>("IT");
  const [sourceLanguage, setSourceLanguage] = useState<GlossaryTemplateLanguage>("en");
  const [targetLanguage, setTargetLanguage] = useState<GlossaryTemplateLanguage>("vi");
  const [status, setStatus] = useState<"published" | "draft" | "archived">("published");
  const [sampleTerms, setSampleTerms] = useState<GlossaryTemplateTermItem[]>([]);

  useEffect(() => {
    if (templateToEdit) {
      setName(templateToEdit.name);
      setKey(templateToEdit.key);
      setDescription(templateToEdit.description);
      setCategory(templateToEdit.category);
      setSourceLanguage(templateToEdit.sourceLanguage);
      setTargetLanguage(templateToEdit.targetLanguage);
      setStatus(templateToEdit.status);
      setSampleTerms([...templateToEdit.sampleTerms]);
    } else {
      setName("");
      setKey("");
      setDescription("");
      setCategory("IT");
      setSourceLanguage("en");
      setTargetLanguage("vi");
      setStatus("published");
      // i18n-allow: default sample template term
      setSampleTerms([
        {
          term: "pipeline",
          translation: "quy trình CI/CD",
          context: "Trong quy trình DevOps và tự động hóa build/deploy",
          domain: "DevOps",
          partOfSpeech: "noun",
          definition: "Automated processes to build and deploy code",
          usageNote: "Không dịch ống nước",
          priority: 8,
        },
      ]);
    }
  }, [templateToEdit, open]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!templateToEdit && !key) {
      const slug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setKey(slug);
    }
  };

  const handleAddTerm = () => {
    setSampleTerms((prev) => [
      ...prev,
      {
        term: "",
        translation: "",
        context: "",
        domain: category,
        partOfSpeech: "noun",
        definition: "",
        usageNote: "",
        priority: 5,
      },
    ]);
  };

  const handleRemoveTerm = (index: number) => {
    setSampleTerms((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTermChange = (index: number, field: keyof GlossaryTemplateTermItem, val: unknown) => {
    setSampleTerms((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: val };
      return next;
    });
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    if (!key.trim()) {
      toast.error("Please enter a template identifier key");
      return;
    }
    if (!templateToEdit && takenKeys.has(key)) {
      toast.error(`Key "${key}" already exists. Please choose a different key.`);
      return;
    }

    const validTerms = sampleTerms.filter((t) => t.term.trim() && t.translation.trim());
    if (validTerms.length === 0) {
      toast.error("Please provide at least 1 sample term with Term and Translation");
      return;
    }

    const updated: GlossaryTemplateDefinition = {
      key: key.trim(),
      name: name.trim(),
      description: description.trim(),
      category,
      sourceLanguage,
      targetLanguage,
      status,
      updatedAt: new Date().toISOString(),
      sampleTerms: validTerms,
    };

    onSave(updated);
    toast.success(templateToEdit ? "Template updated" : "Template created");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-surface-1 p-6 shadow-none max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <Sparkle className="h-5 w-5 text-primary" weight="fill" />
            <DialogTitle className="text-[17px] font-semibold text-ink">
              {templateToEdit ? `Edit: ${templateToEdit.name}` : "New Glossary Template"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] text-ink-muted">
            Configure standard glossary templates across domains and languages (EN, VI, JA) for the platform.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4 text-xs">
          {/* Metadata Section */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-[11.5px] font-semibold">Template name</Label>
              <Input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. IT & Cloud Architecture"
                className="mt-1 h-8 text-xs border-hairline"
              />
            </div>
            <div>
              <Label className="text-[11.5px] font-semibold">Identifier key</Label>
              <Input
                value={key}
                disabled={!!templateToEdit}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g. it-cloud-architecture"
                className="mt-1 h-8 text-xs font-mono border-hairline"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-[11.5px] font-semibold">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as GlossaryTemplateCategory)}
                className="mt-1 block h-8 w-full rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink"
              >
                <option value="IT">IT & Software</option>
                <option value="BUSINESS">Business & Corporate</option>
                <option value="GAMING">Gaming & Esports</option>
                <option value="GENERAL">General & Work</option>
              </select>
            </div>
            <div>
              <Label className="text-[11.5px] font-semibold">Source language</Label>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value as GlossaryTemplateLanguage)}
                className="mt-1 block h-8 w-full rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink"
              >
                <option value="en">English (EN)</option>
                <option value="vi">Vietnamese (VI)</option>
                <option value="ja">Japanese (JA)</option>
              </select>
            </div>
            <div>
              <Label className="text-[11.5px] font-semibold">Target language</Label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value as GlossaryTemplateLanguage)}
                className="mt-1 block h-8 w-full rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink"
              >
                <option value="vi">Vietnamese (VI)</option>
                <option value="en">English (EN)</option>
                <option value="ja">Japanese (JA)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label className="text-[11.5px] font-semibold">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Microservices and cloud infrastructure terms for software engineers"
                className="mt-1 h-8 text-xs border-hairline"
              />
            </div>
            <div>
              <Label className="text-[11.5px] font-semibold">Status</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "published" | "draft" | "archived")}
                className="mt-1 block h-8 w-full rounded-md border border-hairline bg-surface-1 px-2 text-xs text-ink"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Terms Editor */}
          <div className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-[12px] font-semibold text-ink">
                Sample terms ({sampleTerms.length} rows)
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTerm}
                className="h-7 gap-1 px-2.5 text-[11px] shadow-none"
              >
                <Plus size={13} />
                Add term
              </Button>
            </div>

            <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
              {sampleTerms.map((term, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-hairline bg-surface-2/40 p-2.5 flex flex-col gap-2"
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Input
                        value={term.term}
                        onChange={(e) => handleTermChange(index, "term", e.target.value)}
                        placeholder="Term *"
                        className="h-7 text-xs bg-surface-1 font-medium"
                      />
                    </div>
                    <div className="col-span-4">
                      <Input
                        value={term.translation}
                        onChange={(e) => handleTermChange(index, "translation", e.target.value)}
                        placeholder="Translation *"
                        className="h-7 text-xs bg-surface-1 font-semibold text-primary"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={term.domain}
                        onChange={(e) => handleTermChange(index, "domain", e.target.value)}
                        placeholder="Field / Domain"
                        className="h-7 text-xs bg-surface-1"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTerm(index)}
                        disabled={sampleTerms.length === 1}
                        className="h-7 w-7 p-0 text-ink-muted hover:text-destructive"
                      >
                        <Trash size={14} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-7">
                      <Input
                        value={term.context}
                        onChange={(e) => handleTermChange(index, "context", e.target.value)}
                        placeholder="Context (usage context / example sentence)"
                        className="h-7 text-xs bg-surface-1"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={term.definition}
                        onChange={(e) => handleTermChange(index, "definition", e.target.value)}
                        placeholder="Definition"
                        className="h-7 text-xs bg-surface-1"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={term.priority ?? 5}
                        onChange={(e) => handleTermChange(index, "priority", Number(e.target.value))}
                        placeholder="Priority"
                        className="h-7 text-xs bg-surface-1 text-center"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 border-t border-hairline pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="shadow-none">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="shadow-none">
            {templateToEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
