"use client";

import { useMemo } from "react";
/**
 * The knowledge listing itself: source filters, fact-category chips, the table, and the pager.
 *
 * Shared by the workspace-scoped Knowledge page and the admin workspace detail's Knowledge tab.
 * Presentational and stateless about *which* workspace it reads — the caller owns both the
 * filter state (`useKnowledgeFilters`) and the query hook, because the two surfaces call
 * different endpoints with different authorization but render the same rows.
 *
 * The rules this table obeys — a filter change resets the cursor, an unknown source type is
 * shown as itself, the pager hides on a failed read — live in lib/knowledge/knowledge-view.ts
 * and are tested there directly.
 */

import {
  Brain,
  BookOpen,
  Buildings,
  FileText,
  Sparkle,
  Lightning,
  Prohibit,
  Warning,
  Clock,
} from "@phosphor-icons/react/dist/ssr";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { useTranslations } from "next-intl";

import { AdminFilterTabs, AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import type { KnowledgeFilters } from "@/hooks/use-knowledge-filters";
import { cn } from "@/lib/utils";
import {
  canGoBack,
  hasAnyFact,
  orderKnowledgeChunks,
  shouldShowPager,
  sourceLabel,
  sourceTypeLabel,
  translatedSourceTabs,
} from "@/lib/knowledge/knowledge-view";
import { FACT_CATEGORIES, isKnownFactCategory } from "@/types/workspace-knowledge";
import type {
  WorkspaceKnowledgeChunkDto,
  WorkspaceKnowledgePageDto,
} from "@/types/workspace-knowledge";

const SOURCE_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  meeting_summary: Sparkle,
  glossary: BookOpen,
  workspace_context: Buildings,
};

