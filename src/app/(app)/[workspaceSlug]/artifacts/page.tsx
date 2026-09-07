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
import { useArtifactLibrary, useDrawUpMinutes } from "@/hooks/use-artifact-library";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import {
  countByKind,
  groupEntriesByMeeting,
  narrowLibrary,
  preferredEntry,
} from "@/lib/meeting/artifact-library";
import type { ArtifactKind } from "@/lib/meeting/artifact-library";
import { toast } from "sonner";

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
  /**
   * The MEETING being read, and which of its records.
   *
   * Two fields rather than one artifact id, because they change independently: switching tabs
   * inside a meeting must not close it, and opening another meeting must not carry the previous
   * one's tab onto a meeting that has no record of that kind.
   */
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<ArtifactKind | null>(null);

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

  // Grouped AFTER narrowing, so "Transcripts" means "meetings that have one" and a body search
  // surfaces the meeting whose body matched.
  const groups = useMemo(() => groupEntriesByMeeting(entries), [entries]);

  const selectedGroup = groups.find((group) => group.roomId === selectedRoomId) ?? null;
  /**
   * Falls back to `preferredEntry` whenever the chosen kind is not in this meeting.
   *
   * Not only for the first open: narrowing to Minutes while reading a transcript would otherwise
   * leave the panel pointing at a record the group no longer holds, and it would render nothing
   * while the card beside it stayed selected.
   */
  const selected = selectedGroup
    ? selectedGroup.entries.find((entry) => entry.kind === selectedKind) ??
      preferredEntry(selectedGroup)
    : null;

  const drawUpMinutes = useDrawUpMinutes(activeWorkspaceId);

  /**
   * Whether the record being read is a summary this viewer could turn into a biên bản.
   *
   * All three conditions are answered from the UNNARROWED library, because "does this meeting
   * already have minutes?" must not change with the filter chips — a Summary-only view would
   * otherwise offer to draw up minutes that exist and are simply hidden.
   *
   * The last condition is the one worth keeping. A summary with no body is a meeting nobody spoke
   * in, and drawing minutes from it consumes a number from the workspace's yearly sequence to
   * produce an attendance list with nothing under it. The server refuses that too; this is so the
   * product does not offer it and then explain itself afterwards.
   */
  const canDrawUpMinutes =
    selected?.kind === "summary" &&
    Boolean(selected.body) &&
    selected.hostId === viewerId &&
    !library.entries.some(
      (entry) => entry.kind === "minutes" && entry.roomId === selected.roomId,
    );

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
            {/* Meetings, because meetings are what the grid lists now. Saying "202 records"
                over 101 cards invited exactly one question — which card is the other 101? */}
            <span className="shrink-0 text-[12px] text-ink-subtle tabular-nums">
              {groups.length} {groups.length === 1 ? "meeting" : "meetings"}
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
        {/* No frame around the grid. The cards are already bordered surfaces, so the section's
            own border, radius and background were a second box drawn around boxes — and its
            `overflow-hidden` was clipping the reader's own scroll region to it. The landmark and
            its label stay; only the decoration went. */}
        <section aria-label="Meeting records">
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
              <div className="min-w-0 overflow-y-auto pb-4 pr-4">
                {/* One column narrower than a plain gallery once the reader is open, so the cards
                    keep their proportions instead of squashing into letterboxes. */}
                <div
                  className={cn(
                    "grid gap-3.5 sm:grid-cols-2",
                    selected ? "xl:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4",
                  )}
                >
                  {groups.map((group) => (
                    <ArtifactCard
                      key={group.roomId}
                      group={group}
                      selected={selectedGroup?.roomId === group.roomId}
                      onSelect={() =>
                        setSelectedRoomId((current) => {
                          // Re-opening a meeting starts from its most readable record rather than
                          // from whichever tab the last meeting was left on.
                          setSelectedKind(null);
                          return current === group.roomId ? null : group.roomId;
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              {selectedGroup && selected ? (
                <ArtifactReader
                  group={selectedGroup}
                  entry={selected}
                  onSelectKind={setSelectedKind}
                  workspaceSlug={workspaceSlug}
                  onClose={() => {
                    setSelectedRoomId(null);
                    setSelectedKind(null);
                  }}
                  onDrawUpMinutes={
                    canDrawUpMinutes
                      ? () =>
                          drawUpMinutes.mutate(selected.roomId, {
                            onSuccess: (minutes) =>
                              toast.success(`Minutes ${minutes.minutesNo} drawn up.`),
                            onError: () =>
                              toast.error("Could not draw up the minutes for this meeting."),
                          })
                      : undefined
                  }
                  drawingUpMinutes={drawUpMinutes.isPending}
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
