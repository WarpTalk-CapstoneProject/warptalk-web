"use client";

import {
  Archive,
  DotsThree,
  Eye,
  FileCsv,
  FileXls,
  PencilSimple,
  Trash,
  Copy,
} from "@phosphor-icons/react/dist/ssr";
import { CHIP_TONES, CmsCard, CmsChip } from "@/components/admin/cms/cms-shared";
import { CmsSelectBox } from "@/components/admin/cms/cms-list";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type GlossaryTemplateDefinition } from "@/lib/glossary/glossary-templates-catalog";
import { cn } from "@/lib/utils";

export function GlossaryLocalePills({ template }: { template: GlossaryTemplateDefinition }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-primary">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      {template.sourceLanguage} → {template.targetLanguage}
    </span>
  );
}

export function GlossaryStatusChips({ template }: { template: GlossaryTemplateDefinition }) {
  const isPublished = template.status === "published";
  const isDraft = template.status === "draft";
  const isArchived = template.status === "archived";

  return (
    <span className="flex flex-wrap items-center gap-1">
      <CmsChip className={isPublished ? CHIP_TONES.positive : isDraft ? CHIP_TONES.warning : CHIP_TONES.neutral}>
        {isPublished ? "Published" : isDraft ? "Draft" : "Archived"}
      </CmsChip>
      <CmsChip className={CHIP_TONES.info}>
        {template.category}
      </CmsChip>
    </span>
  );
}

export interface GlossaryCardActions {
  onPreview: () => void;
  onEdit: () => void;
  onDownloadXlsx: () => void;
  onDownloadCsv: () => void;
  onDuplicate?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function GlossaryTemplateCard({
  template,
  selected,
  onSelect,
  actions,
}: {
  template: GlossaryTemplateDefinition;
  selected: boolean;
  onSelect: () => void;
  actions: GlossaryCardActions;
}) {
  const isArchived = template.status === "archived";

  return (
    <CmsCard
      className={cn(
        "flex flex-col justify-between transition-all",
        selected && "border-primary/50 ring-1 ring-primary/30",
        isArchived && "opacity-75",
      )}
    >
      <div className="flex flex-1 flex-col p-4">
        {/* Top Header */}
        <div className="flex items-start gap-2.5">
          <CmsSelectBox
            checked={selected}
            onChange={onSelect}
            label={`Select ${template.name}`}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <h3
              onClick={actions.onPreview}
              className="block cursor-pointer truncate text-[14px] font-semibold text-ink hover:text-primary transition-colors"
              title={template.name}
            >
              {template.name}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-ink-subtle truncate">
              {template.key}
            </p>
          </div>
          <GlossaryStatusChips template={template} />
        </div>

        {/* Description */}
        <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
          {template.description}
        </p>

        {/* Mid bar: Languages & terms count */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-[11.5px] text-ink-muted">
          <GlossaryLocalePills template={template} />
          <span className="font-medium text-ink-subtle">
            {template.sampleTerms.length} terms • 8 columns
          </span>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="flex items-center justify-between border-t border-hairline bg-surface-2/40 px-3 py-2 text-[12px]">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={actions.onPreview}
            className="h-7 gap-1 px-2 text-[11.5px] text-ink hover:text-primary"
          >
            <Eye size={13} />
            Preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={actions.onEdit}
            className="h-7 gap-1 px-2 text-[11.5px] text-ink hover:text-primary"
          >
            <PencilSimple size={13} />
            Edit
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={actions.onDownloadXlsx}
            title="Download Excel (.xlsx)"
            className="h-7 px-2 text-[11.5px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            <FileXls size={15} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={actions.onDownloadCsv}
            title="Download CSV (.csv)"
            className="h-7 px-2 text-[11.5px] text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            <FileCsv size={15} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-ink-muted">
                <DotsThree size={16} weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {actions.onDuplicate ? (
                <DropdownMenuItem onClick={actions.onDuplicate} className="gap-2 text-[12px]">
                  <Copy size={13} />
                  Duplicate
                </DropdownMenuItem>
              ) : null}
              {actions.onArchive ? (
                <DropdownMenuItem onClick={actions.onArchive} className="gap-2 text-[12px]">
                  <Archive size={13} />
                  {isArchived ? "Unarchive" : "Archive"}
                </DropdownMenuItem>
              ) : null}
              {actions.onDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={actions.onDelete}
                    className="gap-2 text-[12px] text-destructive focus:text-destructive"
                  >
                    <Trash size={13} />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </CmsCard>
  );
}
