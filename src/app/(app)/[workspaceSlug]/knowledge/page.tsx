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
import { Brain, FileText, Microphone } from "@phosphor-icons/react/dist/ssr";

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
import type { WorkspaceKnowledgeChunkDto } from "@/types/workspace-knowledge";

type SourceTab = "all" | "document" | "transcript";

const SOURCE_TABS = [
  { value: "all", label: "Everything" },
  { value: "document", label: "Documents" },
  { value: "transcript", label: "Meetings" },
] as const;

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
  if (chunk.sourceType === "transcript") {
    const offset = formatOffset(chunk.startMs);
    return (
      <div className="flex items-start gap-2 min-w-0">
        <Microphone size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
        <div className="min-w-0">
          <div className="truncate text-[12px] text-ink">
            {chunk.speakerName || "Meeting transcript"}
          </div>
          {offset ? (
            <div className="text-[10px] tabular-nums text-ink-subtle">at {offset}</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 min-w-0">
      <FileText size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
      <div className="min-w-0">
        <div className="truncate text-[12px] text-ink">
          {chunk.documentName || "Document"}
        </div>
        {chunk.chunkIndex != null ? (
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
        description="Everything WarpTalk has indexed from this workspace's documents and meetings — the text that was embedded, and the fact drawn from it."
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
              Upload a document or hold a meeting with transcription on, and what the system
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
        // broken. Everything indexed before the fact extractor shipped has none.
        <p className="mt-3 text-[11px] text-ink-subtle">
          These rows were indexed before facts were extracted. Re-upload a document to see
          facts for it.
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
