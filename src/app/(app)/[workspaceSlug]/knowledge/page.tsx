"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowClockwise,
  Brain,
  FileText,
  Funnel,
  Microphone,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";

import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { Button } from "@/components/ui/button";
import { useWorkspaceKnowledge } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import { FACT_CATEGORIES } from "@/types/workspace-knowledge";
import type { ReactNode } from "react";
import type {
  FactCategory,
  WorkspaceKnowledgeChunkDto,
} from "@/types/workspace-knowledge";

type SourceTab = "all" | "document" | "transcript";

const SOURCE_TABS: Array<{ value: SourceTab; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "document", label: "Documents" },
  { value: "transcript", label: "Meetings" },
];

const SOURCE_FILTER_WIDTH_CLASS: Record<SourceTab, string> = {
  all: "w-[104px]",
  document: "w-[104px]",
  transcript: "w-[92px]",
};

const FACT_FILTERS: Array<{ value: FactCategory | "all"; label: string }> = [
  { value: "all", label: "All facts" },
  ...FACT_CATEGORIES.map((category) => ({
    value: category,
    label: toTitleCase(category),
  })),
];

const FACT_FILTER_WIDTH_CLASS: Record<FactCategory | "all", string> = {
  all: "w-[92px]",
  decision: "w-[86px]",
  requirement: "w-[112px]",
  definition: "w-[98px]",
  commitment: "w-[112px]",
  risk: "w-[68px]",
  reference: "w-[96px]",
};

const KNOWLEDGE_GRID_CLASS =
  "grid-cols-[minmax(240px,1.05fr)_minmax(280px,1.2fr)_minmax(360px,1.6fr)_120px]";

/** Cursors for pages already visited, so Back does not have to re-scroll from the start. */
type CursorStack = (string | null)[];

