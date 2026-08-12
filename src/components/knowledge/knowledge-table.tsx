"use client";

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
} from "@phosphor-icons/react/dist/ssr";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";

import { AdminFilterTabs, AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import type { KnowledgeFilters } from "@/hooks/use-knowledge-filters";
import {
  canGoBack,
  hasAnyFact,
  shouldShowPager,
  sourceLabel,
  SOURCE_TABS,
} from "@/lib/knowledge/knowledge-view";
import { FACT_CATEGORIES } from "@/types/workspace-knowledge";
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
  const Icon = SOURCE_ICONS[chunk.sourceType] ?? Brain;

  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
      <div className="min-w-0">
        <div className="truncate text-[12px] text-ink">{sourceLabel(chunk)}</div>
        {chunk.sourceType === "document" && chunk.chunkIndex != null ? (
          <div className="text-[10px] tabular-nums text-ink-subtle">
            chunk {chunk.chunkIndex}
          </div>
        ) : null}
      </div>
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
  /**
   * The empty state differs by audience: an Owner is told how to put something in the index, an
   * admin is told what the absence means. Same fact, different next step.
   */
  emptyHint: string;
}

export function KnowledgeTable({
  filters,
  data,
  isLoading,
  isError,
  isFetching,
  onRetry,
  emptyHint,
}: KnowledgeTableProps) {
  const items = data?.items ?? [];
  const { factCategory, cursorStack } = filters;

  return (
    <>
      <AdminFilterTabs
        tabs={SOURCE_TABS}
        value={filters.sourceTab}
        onChange={filters.setSourceTab}
        label="Filter indexed knowledge by source"
        trailing={items.length ? `${items.length} on this page` : undefined}
      />

      <FilterChipGroup label="Filter facts by category" className="py-3">
        <FilterChip
          selected={factCategory === null}
          onClick={() => filters.setFactCategory(null)}
        >
          All facts
        </FilterChip>
        {FACT_CATEGORIES.map((category) => (
          <FilterChip
            key={category}
            selected={factCategory === category}
            onClick={() => filters.setFactCategory(category)}
          >
            {category}
          </FilterChip>
        ))}
      </FilterChipGroup>

      <AdminPanel>
        {isError ? (
          // Distinct from the empty state on purpose. "We could not read the index" and
          // "nothing is indexed" lead a reader to opposite conclusions about their upload.
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-ink">Could not read the index.</p>
            <p className="mt-1 text-[12px] text-ink-muted">
              This is not the same as an empty workspace — the store did not answer.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <div className="px-5 py-12 text-center text-[13px] text-ink-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-ink">Nothing indexed yet.</p>
            <p className="mt-1 text-[12px] text-ink-muted">{emptyHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Fact</th>
                  <th className="px-4 py-2.5 font-medium">Indexed text</th>
                  <th className="px-4 py-2.5 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {items.map((chunk) => (
                  <tr
                    key={chunk.chunkId}
                    className="border-b border-border/60 align-top last:border-0"
                  >
                    <td className="w-[190px] px-4 py-3">
                      <SourceCell chunk={chunk} />
                    </td>
                    <td className="w-[280px] px-4 py-3">
                      {chunk.fact ? (
                        <>
                          <p className="text-[12px] leading-relaxed text-ink">{chunk.fact}</p>
                          {chunk.factCategory ? (
                            <span className="mt-1.5 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] capitalize text-ink-muted">
                              {chunk.factCategory}
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
                          Indexed before content was kept
                        </span>
                      )}
                    </td>
                    <td className="w-[110px] px-4 py-3">
                      <span className="text-[11px] capitalize text-ink-muted">
                        {chunk.retentionState || "—"}
                      </span>
                      {!chunk.aiRetrieval ? (
                        <div className="mt-1 text-[10px] text-ink-subtle">not retrievable</div>
                      ) : null}
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
          No facts on these rows. They were indexed before fact extraction, or this workspace
          has external AI processing turned off — re-upload a document to extract facts for it.
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
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.nextCursor || isFetching}
            onClick={() => filters.goNext(data?.nextCursor ?? null)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </>
  );
}
