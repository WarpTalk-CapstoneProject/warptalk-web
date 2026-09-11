"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { enGB } from "date-fns/locale";
import { CaretDown, CaretLeft, CaretRight, CaretUp } from "@phosphor-icons/react/dist/ssr";

import { Calendar } from "@/components/ui/calendar";
import {
  AGENDA_CALENDAR_LOCALE,
  countMeetingsByDay,
  dayButtonLabel,
  isInMonth,
  shiftMonths,
  stripAnchor,
  weekStepTarget,
} from "@/lib/meeting/agenda-navigator";
import { isSameDay, startOfDay, weekOf } from "@/lib/meeting/meeting-day";
import { cn } from "@/lib/utils";

/**
 * The mini-calendar navigator for the Agenda view: a month sidebar on desktop, a one-week strip
 * that expands to the month on narrow screens.
 *
 * Deliberately controlled, like `MeetingDayStrip` — it holds no date of its own beyond whether the
 * narrow strip is expanded. The page owns `monthAnchor` (shared with the Month and Week views) and
 * knows which day is at the top of the list; a navigator with private date state would be a second
 * answer to "where am I", and the two would disagree the first time the user scrolled.
 *
 * Picking a day never changes the fetched range by itself. It scrolls the list (`onPickDay`); only
 * a day outside `month` — an outside day in the grid, or a week step past the edge — also asks for
 * a month change first (`onMonthChange`), because the list cannot scroll to a day it does not hold.
 *
 * Two exports rather than one wrapper, because the halves live in different boxes: the strip sits
 * ABOVE the list (a row of the page's column), the sidebar BESIDE it (a child of the flex row the
 * Week sidebar lives in). A single component rendering both would put one of them in the wrong
 * flex direction at every width.
 */
export type AgendaNavigatorProps = {
  /** Any date in the month the agenda is showing — the page's `monthAnchor`. */
  month: Date;
  /**
   * One Date per fetched meeting, UNFILTERED, duplicates and all (the page's `daysWithMeetings`).
   * Unfiltered because the navigator is how you find a day that holds something; a dot that
   * vanished when the Joined chip was on would hide the day you were looking for. Duplicates are
   * kept because the day buttons announce how many meetings a day holds, not just whether.
   */
  daysWithMeetings: Date[];
  /** The day at the top of the agenda list right now, or null before the list has reported one. */
  visibleDay: Date | null;
  /**
   * The page's own "now" (`useNowMinute`), null until after hydration. Passed in rather than read
   * here so the strip's today and the list's today cannot straddle a midnight differently — the
   * same reason `MeetingDayStrip` takes `today`.
   */
  today: Date | null;
  /** Scroll the list to this day. May be outside `month`; `onMonthChange` has then already fired. */
  onPickDay: (day: Date) => void;
  /** Move the shared month anchor. Receives the 1st for month steps, the picked day otherwise. */
  onMonthChange: (month: Date) => void;
};

/**
 * The same dot the Week view's sidebar draws today, character for character: the two sidebars sit
 * in the same place on the same page, and a dot that moved a pixel between views would read as a
 * different mark.
 */
const HAS_MEETING_DOT =
  "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary";

/**
 * Where the list is, as a ring rather than a fill.
 *
 * A fill would fight today's `bg-muted` for the same cell whenever the list sits on today, and
 * which one won would come down to stylesheet order. It would also read as a selection, which this
 * is not — it moves as you scroll. So it takes the one channel nothing else on the grid uses, and
 * today keeps its own styling underneath.
 */
const VISIBLE_DAY_RING = "rounded-(--cell-radius) ring-1 ring-inset ring-primary/50";

const MONTH_LABEL = new Intl.DateTimeFormat(AGENDA_CALENDAR_LOCALE, {
  month: "long",
  year: "numeric",
});
const WEEKDAY = new Intl.DateTimeFormat(AGENDA_CALENDAR_LOCALE, { weekday: "short" });

const CARET_BUTTON =
  "grid size-6 cursor-pointer place-items-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink";

/**
 * The one rule for "the user picked a day", shared by both layouts.
 *
 * The month change goes first so the page is already fetching the right month when the scroll
 * request arrives; the other order would ask the list to scroll to a day it has not got.
 */
function pickDayHandler(
  month: Date,
  onPickDay: (day: Date) => void,
  onMonthChange: (month: Date) => void,
) {
  return (day: Date) => {
    if (!isInMonth(day, month)) onMonthChange(day);
    onPickDay(day);
  };
}

