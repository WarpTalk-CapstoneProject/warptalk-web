"use client";

/**
 * What the system has indexed about this workspace.
 *
 * The reference for this screen was Mem0's memory table, but only for *what* it shows — a row
 * per stored piece with the extracted fact readable at a glance. Not for how it looks: Mem0's
 * dark chrome would sit as a foreign object in a light app. So the page is built from the
 * shared admin chrome (AdminPage / AdminPageHeader / AdminFilterTabs / AdminPanel), the same
 * furniture the platform pages settled on, and reads as part of WarpTalk.
 *
 * Owner/Admin only, and the API enforces that independently — this page hiding itself is a
 * courtesy, not the control.
 */

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Brain,
  BookOpen,
  Buildings,
  FileText,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";

import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { useWorkspaceKnowledge } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { FACT_CATEGORIES } from "@/types/workspace-knowledge";
import type {
  KnowledgeSourceType,
  WorkspaceKnowledgeChunkDto,
} from "@/types/workspace-knowledge";

type SourceTab = "all" | KnowledgeSourceType;

/**
 * The "Meetings" tab is meeting SUMMARIES, not raw transcript lines — segments are still
 * indexed and still searchable by WarpBot, they are simply not what a person means by "what
 * does this workspace know".
 *
 * No "Workspace" tab yet: the API accepts `workspace_context`, but nothing writes it. A
 * workspace has a name, a slug, and a settings object of toggles — no prose describing what
 * it is — so the tab would be permanently empty until a workspace description exists to
 * index. An empty tab reads as a broken feature, so it is absent rather than dead.
 */
const SOURCE_TABS = [
  { value: "all", label: "Everything" },
  { value: "document", label: "Documents" },
  { value: "meeting_summary", label: "Meetings" },
  { value: "glossary", label: "Glossary" },
] as const;

/** Cursors for pages already visited, so Back does not have to re-scroll from the start. */
type CursorStack = (string | null)[];

const SOURCE_PRESENTATION: Record<
  string,
  { icon: typeof FileText; fallback: string }
> = {
  document: { icon: FileText, fallback: "Document" },
  meeting_summary: { icon: Sparkle, fallback: "Meeting summary" },
  glossary: { icon: BookOpen, fallback: "Glossary term" },
  workspace_context: { icon: Buildings, fallback: "Workspace context" },
};

function SourceCell({ chunk }: { chunk: WorkspaceKnowledgeChunkDto }) {
  // An unknown source type is rendered as itself rather than hidden or mislabelled: a
  // producer this page has not been taught about is a real row, and showing its raw type is
  // more honest — and more debuggable — than calling it a document.
  const presentation = SOURCE_PRESENTATION[chunk.sourceType] ?? {
    icon: Brain,
    fallback: chunk.sourceType,
  };
  const Icon = presentation.icon;
  const name = chunk.sourceTitle || chunk.documentName || presentation.fallback;

  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
      <div className="min-w-0">
        <div className="truncate text-[12px] text-ink">{name}</div>
        {chunk.sourceType === "document" && chunk.chunkIndex != null ? (
          <div className="text-[10px] tabular-nums text-ink-subtle">
            chunk {chunk.chunkIndex}
          </div>
        ) : null}
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
  const [factCategory, setFactCategory] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<CursorStack>([null]);

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

  // Any filter change invalidates the cursor trail: a token from one filter does not point
  // anywhere meaningful in another's result set.
  function changeFilter(next: () => void) {
    next();
    setCursorStack([null]);
  }

  const items = data?.items ?? [];
  const hasFacts = items.some((chunk) => chunk.fact);

  if (!isOwnerOrAdmin) {
    return (
      <AdminPage>
        <AdminPageHeader
          eyebrow="Workspace knowledge"
          eyebrowIcon={<Brain size={13} weight="bold" />}
          title="Knowledge"
        />
        <p className="mt-6 text-[13px] text-ink-muted">
          Only a workspace Owner or Admin can see what has been indexed.
        </p>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Workspace knowledge"
        eyebrowIcon={<Brain size={13} weight="bold" />}
        title="Knowledge"
        description="The durable knowledge WarpTalk holds for this workspace — uploaded documents, meeting summaries and glossary terms, with the fact drawn from each. Raw transcript lines stay searchable by WarpBot but are not listed here."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <AdminFilterTabs
        tabs={SOURCE_TABS}
        value={sourceTab}
        onChange={(value) => changeFilter(() => setSourceTab(value))}
        label="Filter indexed knowledge by source"
        trailing={items.length ? `${items.length} on this page` : undefined}
      />

      <div className="flex flex-wrap items-center gap-1 py-3">
        <button
          type="button"
          onClick={() => changeFilter(() => setFactCategory(null))}
          className={`h-6 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
            factCategory === null
              ? "bg-surface-2 text-ink"
              : "text-ink-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          All facts
        </button>
        {FACT_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => changeFilter(() => setFactCategory(category))}
            className={`h-6 rounded-md px-2.5 text-[11px] font-medium capitalize transition-colors ${
              factCategory === category
                ? "bg-surface-2 text-ink"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <AdminPanel>
        {isError ? (
          // Distinct from the empty state on purpose. "We could not read the index" and
          // "nothing is indexed" lead an owner to opposite conclusions about their upload.
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-ink">Could not read the index.</p>
            <p className="mt-1 text-[12px] text-ink-muted">
              This is not the same as an empty workspace — the store did not answer.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <div className="px-5 py-12 text-center text-[13px] text-ink-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-ink">Nothing indexed yet.</p>
            <p className="mt-1 text-[12px] text-ink-muted">
              Upload a document or finish a meeting so it gets a summary, and what the system
              keeps will appear here.
            </p>
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

      {items.length > 0 && !hasFacts ? (
        // Say why the column is empty rather than letting an owner conclude extraction is
        // broken. Facts are extracted at index time, so anything stored before the extractor
        // shipped has none, and a workspace that has turned off external AI never will.
        <p className="mt-3 text-[11px] text-ink-subtle">
          No facts on these rows. They were indexed before fact extraction, or this workspace
          has external AI processing turned off — re-upload a document to extract facts for it.
        </p>
      ) : null}

      {(cursorStack.length > 1 || data?.nextCursor) && !isError ? (
        <div className="mt-4 flex items-center justify-end gap-2">
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

      <p className="sr-only">Workspace {workspaceSlug}</p>
    </AdminPage>
  );
}
