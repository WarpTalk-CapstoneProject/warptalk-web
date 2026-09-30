"use client";

import { useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  FileText,
  ListBullets,
  Sparkle,
  SpinnerGap,
  SquaresFour,
  Stamp,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import {
  WorkspaceBody,
  WorkspaceIconButton,
  WorkspacePage,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import { Button } from "@/components/ui/button";
import { ArtifactCard, ArtifactRow } from "@/components/artifacts/artifact-card";
import { useArtifactLibrary } from "@/hooks/use-artifact-library";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import {
  LIBRARY_KINDS,
  LIBRARY_SCOPES,
  libraryCounts,
  listLibrary,
} from "@/lib/meeting/artifact-library";
import type { ArtifactKind, LibraryScope } from "@/lib/meeting/artifact-library";
import { cn } from "@/lib/utils";

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
 *
 * BY KIND, THEN BY WHOSE (2026-09-30)
 *   Three kind tabs — Transcripts (the default), AI summaries, Minutes; there is no "All records"
 *   — and inside each, All / Yours / Shared with you. One card is one document, and its picture is
 *   the first page of the .docx it downloads as.
 *
 *   The page is PERSONAL for every role: only documents the viewer can open are listed. It used to
 *   list every meeting an Owner/Admin could see and lock most of them — HOST_ONLY is the default,
 *   and the workspace role grants no read — so eleven cards in twelve said "not shared with you".
 *   A document the viewer cannot read has no card, no tab and no count here.
 *
 *   Search is by title: the meeting's name and room code (and a minutes number), never the body.
 */

const KIND_TAB_ICONS: Record<ArtifactKind, React.ElementType> = {
  transcript: FileText,
  summary: Sparkle,
  minutes: Stamp,
};

function parseKind(value: string | null): ArtifactKind {
  return (LIBRARY_KINDS as readonly string[]).includes(value ?? "") ? (value as ArtifactKind) : "transcript";
}

function parseScope(value: string | null): LibraryScope {
  return (LIBRARY_SCOPES as readonly string[]).includes(value ?? "") ? (value as LibraryScope) : "all";
}


export default function ArtifactsPage() {
  const t = useTranslations("artifacts");
  const locale = useLocale();
  const params = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = params?.workspaceSlug ?? "";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const viewerId = useAuthStore((state) => state.user?.id ?? null);

  // Kind, scope and layout live in the URL, so a pasted or reloaded link opens the same view —
  // and the server render and the first client render agree on it.
  const kind = parseKind(searchParams.get("kind"));
  const scope = parseScope(searchParams.get("scope"));
  const view: "grid" | "list" = searchParams.get("view") === "list" ? "list" : "grid";
  const [query, setQuery] = useState("");

  const library = useArtifactLibrary(activeWorkspaceId, { search: query, viewerId });

  /** Defaults are left out of the URL: a plain /artifacts is Transcripts · All · Grid. */
  function setView(next: { kind?: ArtifactKind; scope?: LibraryScope; view?: "grid" | "list" }) {
    const nextParams = new URLSearchParams(searchParams.toString());
    const nextKind = next.kind ?? kind;
    const nextScope = next.scope ?? scope;
    const nextView = next.view ?? view;
    if (nextKind === "transcript") nextParams.delete("kind");
    else nextParams.set("kind", nextKind);
    if (nextScope === "all") nextParams.delete("scope");
    else nextParams.set("scope", nextScope);
    if (nextView === "grid") nextParams.delete("view");
    else nextParams.set("view", nextView);
    const search = nextParams.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  // Counted before the search narrows anything: a tab says how much is behind it.
  const counts = useMemo(
    () => libraryCounts(library.entries, kind, viewerId),
    [kind, library.entries, viewerId],
  );

  const entries = useMemo(
    () => listLibrary(library.entries, { kind, scope, query, viewerId }),
    [kind, library.entries, query, scope, viewerId],
  );

  /**
   * No ambient context from the LIST.
   *
   * The assistant's ambient context must name a real entity — the sibling rule "@mention options
   * always carry a real entity" is the same requirement from the other side. This page has none:
   * reading a record happens at `/artifacts/{roomId}`, and that page registers the meeting it is
   * showing.
   */
  useRegisterAssistantContext(null);

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <div role="tablist" aria-label={t("filterByKindAria")} className="flex items-center gap-1.5">
            {LIBRARY_KINDS.map((value) => {
              const Icon = KIND_TAB_ICONS[value];
              const selected = kind === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setView({ kind: value, scope: "all" })}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                    selected
                      ? "border-ink bg-ink text-surface-1"
                      : "border-border text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon size={13} weight={selected ? "fill" : "regular"} />
                  {t(`filters.${value}`)}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      selected ? "bg-surface-1/20 text-surface-1" : "bg-surface-2 text-ink-subtle",
                    )}
                  >
                    {counts.byKind[value]}
                  </span>
                </button>
              );
            })}
          </div>
        }
        actions={
          <>
            <WorkspaceIconButton
              title={t("view.grid")}
              onClick={() => setView({ view: "grid" })}
              dotted={view === "grid"}
            >
              <SquaresFour size={14} weight={view === "grid" ? "fill" : "regular"} />
            </WorkspaceIconButton>
            <WorkspaceIconButton
              title={t("view.list")}
              onClick={() => setView({ view: "list" })}
              dotted={view === "list"}
            >
              <ListBullets size={14} weight={view === "list" ? "bold" : "regular"} />
            </WorkspaceIconButton>
            <ExpandingSearchDock
              value={query}
              onValueChange={setQuery}
              placeholder={t("search.placeholder")}
              expandedWidth={300}
            />
          </>
        }
      />

      <WorkspaceBody>
        <div
          role="tablist"
          aria-label={t("scopeAria")}
          className="flex flex-wrap items-center gap-x-5 border-b border-border"
        >
          {LIBRARY_SCOPES.map((value) => {
            const selected = scope === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setView({ scope: value })}
                className={cn(
                  "-mb-px border-b-2 py-2 text-[14px] outline-none transition-colors focus-visible:text-ink",
                  selected
                    ? "border-ink font-semibold text-ink"
                    : "border-transparent text-ink-subtle hover:text-ink",
                )}
              >
                {t(`scopes.${value}`)}
                <span className="ml-1 text-[11.5px] font-normal tabular-nums text-ink-subtle">
                  {counts.byScope[value]}
                </span>
              </button>
            );
          })}
          <span className="ml-auto py-2 text-[12px] tabular-nums text-ink-subtle">
            {t(`documentsCount.${kind}`, { count: entries.length })}
          </span>
        </div>

        <section aria-label={t(`filters.${kind}`)} className="pt-4">
          {library.isLoading ? (
            <LoadingState t={t} />
          ) : library.isError ? (
            <ErrorState t={t} onRetry={library.refetch} />
          ) : entries.length === 0 ? (
            <EmptyState t={t} kind={kind} scope={scope} hasQuery={Boolean(query.trim())} />
          ) : view === "grid" ? (
            <div className="grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {entries.map((entry) => (
                <ArtifactCard
                  key={entry.id}
                  entry={entry}
                  workspaceSlug={workspaceSlug}
                  viewerId={viewerId}
                  locale={locale}
                />
              ))}
            </div>
          ) : (
            <div className="pb-4">
              {entries.map((entry) => (
                <ArtifactRow
                  key={entry.id}
                  entry={entry}
                  workspaceSlug={workspaceSlug}
                  viewerId={viewerId}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </section>

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

function EmptyState({
  t,
  kind,
  scope,
  hasQuery,
}: {
  t: ArtifactsT;
  kind: ArtifactKind;
  scope: LibraryScope;
  hasQuery: boolean;
}) {
  if (hasQuery) {
    return (
      <PagePlaceholder
        kind="no-results"
        className="min-h-[360px]"
        title={t("empty.noResultsTitle")}
        description={t("empty.noResultsDescription")}
      />
    );
  }
  return (
    <PagePlaceholder
      kind="documents"
      className="min-h-[360px]"
      title={t(`empty.${scope}.title`)}
      description={t(`empty.${scope}.description.${kind}`)}
    />
  );
}