/** Caret, label, caret — the Week sidebar's header row, reused for months and for weeks. */
function Stepper({
  label,
  unit,
  onStep,
  className,
}: {
  label: string;
  unit: "month" | "week";
  onStep: (delta: -1 | 1) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        aria-label={`Previous ${unit}`}
        onClick={() => onStep(-1)}
        className={CARET_BUTTON}
      >
        <CaretLeft size={13} />
      </button>
      {/* Announced, because the caret buttons change it without moving focus: a screen reader user
          pressing "Next month" would otherwise hear nothing at all. */}
      <span aria-live="polite" className="min-w-0 truncate text-[12px] font-medium">
        {label}
      </span>
      <button
        type="button"
        aria-label={`Next ${unit}`}
        onClick={() => onStep(1)}
        className={CARET_BUTTON}
      >
        <CaretRight size={13} />
      </button>
    </div>
  );
}

/**
 * The month grid both layouts share — the sidebar always, the narrow strip when expanded.
 *
 * No `mode`: the day buttons come from `onDayClick` instead. With `mode="single"` DayPicker keeps
 * its own selected day and paints it solid primary, which on an agenda would stay stuck on
 * whatever you clicked last while the list — and the ring — moved on as you scrolled.
 */
function AgendaMonthCalendar({
  month,
  daysWithMeetings,
  counts,
  visibleDay,
  today,
  onPick,
  onMonthChange,
}: {
  month: Date;
  daysWithMeetings: Date[];
  counts: Map<number, number>;
  visibleDay: Date | null;
  today: Date | null;
  onPick: (day: Date) => void;
  onMonthChange: (month: Date) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-1 p-1">
      <Calendar
        month={month}
        locale={enGB}
        weekStartsOn={1}
        // Undefined before hydration, which leaves DayPicker on its own clock — exactly what the
        // Week sidebar does today, so the two do not differ in the one frame they could.
        today={today ?? undefined}
        onMonthChange={onMonthChange}
        onDayClick={(date) => onPick(date)}
        className="w-full p-0.5 [--cell-size:1.8rem]"
        classNames={{
          month_caption: "hidden",
          nav: "hidden",
        }}
        labels={{
          labelDayButton: (date, modifiers) =>
            dayButtonLabel(date, counts.get(startOfDay(date)) ?? 0, { isToday: modifiers.today }),
        }}
        modifiers={{
          hasMeeting: daysWithMeetings,
          ...(visibleDay ? { visibleDay } : {}),
        }}
        modifiersClassNames={{
          hasMeeting: HAS_MEETING_DOT,
          visibleDay: VISIBLE_DAY_RING,
        }}
      />
    </div>
  );
}

/**
 * Desktop (≥ lg): the left sidebar, the same box and size as the Week view's.
 *
 * No summary line and no status legend — both were tried and rejected: the counts already live in
 * the header's All / Upcoming / Joined chips, and saying them twice is how two numbers end up
 * disagreeing. `children` renders under the calendar for the notices the page already owns (a
 * partial fetch, a truncated month), so they stay where the Week view puts them.
 */
export function AgendaSidebarCalendar({
  month,
  daysWithMeetings,
  visibleDay,
  today,
  onPickDay,
  onMonthChange,
  className,
  children,
}: AgendaNavigatorProps & { className?: string; children?: ReactNode }) {
  const counts = useMemo(() => countMeetingsByDay(daysWithMeetings), [daysWithMeetings]);
  const pick = pickDayHandler(month, onPickDay, onMonthChange);

  return (
    <aside
      aria-label="Agenda navigator"
      className={cn(
        "hidden w-[290px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-surface-1 px-3 py-5 lg:flex",
        className,
      )}
    >
      <div>
        <Stepper
          label={MONTH_LABEL.format(month)}
          unit="month"
          onStep={(delta) => onMonthChange(shiftMonths(month, delta))}
          className="mb-2 justify-between px-1"
        />

        <AgendaMonthCalendar
          month={month}
          daysWithMeetings={daysWithMeetings}
          counts={counts}
          visibleDay={visibleDay}
          today={today}
          onPick={pick}
          onMonthChange={onMonthChange}
        />
      </div>

      {children}
    </aside>
  );
}

