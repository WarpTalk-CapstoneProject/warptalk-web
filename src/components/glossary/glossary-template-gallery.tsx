"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadSimple, Eye, FileCsv, FileXls, Check, Sparkle } from "@phosphor-icons/react";
import {
  BUILT_IN_GLOSSARY_TEMPLATES,
  generateTemplateCsv,
  generateTemplateXlsx,
  type GlossaryTemplateDefinition,
  type GlossaryTemplateLanguage,
} from "@/lib/glossary/glossary-templates-catalog";
import { type ParsedGlossaryRow } from "./glossary-import-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GlossaryTemplateGalleryProps {
  onSelectTemplate?: (template: GlossaryTemplateDefinition, rows: ParsedGlossaryRow[]) => void;
  className?: string;
  defaultLanguage?: GlossaryTemplateLanguage;
}

export function GlossaryTemplateGallery({
  onSelectTemplate,
  className,
  defaultLanguage,
}: GlossaryTemplateGalleryProps) {
  const t = useTranslations("glossary");
  const [selectedLang, setSelectedLang] = useState<string>(defaultLanguage || "all");
  const [activeTemplate, setActiveTemplate] = useState<GlossaryTemplateDefinition>(
    BUILT_IN_GLOSSARY_TEMPLATES[0]!,
  );
  const [isExporting, setIsExporting] = useState(false);

  const filteredTemplates = useMemo(() => {
    if (selectedLang === "all") return BUILT_IN_GLOSSARY_TEMPLATES;
    return BUILT_IN_GLOSSARY_TEMPLATES.filter(
      (item) => item.sourceLanguage === selectedLang || item.targetLanguage === selectedLang,
    );
  }, [selectedLang]);

  const handleDownloadXlsx = async (template: GlossaryTemplateDefinition) => {
    try {
      setIsExporting(true);
      const blob = await generateTemplateXlsx(template);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `glossary-template-${template.key}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải xuống ${template.name} (.xlsx)`);
    } catch {
      toast.error("Không thể tạo file Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadCsv = (template: GlossaryTemplateDefinition) => {
    try {
      const csv = generateTemplateCsv(template);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `glossary-template-${template.key}.csv`;
      link.click();
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải xuống ${template.name} (.csv)`);
    } catch {
      toast.error("Không thể tạo file CSV");
    }
  };

  const handleApplyTemplate = (template: GlossaryTemplateDefinition) => {
    const rows: ParsedGlossaryRow[] = template.sampleTerms.map((term) => ({
      sourceTerm: term.term,
      targetTerm: term.translation,
      context: term.context,
      domain: term.domain,
      partOfSpeech: term.partOfSpeech,
      definition: term.definition,
      usageNote: term.usageNote,
      priority: term.priority,
    }));
    onSelectTemplate?.(template, rows);
    toast.success(`Đã chọn mẫu ${template.name}`);
  };

  return (
    <div className={cn("flex flex-col gap-4 text-left", className)}>
      {/* Language filter pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkle className="h-4 w-4 text-primary" weight="fill" />
          <span className="text-[13px] font-semibold text-ink">Template Catalog</span>
        </div>
        <div className="flex items-center gap-1">
          {[
            { id: "all", label: "All" },
            { id: "en", label: "English (EN)" },
            { id: "vi", label: "Tiếng Việt (VI)" },
            { id: "ja", label: "日本語 (JA)" },
          ].map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => setSelectedLang(lang.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                selectedLang === lang.id
                  ? "bg-primary text-white"
                  : "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Template Card Carousel / Grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
        {filteredTemplates.map((template) => {
          const isSelected = activeTemplate.key === template.key;
          return (
            <div
              key={template.key}
              onClick={() => setActiveTemplate(template)}
              className={cn(
                "group relative flex cursor-pointer flex-col justify-between rounded-lg border p-3 transition-all",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  : "border-border bg-surface-1 hover:border-ink-muted/30 hover:bg-surface-2",
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    {template.category}
                  </span>
                  <span className="font-mono text-[10.5px] font-semibold text-primary">
                    {template.sourceLanguage.toUpperCase()} → {template.targetLanguage.toUpperCase()}
                  </span>
                </div>
                <h4 className="text-[12.5px] font-semibold text-ink line-clamp-1 group-hover:text-primary transition-colors">
                  {template.name}
                </h4>
                <p className="mt-1 text-[11px] text-ink-muted line-clamp-2 leading-relaxed">
                  {template.description}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2 text-[11px] text-ink-subtle">
                <span>{template.sampleTerms.length} terms • 8 columns</span>
                <span className="flex items-center gap-1 font-medium text-primary">
                  <Eye className="h-3 w-3" />
                  {isSelected ? "Viewing" : "Preview"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Template Live Preview Table */}
      {activeTemplate ? (
        <div className="mt-1 flex flex-col rounded-lg border border-border bg-surface-1 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2 mb-2">
            <div>
              <span className="text-[12px] font-semibold text-ink">
                Xem trước: {activeTemplate.name}
              </span>
              <span className="ml-2 text-[11px] text-ink-muted">
                ({activeTemplate.sampleTerms.length} dòng mẫu, bao gồm cột Context)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isExporting}
                onClick={() => void handleDownloadXlsx(activeTemplate)}
                className="h-7 gap-1 px-2.5 text-[11px] shadow-none"
              >
                <FileXls className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Tải .xlsx
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDownloadCsv(activeTemplate)}
                className="h-7 gap-1 px-2.5 text-[11px] shadow-none"
              >
                <FileCsv className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                Tải .csv
              </Button>
              {onSelectTemplate ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleApplyTemplate(activeTemplate)}
                  className="h-7 gap-1 px-3 text-[11px] shadow-none"
                >
                  <Check className="h-3.5 w-3.5" />
                  Dùng mẫu này
                </Button>
              ) : null}
            </div>
          </div>

          <div className="max-h-[160px] overflow-x-auto overflow-y-auto rounded border border-hairline">
            <table className="w-full text-left text-[11.5px]">
              <thead className="sticky top-0 bg-surface-2 text-[10.5px] uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">Term</th>
                  <th className="px-2.5 py-1.5 font-medium">Translation</th>
                  <th className="px-2.5 py-1.5 font-medium min-w-[160px]">Context (Ngữ cảnh)</th>
                  <th className="px-2.5 py-1.5 font-medium">Field</th>
                  <th className="px-2.5 py-1.5 font-medium">Part of speech</th>
                  <th className="px-2.5 py-1.5 font-medium text-right">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {activeTemplate.sampleTerms.map((term, index) => (
                  <tr key={`${term.term}-${index}`} className="hover:bg-surface-2/60">
                    <td className="px-2.5 py-1 font-medium text-ink">{term.term}</td>
                    <td className="px-2.5 py-1 font-semibold text-primary">{term.translation}</td>
                    <td className="px-2.5 py-1 text-ink-muted leading-tight">{term.context || "—"}</td>
                    <td className="px-2.5 py-1 text-ink-muted">{term.domain || "—"}</td>
                    <td className="px-2.5 py-1 text-ink-subtle">{term.partOfSpeech || "—"}</td>
                    <td className="px-2.5 py-1 text-right text-ink-muted">{term.priority ?? 5}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
