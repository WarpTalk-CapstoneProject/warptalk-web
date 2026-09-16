"use client";

import { useMemo } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

import {
  daysWithMeetings,
  isSameDay,
  shiftWeeks,
  startOfDay,
  weekOf,
} from "@/lib/meeting/meeting-day";
import { cn } from "@/lib/utils";
import type { TranslationRoomDto } from "@/types/translationRoom";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});

function DayChip({
  day,
  isSelected,
  isToday,
  hasMeetings,
  onSelect,
}: {
  day: Date;
  isSelected: boolean;
  isToday: boolean;
  hasMeetings: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={LONG_DATE.format(day)}
      className={cn(
        "flex w-11 shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors",
        isSelected ? "bg-primary/12" : "hover:bg-surface-2",
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        {WEEKDAY.format(day)}
      </span>
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full text-[13px] tabular-nums",
          isSelected
            ? "bg-primary text-primary-foreground font-semibold"
            : isToday
              ? "font-semibold text-primary"
              : "text-ink",
        )}
      >
        {day.getDate()}
      </span>
      {/* A dot rather than a count: the strip answers "is there anything that day", and the
          number is one click away. A count here competes with the date for the same glance. */}
      <span
        aria-hidden
        className={cn(
          "h-1 w-1 rounded-full",
          hasMeetings && !isSelected ? "bg-primary" : "bg-transparent",
        )}
      />
    </button>
  );
}

/**
 * A week of days, the way Google Meet puts one above its agenda.
 *
 * Lives here rather than inside the home panel because the meetings list needs the same strip:
 * it replaced a Scheduled TAB, and a tab and a day strip that disagree about which day has
 * meetings is the drift this repo has already paid for once with the language chip. The two
 * surfaces now render the same component over the same `meeting-day` helpers.
 *
 * Deliberately controlled — it holds no date of its own. The meetings page has to fold the
 * selected day into a filter it already owns, and a strip with private state would be a second
 * answer to "which day am I looking at".
 *
 * Which week is SHOWN and which day is SELECTED are two props, because on the meetings list they
 * come apart: "Clear day" leaves no day selected while the strip stays on the week the user was
 * browsing. With one prop doing both jobs, the page had to keep passing the cleared day just to
 * hold the week in place — and the strip went on drawing it as selected.
 */
export function MeetingDayStrip({
  rooms,
  selectedDate,
  weekAnchor,
  onSelectDate,
  today,
  className,
}: {
  rooms: TranslationRoomDto[];
  /** The day drawn as selected. `null` draws none — a page with no day applied must say so. */
  selectedDate: Date | null;
  /**
   * Any day in the week to show. Omit it and the strip shows the selected day's week — the home
   * panel always has a selected day, so it never passes this — or, with nothing selected, today's.
   */
  weekAnchor?: Date;
  onSelectDate: (day: Date) => void;
  /** Passed in so a page that already fixed "now" at mount does not disagree with this one. */
  today: Date;
  className?: string;
}) {
  const anchor = weekAnchor ?? selectedDate ?? today;
  const week = useMemo(() => weekOf(anchor), [anchor]);
  const marked = useMemo(() => daysWithMeetings(rooms), [rooms]);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => onSelectDate(shiftWeeks(anchor, -1))}
        aria-label="Previous week"
        className="grid size-7 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <CaretLeft size={14} weight="bold" />
      </button>

      {week.map((day) => (
        <DayChip
          key={day.toISOString()}
          day={day}
          isSelected={selectedDate !== null && isSameDay(day, selectedDate)}
          isToday={isSameDay(day, today)}
          hasMeetings={marked.has(startOfDay(day))}
          onSelect={() => onSelectDate(day)}
        />
      ))}

      <button
        type="button"
        onClick={() => onSelectDate(shiftWeeks(anchor, 1))}
        aria-label="Next week"
        className="grid size-7 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <CaretRight size={14} weight="bold" />
      </button>
    </div>
  );
}
