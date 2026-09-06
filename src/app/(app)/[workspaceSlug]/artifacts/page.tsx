"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, SpinnerGap, User, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import {
  WorkspaceBody,
  WorkspaceIconButton,
  WorkspacePage,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import { Button } from "@/components/ui/button";
import { ArtifactCard } from "@/components/artifacts/artifact-card";
import { ArtifactReader } from "@/components/artifacts/artifact-reader";
import { useArtifactLibrary } from "@/hooks/use-artifact-library";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { countByKind, narrowLibrary } from "@/lib/meeting/artifact-library";
import type { ArtifactKind } from "@/lib/meeting/artifact-library";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";

/**
 * Artifacts — everything WarpTalk wrote down, in one place.
 *
 * WHY THIS PAGE EXISTS
 *   A transcript, an AI summary and a biên bản were each reachable only through the meeting that
 *   produced them. That is the right shape for "what happened in Tuesday's standup?" and the
 *   wrong one for every question a record is kept to answer — what did we decide about the
 *   budget, which meetings have a signed minutes, what is on file for this quarter. Those are
 *   questions about the DOCUMENTS, and answering them meant opening meetings one at a time.
 *
 *   The sidebar used to say so: "No Transcripts entry: a meeting's transcript, summary and files
 *   live on that meeting's own page." That decision is not reversed here — a meeting's record
 *   still lives on the meeting, and this page links to it. What is added is the index, which the
 *   filing cabinet never had.
 *
 * WHY IT IS NOT /documents
 *   Documents are files people uploaded. Artifacts are what WarpTalk produced FROM a meeting.
 *   The two carry different authority — one has an owner who chose to share it, the other has a
 *   room policy, a consent state and a signature — and merging them would mean one page whose
 *   every control had to ask which kind it was looking at.
 *
 * WHAT IS DELIBERATELY ABSENT
 *   Recordings, debug logs and audio samples. A video is not read, searched or cited; the other
 *   two are engineering output stored beside the record. They stay on the meeting page, which is
 *   where somebody hunting a FILE goes.
 */

type KindFilter = ArtifactKind | "all";

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All records" },
  { value: "transcript", label: "Transcripts" },
  { value: "summary", label: "AI summaries" },
  { value: "minutes", label: "Minutes" },
];

