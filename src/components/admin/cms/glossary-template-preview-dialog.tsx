"use client";

import { useState } from "react";
import { FileCsv, FileXls, Copy, Check } from "@phosphor-icons/react";
import {
  type GlossaryTemplateDefinition,
  generateTemplateCsv,
  generateTemplateXlsx,
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
import { GlossaryLocalePills, GlossaryStatusChips } from "./glossary-template-card";
import { toast } from "sonner";

interface GlossaryTemplatePreviewDialogProps {
  template: GlossaryTemplateDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (template: GlossaryTemplateDefinition) => void;
}

export function GlossaryTemplatePreviewDialog({
  template,
  open,
  onOpenChange,
  onEdit,
}: GlossaryTemplatePreviewDialogProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!template) return null;

  const handleDownloadXlsx = async () => {
    try {
      setIsExporting(true);
      const blob = await generateTemplateXlsx(template);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `glossary-template-${template.key}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded Excel file for ${template.name}`);
    } catch {
      toast.error("Failed to export Excel file");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadCsv = () => {
    try {
      const csv = generateTemplateCsv(template);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `glossary-template-${template.key}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded CSV file for ${template.name}`);
    } catch {
      toast.error("Failed to export CSV file");
    }
  };

  const handleCopyHeaders = () => {
    const headers = "Term\tTranslation\tContext\tField\tDefinition\tNote\tPart of speech\tPriority";
    void navigator.clipboard.writeText(headers);
    setCopied(true);
    toast.success("Copied 8 standard column headers to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-border bg-surface-1 p-6 shadow-none">
        <DialogHeader className="border-b border-hairline pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GlossaryLocalePills template={template} />
                <GlossaryStatusChips template={template} />
              </div>
              <DialogTitle className="text-[17px] font-semibold text-ink">
                {template.name}
              </DialogTitle>
              <DialogDescription className="mt-1 text-[12.5px] text-ink-muted">
                {template.description}
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyHeaders}
                className="h-8 gap-1.5 text-[12px] shadow-none"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                Copy headers
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isExporting}
                onClick={() => void handleDownloadXlsx()}
                className="h-8 gap-1.5 text-[12px] shadow-none text-emerald-600 dark:text-emerald-400"
              >
                <FileXls className="h-4 w-4" />
                Export .xlsx
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadCsv}
                className="h-8 gap-1.5 text-[12px] shadow-none text-sky-600 dark:text-sky-400"
              >
                <FileCsv className="h-4 w-4" />
                Export .csv
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* 8-Column Preview Table */}
        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between text-[11.5px] text-ink-muted">
            <span>Standard sample dataset ({template.sampleTerms.length} terms)</span>
            <span className="font-mono text-ink-subtle">Key: {template.key}</span>
          </div>

          <div className="max-h-[380px] overflow-x-auto overflow-y-auto rounded-lg border border-hairline bg-surface-2/20">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wider text-ink-muted shadow-sm">
                <tr>
                  <th className="px-3 py-2 font-medium">Term</th>
                  <th className="px-3 py-2 font-medium">Translation</th>
                  <th className="px-3 py-2 font-medium min-w-[180px]">Context</th>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium min-w-[160px]">Definition</th>
                  <th className="px-3 py-2 font-medium min-w-[140px]">Usage note</th>
                  <th className="px-3 py-2 font-medium">Part of speech</th>
                  <th className="px-3 py-2 font-medium text-right">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {template.sampleTerms.map((term, index) => (
                  <tr key={`${term.term}-${index}`} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-3 py-2 font-medium text-ink whitespace-nowrap">{term.term}</td>
                    <td className="px-3 py-2 font-semibold text-primary whitespace-nowrap">{term.translation}</td>
                    <td className="px-3 py-2 text-ink-muted leading-relaxed text-[11.5px]">{term.context || "—"}</td>
                    <td className="px-3 py-2 text-ink-muted whitespace-nowrap">{term.domain || "—"}</td>
                    <td className="px-3 py-2 text-ink-subtle leading-relaxed text-[11.5px]">{term.definition || "—"}</td>
                    <td className="px-3 py-2 text-ink-subtle leading-relaxed text-[11.5px]">{term.usageNote || "—"}</td>
                    <td className="px-3 py-2 text-ink-subtle whitespace-nowrap">{term.partOfSpeech || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-muted">{term.priority ?? 5}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="mt-4 border-t border-hairline pt-3 flex items-center justify-between sm:justify-between">
          <span className="text-[11.5px] text-ink-subtle">
            Full support for 8 standardized columns for AI STT & MT
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="shadow-none"
            >
              Close
            </Button>
            {onEdit ? (
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(template);
                }}
                className="shadow-none"
              >
                Edit template
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