function WeekDayChip({
  day,
  count,
  isToday,
  isVisible,
  isOutsideMonth,
  onPick,
}: {
  day: Date;
  count: number;
  isToday: boolean;
  isVisible: boolean;
  isOutsideMonth: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={dayButtonLabel(day, count, { isToday })}
      aria-current={isVisible ? "true" : undefined}
      className={cn(
        "flex min-w-0 cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors",
        isVisible ? "bg-primary/12" : "hover:bg-surface-2",
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        {WEEKDAY.format(day)}
      </span>
      {/* Today in MeetingDayStrip's today colour, NOT its filled selection circle: nothing is
          selected here, and a filled circle on the visible day would outshout today itself. */}
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full text-[13px] tabular-nums",
          isToday
            ? "font-semibold text-primary"
            : isOutsideMonth
              ? "text-ink-subtle"
              : "text-ink",
        )}
      >
        {day.getDate()}
      </span>
      {/* A dot, not a count — see MeetingDayStrip. The count is in the accessible name instead. */}
      <span
        aria-hidden
        className={cn("h-1 w-1 rounded-full", count > 0 ? "bg-primary" : "bg-transparent")}
      />
    </button>
  );
}

/**
 * Narrow (< lg): one week at the top, expandable to the month — the Outlook-mobile / iOS pattern.
 *
 * Not `MeetingDayStrip`, although it looks like one on purpose. That component's API does not fit
 * and it cannot be widened from here: it takes `TranslationRoomDto` rooms (the agenda holds
 * `MyMeetingItem`s keyed on `occursAt`), it steps to the SAME WEEKDAY a week away where the agenda
 * wants the Monday, its day buttons are named in en-US with no count, and it marks a selection
 * rather than a scroll position. The chip is mirrored instead, so the two strips still read as one
 * family.
 *
 * The carets sit in the header row rather than flanking the days: seven fixed-width chips plus two
 * flanking buttons is wider than a 375px phone, and a strip that scrolls sideways hides the very
 * Sunday it exists to show.
 */
export function AgendaWeekStrip({
  month,
  daysWithMeetings,
  visibleDay,
  today,
  onPickDay,
  onMonthChange,
  className,
}: AgendaNavigatorProps & { className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const counts = useMemo(() => countMeetingsByDay(daysWithMeetings), [daysWithMeetings]);
  const pick = pickDayHandler(month, onPickDay, onMonthChange);

  const anchor = stripAnchor(visibleDay, month, today);
  // Keyed on the day, not the Date: `stripAnchor` may hand back a fresh Date for the same day on
  // every render, and the week only changes when the day does.
  const anchorKey = startOfDay(anchor);
  const week = useMemo(() => weekOf(new Date(anchorKey)), [anchorKey]);

  return (
    <div className={cn("border-b border-border px-5 py-2 lg:hidden", className)}>
      <div className="flex items-center justify-between gap-2">
        {/* The same carets step by the unit on screen: weeks while collapsed, months while
            expanded. The label stays the month either way — a week that straddles two months still
            belongs to the one the list below is showing. */}
        <Stepper
          label={MONTH_LABEL.format(month)}
          unit={expanded ? "month" : "week"}
          onStep={(delta) =>
            expanded
              ? onMonthChange(shiftMonths(month, delta))
              : pick(weekStepTarget(anchor, delta, month))
          }
        />

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={() => setExpanded((open) => !open)}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          {expanded ? "Week" : "Month"}
          {expanded ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
        </button>
      </div>

      <div id={regionId} className="mt-2">
        {expanded ? (
          <div className="mx-auto max-w-sm">
            <AgendaMonthCalendar
              month={month}
              daysWithMeetings={daysWithMeetings}
              counts={counts}
              visibleDay={visibleDay}
              today={today}
              // Collapse on pick: expanded, the month covers most of a phone's screen, and the
              // point of picking a day is to read it in the list underneath.
              onPick={(day) => {
                pick(day);
                setExpanded(false);
              }}
              onMonthChange={onMonthChange}
            />
          </div>
        ) : (
          <div role="group" aria-label="Week" className="grid grid-cols-7 gap-1">
            {week.map((day) => (
              <WeekDayChip
                key={day.toISOString()}
                day={day}
                count={counts.get(startOfDay(day)) ?? 0}
                isToday={today !== null && isSameDay(day, today)}
                isVisible={visibleDay !== null && isSameDay(day, visibleDay)}
                isOutsideMonth={!isInMonth(day, month)}
                onPick={() => pick(day)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