export default function ArtifactsPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params?.workspaceSlug ?? "";
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const viewerId = useAuthStore((state) => state.user?.id ?? null);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const library = useArtifactLibrary(activeWorkspaceId, { search: query });

  const entries = useMemo(
    () =>
      narrowLibrary(library.entries, {
        kind: kind === "all" ? null : kind,
        hostedBy: mineOnly ? viewerId : null,
        query,
      }),
    [kind, library.entries, mineOnly, query, viewerId],
  );

  // Counts come from the UNNARROWED list, so a chip reads "how much is behind this" rather than
  // "how much survived the filter I am already looking through".
  const counts = useMemo(() => countByKind(library.entries), [library.entries]);

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  useRegisterAssistantContext(
    selected
      ? {
          pageType: "history",
          entityId: selected.roomId,
          workspaceId: activeWorkspaceId ?? "",
          snapshot: {
            title: selected.roomTitle,
            record: selected.title,
            status: selected.statusLabel,
          },
        }
      : null,
  );

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <FilterChipGroup label="Filter records by kind">
            {KIND_FILTERS.map((item) => (
              <FilterChip
                key={item.value}
                selected={kind === item.value}
                onClick={() => setKind(item.value)}
                // filter-chip.tsx keeps the count in `badge` and nothing else beside the label:
                // "the label is the filter". A count spliced into the children would be the
                // second place in the app that answers where a number goes.
                badge={item.value !== "all" && counts[item.value] ? counts[item.value] : undefined}
              >
                {item.label}
              </FilterChip>
            ))}
          </FilterChipGroup>
        }
        actions={
          <>
            <span className="shrink-0 text-[12px] text-ink-subtle tabular-nums">
              {entries.length} {entries.length === 1 ? "record" : "records"}
            </span>
            {/* Ownership is a second axis, so it gets its own control rather than a fifth chip in
                a group that means "kind". Mixing the two in one row makes "Minutes" and "Mine"
                look mutually exclusive, which they are not. */}
            <WorkspaceIconButton
              title={mineOnly ? "Showing meetings you hosted" : "Only meetings you hosted"}
              onClick={() => setMineOnly((value) => !value)}
              dotted={mineOnly}
              disabled={!viewerId}
            >
              <User size={14} weight={mineOnly ? "fill" : "regular"} />
            </WorkspaceIconButton>
            <ExpandingSearchDock
              value={query}
              onValueChange={setQuery}
              placeholder="Search records, meetings, or what was said"
              expandedWidth={340}
            />
          </>
        }
      />

      <WorkspaceBody>
        <section
          className="overflow-hidden rounded-lg border border-border bg-surface-1"
          aria-label="Meeting records"
        >
          {library.isLoading ? (
            <LoadingState />
          ) : library.isError ? (
            <ErrorState onRetry={library.refetch} />
          ) : entries.length === 0 ? (
            <EmptyState hasFilters={Boolean(query) || kind !== "all" || mineOnly} />
          ) : (
            <div
              className={cn(
                "grid min-h-[560px]",
                selected && "lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_540px]",
              )}
            >
              <div className="min-w-0 overflow-y-auto p-4">
                {/* One column narrower than a plain gallery once the reader is open, so the cards
                    keep their proportions instead of squashing into letterboxes. */}
                <div
                  className={cn(
                    "grid gap-3.5 sm:grid-cols-2",
                    selected ? "xl:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4",
                  )}
                >
                  {entries.map((entry) => (
                    <ArtifactCard
                      key={entry.id}
                      entry={entry}
                      selected={selected?.id === entry.id}
                      onSelect={() =>
                        setSelectedId((current) => (current === entry.id ? null : entry.id))
                      }
                    />
                  ))}
                </div>
              </div>

              {selected ? (
                <ArtifactReader
                  entry={selected}
                  workspaceSlug={workspaceSlug}
                  onClose={() => setSelectedId(null)}
                />
              ) : null}
            </div>
          )}
        </section>

        {/* Said once, at the bottom, rather than on every card that has no body. The reason a
            record cannot be read is a property of the meeting's sharing policy, and repeating it
            forty times would drown the forty documents that CAN be read. */}
        {!library.isLoading && !library.isError && library.failedSource ? (
          <p className="mt-3 flex items-center gap-2 text-[11px] text-ink-subtle">
            <WarningCircle size={13} className="shrink-0" />
            {library.failedSource === "minutes"
              ? "Minutes could not be loaded, so this list may be missing some records."
              : "Meeting records could not be loaded, so this list may be missing transcripts and summaries."}
          </p>
        ) : null}
      </WorkspaceBody>
    </WorkspacePage>
  );
}

function LoadingState() {
  return (
    <div className="grid min-h-[420px] place-items-center">
      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
        <SpinnerGap size={15} className="animate-spin" />
        Loading meeting records
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-[420px] place-items-center text-center">
      <div>
        <WarningCircle size={22} className="mx-auto text-ink-muted" />
        <p className="mt-3 text-[12px] font-medium">Records could not be loaded</p>
        <p className="mt-1 text-[11px] text-ink-muted">
          Check the translation-room service and try again.
        </p>
        <Button variant="outline" size="sm" className="mt-4 h-8" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <PagePlaceholder
      kind={hasFilters ? "no-results" : "documents"}
      className="min-h-[420px]"
      title={hasFilters ? "No records match this search" : "No meeting records yet"}
      description={
        hasFilters
          ? "Try a different word, or widen the filter to all records."
          : "A transcript and an AI summary are written when a meeting ends. Minutes are drawn up from the meeting's own page."
      }
      action={
        hasFilters ? null : (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <FileText size={13} />
            Everything WarpTalk writes down will appear here.
          </span>
        )
      }
    />
  );
}
