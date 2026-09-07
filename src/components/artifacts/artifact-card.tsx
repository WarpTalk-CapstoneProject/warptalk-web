"use client";

import {
  FileText,
  LockSimple,
  Sparkle,
  SpinnerGap,
  Stamp,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import {
  KIND_LABELS,
  describeAbsence,
  entryExcerpt,
  relativeTime,
} from "@/lib/meeting/artifact-library";
import type { ArtifactKind, LibraryEntry } from "@/lib/meeting/artifact-library";

/**
 * One written record, as a card you can recognise across a room.
 *
 * THE PREVIEW IS THE POINT
 *   A grid of cards all reading "Transcript · Sprint review" is a list of filenames with extra
 *   whitespace — the reader still has to open each one to find out which is the one they want.
 *   So the card shows the DOCUMENT: its first lines, set as the document sets them, faded out at
 *   the bottom where it continues. That is what makes a library scannable rather than merely
 *   browsable, and every body needed to draw it is already in the payload the list arrived in.
 *
 * WHEN THERE IS NOTHING TO PREVIEW
 *   The preview is replaced by the SENTENCE, not by an empty frame. A withheld transcript and a
 *   summary that is still being written look identical from outside — both are cards with no
 *   text — and the difference is the whole of what the reader needs to know.
 */

const KIND_ICONS: Record<ArtifactKind, React.ElementType> = {
  transcript: FileText,
  summary: Sparkle,
  minutes: Stamp,
};

/**
 * One accent per kind, used only as a hairline and a dot.
 *
 * Not a filled card: three saturated tiles per row would make the grid louder than the meeting
 * pages it sits beside, and the accent is meant to let the eye sort kinds at a glance, not to
 * rank them.
 */
const KIND_ACCENTS: Record<ArtifactKind, string> = {
  transcript: "text-ink-muted",
  summary: "text-primary",
  minutes: "text-emerald-600 dark:text-emerald-400",
};

export function ArtifactCard({
  entry,
  selected,
  onSelect,
}: {
  entry: LibraryEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = KIND_ICONS[entry.kind];
  const excerpt = entryExcerpt(entry);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface-1 text-left outline-none transition-colors",
        "hover:border-border hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-ring/40",
        selected && "border-ink bg-surface-2/60",
      )}
    >
      {/* The thumbnail: the document, in miniature. `select-none` because this is a picture of
          text, not text somebody should be dragging out of a card. */}
      <div className="relative h-[168px] shrink-0 select-none overflow-hidden border-b border-border bg-canvas px-3.5 pt-3.5">
        <div className="flex items-center gap-1.5 text-[8px] font-medium uppercase tracking-[0.08em] text-ink-subtle">
          <Icon size={10} weight="fill" className={KIND_ACCENTS[entry.kind]} />
          {KIND_LABELS[entry.kind]}
          <span className="text-ink-subtle/60">·</span>
          <span className="truncate">{entry.roomCode}</span>
        </div>

        <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-4 text-ink">
          {entry.roomTitle}
        </p>

        {excerpt ? (
          <p className="mt-2 whitespace-pre-wrap break-words text-[8.5px] leading-[1.5] text-ink-muted">
            {excerpt}
          </p>
        ) : (
          <AbsenceNote entry={entry} />
        )}

        {/* The document continues past the card. A hard edge reads as a document that ends
            here; the fade says there is more, which is the reason to open it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-canvas to-transparent" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-3">
        <span className="truncate text-[12px] font-semibold text-ink">{entry.title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-ink-subtle">
          <StateMark entry={entry} />
          <span className="truncate">{entry.statusLabel}</span>
          <span className="text-ink-subtle/60">·</span>
          <span className="shrink-0">{relativeTime(entry.changedAt)}</span>
        </span>
      </div>
    </button>
  );
}

/**
 * What the thumbnail says instead of a preview.
 *
 * Set in the same place and the same size as the text it replaces, so a card with nothing to show
 * still has the shape of a card — a grid where the empty ones collapse to half height reads as a
 * rendering fault.
 */
function AbsenceNote({ entry }: { entry: LibraryEntry }) {
  if (!entry.absence) return null;

  return (
    <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-[1.6] text-ink-subtle">
      {entry.absence === "generating" ? (
        <SpinnerGap size={10} className="mt-px shrink-0 animate-spin" />
      ) : entry.absence === "withheld" ? (
        <LockSimple size={10} className="mt-px shrink-0" />
      ) : (
        <WarningCircle size={10} className="mt-px shrink-0" />
      )}
      <span>{describeAbsence(entry.absence, entry.kind)}</span>
    </p>
  );
}

/**
 * The dot beside the status word.
 *
 * A lock outranks everything else it could say. "Ready" beside a document this person cannot open
 * is true about the file and false about their experience of it, and that mismatch is what makes
 * a permission boundary read as a broken feature.
 */
function StateMark({ entry }: { entry: LibraryEntry }) {
  if (entry.absence === "withheld") return <LockSimple size={11} className="shrink-0" />;
  if (entry.absence === "generating") return <SpinnerGap size={11} className="shrink-0 animate-spin" />;
  if (entry.absence === "unavailable") return <WarningCircle size={11} className="shrink-0" />;

  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        entry.kind === "minutes" && entry.statusLabel === "Approved"
          ? "bg-emerald-500"
          : entry.kind === "minutes" && entry.statusLabel === "Draft"
            ? "bg-ink-subtle/50"
            : "bg-primary",
      )}
    />
  );
}
