"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { useArtifactLibrary } from "@/hooks/use-artifact-library";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { countByKind, groupEntriesByMeeting, narrowLibrary } from "@/lib/meeting/artifact-library";
import type { ArtifactKind } from "@/lib/meeting/artifact-library";

import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

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

const KIND_FILTER_VALUES: KindFilter[] = ["all", "transcript", "summary", "minutes"];

export default function ArtifactsPage() {
  const t = useTranslations("artifacts");
  const locale = useLocale();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params?.workspaceSlug ?? "";
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const viewerId = useAuthStore((state) => state.user?.id ?? null);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
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

  /**
   * No ambient context from the LIST.
   *
   * The assistant's ambient context must name a real entity — the sibling rule "@mention options
   * always carry a real entity" is the same requirement from the other side. This page no longer
   * has one: reading a record happens at `/artifacts/{roomId}`, and that page registers the
   * meeting it is showing. Registering a context here with a count and a filter name would hand
   * WarpBot something it cannot answer questions about.
   */
  useRegisterAssistantContext(null);

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <FilterChipGroup label={t("filterByKindAria")}>
            {KIND_FILTER_VALUES.map((value) => (
              <FilterChip
                key={value}
                selected={kind === value}
                onClick={() => setKind(value)}
                // filter-chip.tsx keeps the count in `badge` and nothing else beside the label:
                // "the label is the filter". A count spliced into the children would be the
                // second place in the app that answers where a number goes.
                badge={value !== "all" && counts[value] ? counts[value] : undefined}
              >
                {t(`filters.${value}`)}
              </FilterChip>
            ))}
          </FilterChipGroup>
        }
        actions={
          <>
            {/* Meetings, because meetings are what the grid lists now. Saying "202 records"
                over 101 cards invited exactly one question — which card is the other 101? */}
            <span className="shrink-0 text-[12px] text-ink-subtle tabular-nums">
              {t("meetingsCount", { count: groups.length })}
            </span>
            {/* Ownership is a second axis, so it gets its own control rather than a fifth chip in
                a group that means "kind". Mixing the two in one row makes "Minutes" and "Mine"
                look mutually exclusive, which they are not. */}
            <WorkspaceIconButton
              title={mineOnly ? t("mineOnly.on") : t("mineOnly.off")}
              onClick={() => setMineOnly((value) => !value)}
              dotted={mineOnly}
              disabled={!viewerId}
            >
              <User size={14} weight={mineOnly ? "fill" : "regular"} />
            </WorkspaceIconButton>
            <ExpandingSearchDock
              value={query}
              onValueChange={setQuery}
              placeholder={t("search.placeholder")}
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
            <LoadingState t={t} />
          ) : library.isError ? (
            <ErrorState t={t} onRetry={library.refetch} />
          ) : entries.length === 0 ? (
            <EmptyState t={t} hasFilters={Boolean(query) || kind !== "all" || mineOnly} />
          ) : (
            /* One column, always. The second used to hold the reader; a record opens at its own
               URL now, so the grid gets the whole width back and the cards stop having two sets
               of proportions depending on whether something is selected. */
            <div className="grid gap-3.5 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {groups.map((group) => (
                <ArtifactCard
                  key={group.roomId}
                  group={group}
                  workspaceSlug={workspaceSlug}
                  locale={locale}
                />
              ))}
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
              ? t("failedSource.minutes")
              : t("failedSource.records")}
          </p>
        ) : null}
      </WorkspaceBody>
    </WorkspacePage>
  );
}

type ArtifactsT = ReturnType<typeof useTranslations>;

function LoadingState({ t }: { t: ArtifactsT }) {
  return (
    <div className="grid min-h-[420px] place-items-center">
      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
        <SpinnerGap size={15} className="animate-spin" />
        {t("loading")}
      </div>
    </div>
  );
}

function ErrorState({ t, onRetry }: { t: ArtifactsT; onRetry: () => void }) {
  return (
    <div className="grid min-h-[420px] place-items-center text-center">
      <div>
        <WarningCircle size={22} className="mx-auto text-ink-muted" />
        <p className="mt-3 text-[12px] font-medium">{t("error.title")}</p>
        <p className="mt-1 text-[11px] text-ink-muted">{t("error.description")}</p>
        <Button variant="outline" size="sm" className="mt-4 h-8" onClick={onRetry}>
          {t("error.retry")}
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ t, hasFilters }: { t: ArtifactsT; hasFilters: boolean }) {
  return (
    <PagePlaceholder
      kind={hasFilters ? "no-results" : "documents"}
      className="min-h-[420px]"
      title={hasFilters ? t("empty.noResultsTitle") : t("empty.emptyTitle")}
      description={hasFilters ? t("empty.noResultsDescription") : t("empty.emptyDescription")}
      action={
        hasFilters ? null : (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
            <FileText size={13} />
            {t("empty.footerNote")}
          </span>
        )
      }
    />
  );
}
