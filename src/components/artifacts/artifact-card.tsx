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
  preferredEntry,
  relativeTime,
} from "@/lib/meeting/artifact-library";
import type { ArtifactKind, LibraryEntry, MeetingRecordGroup } from "@/lib/meeting/artifact-library";

/**
 * One MEETING, and what it left behind.
 *
 * WHAT THIS REPLACED
 *   A card per document. A meeting with a transcript and a summary produced two cards, adjacent,
 *   under the same title and the same room code, differing only in an eight-point label — so a
 *   page of 101 meetings was 202 cards and the reader could not tell which three belonged
 *   together. "Bị rời rạc quá, tôi không biết combo transcript, summary, minutes là của meeting
 *   nào khi nhìn vào."
 *
 *   The meeting is the thing being looked for, so the meeting is the card. Its documents are
 *   named on it as marks, and opening it is what shows them.
 *
 * THE PREVIEW IS STILL THE POINT
 *   A grid of titles is a list of filenames with extra whitespace. The card shows the first lines
 *   of the meeting's most readable document, faded where it continues — that is what makes the
 *   library scannable, and the body already arrived with the list.
 *
 * WHEN THERE IS NOTHING TO PREVIEW
 *   The preview is replaced by the SENTENCE, not by an empty frame. A withheld transcript and a
 *   summary still being written look identical from outside, and the difference is the whole of
 *   what the reader needs.
 */

const KIND_ICONS: Record<ArtifactKind, React.ElementType> = {
  transcript: FileText,
  summary: Sparkle,
  minutes: Stamp,
};

/**
 * One accent per kind, used only as a small icon.
 *
 * Not a filled chip: three saturated tiles per card would make the grid louder than the meeting
 * pages it sits beside, and the accent is meant to let the eye sort kinds at a glance, not to
 * rank them.
 */
const KIND_ACCENTS: Record<ArtifactKind, string> = {
  transcript: "text-ink-muted",
  summary: "text-primary",
  minutes: "text-emerald-600 dark:text-emerald-400",
};

export function ArtifactCard({
  group,
  selected,
  onSelect,
}: {
  group: MeetingRecordGroup;
  selected: boolean;
  onSelect: () => void;
}) {
  const lead = preferredEntry(group);
  const excerpt = entryExcerpt(lead);

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
        {/* The meeting names itself first now. The kind used to lead here, which is what made two
            cards for one meeting read as two unrelated things. */}
        <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-ink" title={group.roomTitle}>
          {group.roomTitle}
        </p>
        <p className="mt-1 truncate text-[8px] font-medium uppercase tracking-[0.08em] text-ink-subtle">
          {group.roomCode}
        </p>

        {excerpt ? (
          <p className="mt-2 whitespace-pre-wrap break-words text-[8.5px] leading-[1.5] text-ink-muted">
            {excerpt}
          </p>
        ) : (
          <AbsenceNote entry={lead} />
        )}

        {/* The document continues past the card. A hard edge reads as a document that ends here;
            the fade says there is more, which is the reason to open it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-canvas to-transparent" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3">
        <RecordMarks group={group} />
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-ink-subtle">
          <span className="truncate">{group.hostName || "—"}</span>
          <span className="text-ink-subtle/60">·</span>
          <span className="shrink-0">{relativeTime(group.changedAt ?? group.meetingEndedAt)}</span>
        </span>
      </div>
    </button>
  );
}

/**
 * Which of the three this meeting produced.
 *
 * The card's whole job below the preview. Named rather than counted — "3 records" tells the
 * reader a number when the question is always *which*, and a meeting with a signed minutes is a
 * different thing from one with two auto-generated files.
 *
 * A record nobody here can open is dimmed rather than dropped: knowing a transcript exists and is
 * the host's to share is a different fact from there being no transcript, and it is the fact that
 * tells the reader who to ask.
 */
function RecordMarks({ group }: { group: MeetingRecordGroup }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      {group.entries.map((entry) => {
        const Icon = KIND_ICONS[entry.kind];
        const readable = Boolean(entry.body);
        return (
          <span
            key={entry.id}
            title={readable ? KIND_LABELS[entry.kind] : describeAbsence(entry.absence ?? "unavailable", entry.kind)}
            className={cn(
              "flex min-w-0 items-center gap-1 text-[10px] font-medium",
              readable ? "text-ink" : "text-ink-subtle/70",
            )}
          >
            <Icon
              size={11}
              weight="fill"
              className={cn("shrink-0", readable ? KIND_ACCENTS[entry.kind] : "text-ink-subtle/60")}
            />
            <span className="truncate">{entry.title}</span>
            {readable ? null : <LockOrState entry={entry} />}
          </span>
        );
      })}
    </span>
  );
}

/** Why one of the marks is dimmed, in one glyph. */
function LockOrState({ entry }: { entry: LibraryEntry }) {
  if (entry.absence === "generating") {
    return <SpinnerGap size={9} className="shrink-0 animate-spin" />;
  }
  if (entry.absence === "withheld") return <LockSimple size={9} className="shrink-0" />;
  return <WarningCircle size={9} className="shrink-0" />;
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