function formatOffset(startMs: number | null): string | null {
  if (startMs == null) return null;
  const totalSeconds = Math.floor(startMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function SourceCell({ chunk }: { chunk: WorkspaceKnowledgeChunkDto }) {
  const isTranscript = chunk.sourceType === "transcript";
  const offset = isTranscript ? formatOffset(chunk.startMs) : null;
  const Icon = isTranscript ? Microphone : FileText;
  const title = isTranscript
    ? chunk.speakerName || "Meeting transcript"
    : chunk.documentName || "Document";
  const detail = isTranscript
    ? offset
      ? `at ${offset}`
      : "Meeting"
    : chunk.chunkIndex != null
      ? `chunk ${chunk.chunkIndex}`
      : "Document";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon size={11} weight="bold" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{title}</p>
        <p className="truncate text-[10px] text-ink-muted">{detail}</p>
      </div>
    </div>
  );
}

export default function WorkspaceKnowledgePage() {
  const params = useParams();
  const workspaceSlug = String(params?.workspaceSlug ?? "");
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceStore((state) => state.role);
  const isOwnerOrAdmin =
    role?.toLowerCase() === "owner" || role?.toLowerCase() === "admin";

  const [sourceTab, setSourceTab] = useState<SourceTab>("all");
  const [factCategory, setFactCategory] = useState<FactCategory | null>(null);
  const [cursorStack, setCursorStack] = useState<CursorStack>([null]);
  const [searchQuery, setSearchQuery] = useState("");

  const cursor = cursorStack[cursorStack.length - 1];

  const query = useMemo(
    () => ({
      ...(sourceTab === "all" ? {} : { sourceType: sourceTab }),
      ...(factCategory ? { factCategory } : {}),
      ...(cursor ? { cursor } : {}),
      pageSize: 50,
    }),
    [sourceTab, factCategory, cursor],
  );

  const { data, isLoading, isError, refetch, isFetching } = useWorkspaceKnowledge(
    workspaceId ?? "",
    query,
  );

  function changeFilter(next: () => void) {
    next();
    setCursorStack([null]);
  }

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter((chunk) =>
      [
        chunk.documentName,
        chunk.speakerName,
        chunk.fact,
        chunk.factCategory,
        chunk.text,
        chunk.retentionState,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch)),
    );
  }, [items, normalizedSearch]);
  const hasFacts = items.some((chunk) => chunk.fact);

  if (!isOwnerOrAdmin) {
    return (
      <div className="flex h-full flex-col bg-surface-1 text-ink">
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div>
            <div className="mx-auto mb-3 flex size-9 items-center justify-center rounded-xl bg-surface-2 text-ink-muted">
              <Brain size={17} weight="bold" />
            </div>
            <p className="text-[13px] font-medium text-ink">
              Only a workspace Owner or Admin can see what has been indexed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="flex shrink-0 flex-col gap-2 px-2 pb-1.5 pt-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
              {SOURCE_TABS.map((tab) => (
                <FilterPill
                  key={tab.value}
                  active={sourceTab === tab.value}
                  className={SOURCE_FILTER_WIDTH_CLASS[tab.value]}
                  onClick={() => changeFilter(() => setSourceTab(tab.value))}
                >
                  {tab.label}
                </FilterPill>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ExpandingSearchDock
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="Search knowledge..."
                ariaLabel="Search workspace knowledge"
                collapsedWidth={28}
                expandedWidth={220}
                className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
                iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
                clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
                inputClassName="h-[26px] text-[12px]"
              />
              <button
                type="button"
                className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
                title="Knowledge filters"
              >
                <Funnel weight="bold" size={13} />
                {(sourceTab !== "all" || factCategory) && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                title={isFetching ? "Refreshing" : "Refresh knowledge"}
              >
                <ArrowClockwise
                  weight="bold"
                  size={13}
                  className={isFetching ? "animate-spin" : undefined}
                />
              </button>
              <button
                type="button"
                className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
                title={`${visibleItems.length} rows`}
              >
                <SlidersHorizontal weight="bold" size={13} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            {FACT_FILTERS.map((filter) => (
              <FilterPill
                key={filter.value}
                active={
                  filter.value === "all"
                    ? factCategory === null
                    : factCategory === filter.value
                }
                className={FACT_FILTER_WIDTH_CLASS[filter.value]}
                onClick={() =>
                  changeFilter(() =>
                    setFactCategory(filter.value === "all" ? null : filter.value),
                  )
                }
              >
                {filter.label}
              </FilterPill>
            ))}
          </div>
        </section>

        <section className="min-h-full overflow-x-auto px-2">
          <div className="min-w-[1040px]">
            <div
              className={`grid ${KNOWLEDGE_GRID_CLASS} px-2 py-0.5 text-[11px] font-medium text-ink-muted`}
            >
              <ColumnLabel active>Source</ColumnLabel>
              <ColumnLabel>Fact</ColumnLabel>
              <ColumnLabel>Indexed text</ColumnLabel>
              <ColumnLabel>State</ColumnLabel>
            </div>

            {isError ? (
              <KnowledgeNotice
                title="Could not read the index."
                description="The knowledge store did not answer."
                action={
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : isLoading ? (
              <KnowledgeNotice title="Loading knowledge..." />
            ) : items.length === 0 ? (
              <KnowledgeNotice
                title="Nothing indexed yet."
                description="Upload a document or hold a meeting with transcription on."
              />
            ) : visibleItems.length === 0 ? (
              <KnowledgeNotice
                title="No matching knowledge"
                description="Try another source, fact filter, or search term."
              />
            ) : (
              <div className="space-y-0">
                {visibleItems.map((chunk) => (
                  <KnowledgeRow key={chunk.chunkId} chunk={chunk} />
                ))}
              </div>
            )}
          </div>
        </section>

        {items.length > 0 && !hasFacts ? (
          <p className="px-4 pt-2 text-[11px] text-ink-subtle">
            These rows were indexed before facts were extracted. Re-upload a document to
            see facts for it.
          </p>
        ) : null}

        {(cursorStack.length > 1 || data?.nextCursor) && !isError ? (
          <div className="sticky bottom-0 mt-auto flex items-center justify-end gap-2 border-t border-border/60 bg-surface-1/95 px-3 py-2 backdrop-blur">
            <Button
              variant="outline"
              size="sm"
              disabled={cursorStack.length <= 1 || isFetching}
              onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
            >
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data?.nextCursor || isFetching}
              onClick={() =>
                setCursorStack((stack) => [...stack, data?.nextCursor ?? null])
              }
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
      <p className="sr-only">Workspace {workspaceSlug}</p>
    </div>
  );
}

function KnowledgeRow({ chunk }: { chunk: WorkspaceKnowledgeChunkDto }) {
  return (
    <div
      className={`grid min-h-[42px] ${KNOWLEDGE_GRID_CLASS} items-center rounded-[7px] px-2 py-1.5 text-[11px] transition-none hover:!bg-surface-2 hover:!shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)]`}
    >
      <SourceCell chunk={chunk} />
      <div className="min-w-0 pr-4">
        {chunk.fact ? (
          <>
            <p className="line-clamp-2 font-medium leading-5 text-ink">{chunk.fact}</p>
            {chunk.factCategory ? (
              <span className="mt-1 inline-flex rounded-full border border-border bg-surface-1/70 px-1.5 py-0 text-[9px] capitalize text-ink-muted">
                {chunk.factCategory}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-[11px] text-ink-subtle">No fact</span>
        )}
      </div>
      <div className="min-w-0 pr-4">
        {chunk.text ? (
          <p className="line-clamp-2 leading-5 text-ink-muted">{chunk.text}</p>
        ) : (
          <span className="text-[11px] text-ink-subtle">
            Indexed before content was kept
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-ink-muted">
        <span
          className={cn(
            "h-3 w-3 rounded-full border border-dashed",
            chunk.aiRetrieval
              ? "border-emerald-500/60 bg-emerald-500/10"
              : "border-amber-500/70 bg-transparent",
          )}
        />
        <span className={chunk.aiRetrieval ? "text-emerald-600" : "text-ink-muted"}>
          {chunk.retentionState || (chunk.aiRetrieval ? "Ready" : "Limited")}
        </span>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  className,
  children,
  onClick,
}: {
  active: boolean;
  className: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[26px] shrink-0 items-center justify-center rounded-full border px-3 text-[12px] font-medium transition-colors select-none",
        className,
        active
          ? "border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
          : "border-[#e2e3e7] bg-transparent text-[#6b7280] hover:border-[#d6d7dc] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:border-[#25272b] dark:text-[#9fa0a5] dark:hover:border-[#303236] dark:hover:bg-[#232524] dark:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function ColumnLabel({
  active = false,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "w-fit rounded-full py-1 text-left transition-colors",
        active
          ? "-ml-2 bg-surface-2 px-2 font-semibold text-foreground"
          : "px-0 text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}

function KnowledgeNotice({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center px-5 py-12 text-center">
      <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-surface-2 text-ink-muted">
        <Brain size={17} weight="bold" />
      </div>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 text-[12px] text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
