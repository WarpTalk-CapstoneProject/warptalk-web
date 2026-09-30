"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText, Sparkle, SpinnerGap, Stamp } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import { entryScope, relativeTime } from "@/lib/meeting/artifact-library";
import type { ArtifactKind, LibraryEntry } from "@/lib/meeting/artifact-library";
import { UserChip } from "@/components/user/user-chip";
import { DocumentPageThumbnail } from "@/components/artifacts/document-page-thumbnail";
import { recordDetailPath } from "@/lib/workspace/workspace-routes";

/**
 * One DOCUMENT the viewer can read.
 *
 * WHAT THIS REPLACED
 *   A card per meeting, carrying up to three documents as marks, with a text excerpt of whichever
 *   one read best. The page is now split by kind, so a meeting has at most one document under the
 *   tab being read, and the meeting-card's job — telling three documents of one meeting apart —
 *   went with the "All records" tab.
 *
 * THE THUMBNAIL IS THE FILE
 *   The picture is the first page of the .docx this document downloads as (see
 *   DocumentPageThumbnail). Below it the card says what a gallery card says: the name, and one line
 *   of who and when.
 *
 * NO LOCKED CARDS
 *   The grid only receives documents the viewer can open (`listLibrary`), so there is no withheld
 *   state to draw here.
 */

const KIND_ICONS: Record<ArtifactKind, React.ElementType> = {
  transcript: FileText,
  summary: Sparkle,
  minutes: Stamp,
};

/** The small tile that names the kind over the page's bottom-left corner. */
const KIND_TILES: Record<ArtifactKind, string> = {
  transcript: "bg-slate-500 text-white dark:bg-slate-400 dark:text-slate-950",
  summary: "bg-primary text-primary-foreground",
  minutes: "bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950",
};

type ArtifactsT = ReturnType<typeof useTranslations>;

function documentHref(workspaceSlug: string, entry: LibraryEntry): string {
  return `${recordDetailPath(workspaceSlug, entry.roomId)}?kind=${entry.kind}`;
}

function edited(entry: LibraryEntry, t: ArtifactsT, locale?: string): string {
  return relativeTime(
    entry.changedAt ?? entry.meetingEndedAt,
    undefined,
    (key, values) => t(`relativeTime.${key}`, values),
    locale,
  );
}

function KindTile({ kind, className }: { kind: ArtifactKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-md shadow-sm", KIND_TILES[kind], className)}>
      <Icon size={14} weight="fill" />
    </span>
  );
}

/** The minutes' paper state, or a summary still being written. Nothing for a finished document. */
function StatePill({ entry, t }: { entry: LibraryEntry; t: ArtifactsT }) {
  if (entry.absence === "generating") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 px-1.5 text-[10.5px] text-primary">
        <SpinnerGap size={10} className="animate-spin" />
        {t("state.writing")}
      </span>
    );
  }
  if (entry.kind !== "minutes") return null;
  const approved = entry.statusLabel === "Approved" || entry.statusLabel === "Signed";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 text-[10.5px]",
        approved
          ? "border-emerald-600/35 text-emerald-700 dark:text-emerald-400"
          : "border-amber-600/35 text-amber-700 dark:text-amber-400",
      )}
    >
      {entry.statusLabel}
    </span>
  );
}

/** "You", or the host as the shared chip — a name printed as text would be a dead end. */
function Host({ entry, viewerId, t }: { entry: LibraryEntry; viewerId?: string | null; t: ArtifactsT }) {
  if (entryScope(entry, viewerId) === "mine") {
    return <span className="shrink-0">{t("host.you")}</span>;
  }
  return (
    // The card is a <Link>; the chip renders a span and swallows its own click, so opening the
    // host's card does not also open the document.
    <UserChip
      user={{ userId: entry.hostId, name: entry.hostName, role: "Host" }}
      variant="text"
      size="sm"
      showAvatar={false}
      className="min-w-0 truncate text-[12.5px] text-ink-subtle"
    />
  );
}

export function ArtifactCard({
  entry,
  workspaceSlug,
  viewerId,
  locale,
}: {
  entry: LibraryEntry;
  workspaceSlug: string;
  viewerId?: string | null;
  locale?: string;
}) {
  const t = useTranslations("artifacts");
  return (
    /* A link, not a button: middle-click into a tab, copy the address, see it on hover. */
    <Link
      href={documentHref(workspaceSlug, entry)}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface-1 text-left outline-none transition-colors",
        "hover:border-ink-subtle/40 focus-visible:ring-2 focus-visible:ring-ring/40",
      )}
    >
      <div className="relative h-[190px] shrink-0 overflow-hidden border-b border-border bg-surface-2 px-3.5 pt-3.5">
        <DocumentPageThumbnail entry={entry} />
        {/* The page continues past the card; the fade says so. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface-2 from-10% to-transparent" />
        <KindTile kind={entry.kind} className="absolute bottom-2.5 left-3.5 size-7" />
      </div>

      <div className="flex min-w-0 flex-col gap-1 px-3.5 pb-3.5 pt-3">
        <p className="truncate text-[15px] font-semibold leading-snug text-ink" title={entry.roomTitle}>
          {entry.roomTitle}
        </p>
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-subtle">
          <Host entry={entry} viewerId={viewerId} t={t} />
          <span aria-hidden="true" className="text-ink-subtle/60">
            ·
          </span>
          <span className="shrink-0">{t("edited", { when: edited(entry, t, locale) })}</span>
          <StatePill entry={entry} t={t} />
        </span>
      </div>
    </Link>
  );
}

/** The same document as one row, for scanning by name when the preview is not needed. */
export function ArtifactRow({
  entry,
  workspaceSlug,
  viewerId,
  locale,
}: {
  entry: LibraryEntry;
  workspaceSlug: string;
  viewerId?: string | null;
  locale?: string;
}) {
  const t = useTranslations("artifacts");
  return (
    <Link
      href={documentHref(workspaceSlug, entry)}
      className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-1.5 py-2.5 outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:grid-cols-[24px_minmax(0,1fr)_minmax(0,160px)_110px]"
    >
      <KindTile kind={entry.kind} className="size-6" />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-ink">{entry.roomTitle}</span>
        <span className="block truncate font-mono text-[11px] text-ink-subtle">
          {entry.kind === "minutes" ? `${entry.title} · ${entry.roomCode}` : entry.roomCode}
        </span>
      </span>
      <span className="hidden min-w-0 truncate text-[12.5px] text-ink-subtle sm:block">
        <Host entry={entry} viewerId={viewerId} t={t} />
      </span>
      <span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[12.5px] text-ink-subtle">
        <StatePill entry={entry} t={t} />
        {edited(entry, t, locale)}
      </span>
    </Link>
  );
}