function SourceCell({ chunk }: { chunk: WorkspaceKnowledgeChunkDto }) {
  const t = useTranslations("knowledge.table");
  const tKnowledge = useTranslations("knowledge");
  const Icon = SOURCE_ICONS[chunk.sourceType] ?? Brain;
  const label = sourceLabel(chunk, tKnowledge);
  const typeLabel = sourceTypeLabel(chunk.sourceType, tKnowledge);

  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="mt-0.5 p-1 rounded bg-surface-2 shrink-0">
        <Icon size={14} className="text-ink" />
      </div>
      <div className="min-w-0">
        {/* Line 1: Source Title */}
        <div className="truncate text-[12px] font-medium text-ink" title={label}>
          {label}
        </div>
        {/* Line 2: Subtitle for Source Type & Chunk Index */}
        <div className="text-[10px] text-ink-subtle truncate flex items-center gap-1 mt-0.5">
          <span>{typeLabel}</span>
          {chunk.chunkIndex != null ? (
            <>
              <span>•</span>
              <span className="tabular-nums">{t("chunkNumber", { index: chunk.chunkIndex })}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StateCell({ chunk }: { chunk: WorkspaceKnowledgeChunkDto }) {
  const t = useTranslations("knowledge.table");
  const isExpired = chunk.retentionState === "expired";
  const isDeleted = chunk.deletionState === "deleted";
  const isEnabled = chunk.aiRetrieval && !isExpired && !isDeleted;

  if (isEnabled) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {t("aiReady")}
        </span>
      </div>
    );
  }

  // Disabled State with Reason
  let reasonLabel = t("disabledByOwner");
  let ReasonIcon = Prohibit;
  let iconColor = "text-ink-subtle";

  const failureReason = chunk.ingestionFailureReason?.toLowerCase();
  if (failureReason === "dlp_detected") {
    reasonLabel = t("dlpRestricted");
    ReasonIcon = Prohibit;
    iconColor = "text-rose-500";
  } else if (failureReason === "security_scan_timeout") {
    reasonLabel = t("scanTimeout");
    ReasonIcon = Clock;
    iconColor = "text-amber-500";
  } else if (failureReason === "security_scan_failed") {
    reasonLabel = t("scanFailed");
    ReasonIcon = Warning;
    iconColor = "text-amber-500";
  } else if (failureReason === "embedding_failed" || failureReason === "embedding_publish_failed") {
    reasonLabel = t("vectorDbFail");
    ReasonIcon = Warning;
    iconColor = "text-rose-500";
  } else if (failureReason === "pii_unmasked") {
    reasonLabel = t("unmaskedPii");
    ReasonIcon = Warning;
    iconColor = "text-amber-500";
  } else if (isExpired || failureReason === "retention_expired") {
    reasonLabel = t("retentionExpired");
    ReasonIcon = Clock;
    iconColor = "text-ink-subtle";
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 border border-rose-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        {t("disabled")}
      </span>
      <span className="text-[10px] text-ink-subtle flex items-center gap-1">
        <ReasonIcon size={11} className={cn("shrink-0", iconColor)} />
        <span>{reasonLabel}</span>
      </span>
    </div>
  );
}

interface KnowledgeTableProps {
  filters: KnowledgeFilters;
  data: WorkspaceKnowledgePageDto | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onSelect?: (chunk: WorkspaceKnowledgeChunkDto) => void;
  emptyHint: string;
}

export function KnowledgeTable({
  filters,
  data,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onSelect,
  emptyHint,
}: KnowledgeTableProps) {
  const t = useTranslations("knowledge.table");
  const tKnowledge = useTranslations("knowledge");
  const tCategories = useTranslations("knowledge.factCategories");
  const allItems = useMemo(() => orderKnowledgeChunks(data?.items ?? []), [data?.items]);
  
  // Apply Retrieval Filter (All / Enabled / Disabled)
  const items = useMemo(() => {
    if (filters.retrievalTab === "enabled") {
      return allItems.filter((c) => c.aiRetrieval && c.retentionState !== "expired");
    }
    if (filters.retrievalTab === "disabled") {
      return allItems.filter((c) => !c.aiRetrieval || c.retentionState === "expired");
    }
    return allItems;
  }, [allItems, filters.retrievalTab]);

  const { factCategory, cursorStack } = filters;

  const availableCategories = useMemo(() => {
    const catSet = new Set<string>(FACT_CATEGORIES);
    if (filters.factCategory) {
      catSet.add(filters.factCategory);
    }
    for (const item of data?.items ?? []) {
      if (item.factCategory && item.factCategory.trim()) {
        catSet.add(item.factCategory.trim());
      }
    }
    return Array.from(catSet);
  }, [data?.items, filters.factCategory]);

  return (
    <>
      <AdminFilterTabs
        tabs={translatedSourceTabs(tKnowledge)}
        value={filters.sourceTab}
        onChange={filters.setSourceTab}
        label={t("filterBySourceAriaLabel")}
        trailing={items.length ? t("onThisPage", { count: items.length }) : undefined}
      />

      {/* Quick Tab Filter for Retrieval State */}
      <div className="py-2 flex items-center gap-2 border-b border-border/40 mb-2">
        <span className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider mr-1">
          {t("retrievalLabel")}
        </span>
        <button
          type="button"
          onClick={() => filters.setRetrievalTab("all")}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
            filters.retrievalTab === "all"
              ? "bg-surface-3 text-ink shadow-xs"
              : "text-ink-muted hover:text-ink hover:bg-surface-2",
          )}
        >
          {t("allKnowledge")}
        </button>
        <button
          type="button"
          onClick={() => filters.setRetrievalTab("enabled")}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5",
            filters.retrievalTab === "enabled"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold"
              : "text-ink-muted hover:text-emerald-600 hover:bg-surface-2",
          )}
        >
          <Lightning size={12} weight="fill" className="text-emerald-500 shrink-0" />
          <span>{t("enabledInWarpBot")}</span>
        </button>
        <button
          type="button"
          onClick={() => filters.setRetrievalTab("disabled")}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5",
            filters.retrievalTab === "disabled"
              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold"
              : "text-ink-muted hover:text-rose-600 hover:bg-surface-2",
          )}
        >
          <Prohibit size={12} className="text-rose-500 shrink-0" />
          <span>{t("disabledInWarpBot")}</span>
        </button>
      </div>

      <FilterChipGroup label={t("filterByCategoryAriaLabel")} className="pb-3">
        <FilterChip
          selected={factCategory === null}
          onClick={() => filters.setFactCategory(null)}
        >
          {t("allFacts")}
        </FilterChip>
        {availableCategories.map((category) => (
          <FilterChip
            key={category}
            selected={factCategory === category}
            onClick={() => filters.setFactCategory(category)}
          >
            {isKnownFactCategory(category) ? tCategories(category) : category}
          </FilterChip>
        ))}
      </FilterChipGroup>

      <AdminPanel>
        {isError ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-ink">{t("readError")}</p>
            <p className="mt-1 text-[12px] text-ink-muted">
              {t("readErrorDetail")}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
              {t("tryAgain")}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="px-5 py-12 text-center text-[13px] text-ink-muted">{t("loading")}</div>
        ) : items.length === 0 ? (
          <PagePlaceholder
            kind="knowledge"
            title={t("emptyTitle")}
            description={emptyHint}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-2.5 font-medium">{t("sourceColumn")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("factColumn")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("textColumn")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("stateColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((chunk) => (
                  <tr
                    key={chunk.chunkId}
                    onClick={onSelect ? () => onSelect(chunk) : undefined}
                    onKeyDown={
                      onSelect
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            onSelect(chunk);
                          }
                        : undefined
                    }
                    tabIndex={onSelect ? 0 : undefined}
                    role={onSelect ? "button" : undefined}
                    aria-label={onSelect ? t("openAria", { label: sourceLabel(chunk, tKnowledge) }) : undefined}
                    className={cn(
                      "border-b border-border/60 align-top last:border-0",
                      onSelect &&
                        "cursor-pointer transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                    )}
                  >
                    <td className="w-[210px] px-4 py-3">
                      <SourceCell chunk={chunk} />
                    </td>
                    <td className="w-[260px] px-4 py-3">
                      {chunk.fact ? (
                        <>
                          <p className="text-[12px] leading-relaxed text-ink">{chunk.fact}</p>
                          {chunk.factCategory ? (
                            <span className="mt-1.5 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] capitalize text-ink-muted">
                              {isKnownFactCategory(chunk.factCategory)
                                ? tCategories(chunk.factCategory)
                                : chunk.factCategory}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[11px] text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {chunk.text ? (
                        <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-muted">
                          {chunk.text}
                        </p>
                      ) : (
                        <span className="text-[11px] text-ink-subtle">
                          {t("indexedBeforeText")}
                        </span>
                      )}
                    </td>
                    <td className="w-[140px] px-4 py-3">
                      <StateCell chunk={chunk} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      {items.length > 0 && !hasAnyFact(items) ? (
        // Say why the column is empty rather than letting a reader conclude extraction is
        // broken. Facts are extracted at index time, so anything stored before the extractor
        // shipped has none, and a workspace that has turned off external AI never will.
        <p className="mt-3 text-[11px] text-ink-subtle">
          {t("noFactsHint")}
        </p>
      ) : null}

      {shouldShowPager(cursorStack, data?.nextCursor, isError) ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoBack(cursorStack) || isFetching}
            onClick={filters.goBack}
          >
            {t("back")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.nextCursor || isFetching}
            onClick={() => filters.goNext(data?.nextCursor ?? null)}
          >
            {t("next")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
