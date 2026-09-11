"use client";

import {
  Fragment,
  type Ref,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type AgendaDay,
  agendaDayKey,
  buildAgendaSections,
  nowInsertionIndex,
  shortWeekday,
  type TimedMeeting,
} from "@/lib/meeting/agenda-sections";
import { monthKey } from "@/lib/meeting/meeting-day";
import { cn } from "@/lib/utils";

import { AgendaRow } from "./agenda-row";

const APP_CALENDAR_LOCALE = "en-GB";

/** How long a deep-linked row stays highlighted. Long enough to find, short enough to not linger. */
const HIGHLIGHT_MS = 2000;

/**
 * How long a `scrollToDay` / `highlightMeeting` for something not drawn yet is kept waiting.
 *
 * Long enough for the refetch that follows "Meeting created" to bring the new row in; short
 * enough that paging to that month minutes later does not jump or flash for a request nobody
 * remembers making.
 */
const PENDING_REQUEST_MS = 15_000;

/**
 * What the end-of-month spacer leaves unfilled: roughly one sticky week header (~27px) plus one
 * empty day row (34px). The spacer is the scroller's height minus this, which is exactly enough for
 * the shortest possible last day to scroll up under the header — see `attachScroller`.
 */
const TAIL_OFFSET = 64;

/**
 * What the calendar's navigator can ask of the list.
 *
 * Imperative on purpose. "Scroll to the 18th" is an event, not a state: modelled as a prop
 * (`scrolledDay`), a second click on the same day would change nothing and do nothing, and the
 * scroll spy reporting the day back would fight the prop that set it.
 */
export interface AgendaListHandle {
  /**
   * Bring `date`'s block to the top of the list. Smooth unless `smooth: false` or the viewer
   * prefers less motion. A day outside the drawn month is held (see `pendingDay`) and honoured
   * once the caller's `month` change renders it, so "set month, then scroll" in one tick works.
   */
  scrollToDay: (date: Date, opts?: { smooth?: boolean }) => void;
  /**
   * Scroll to one meeting's row and highlight it for ~2s — the deep link from "Meeting created".
   *
   * If the row is not drawn yet — the cache has not refetched the meeting that was just created,
   * or the caller switched `month` in the same tick and the new month has not rendered — the
   * request is held and honoured as soon as the row appears, for up to `PENDING_REQUEST_MS`.
   */
  highlightMeeting: (id: string) => void;
}

/**
 * The Agenda: every day of the displayed month as one vertical list, empty days included.
 *
 * The default calendar view, because it answers the question most people open a calendar with —
 * "what do I have, and when" — without making them decode a grid. Empty days are kept rather than
 * collapsed: a free Thursday is information, and a list that skips from the 3rd to the 9th hides
 * that the days between were free at all.
 *
 * `meetings` is the already-filtered, already-searched set, in any order. `dayKeysWithAnyMeeting`
 * is the UNFILTERED set of days (keys from `agendaDayKey`), which is only used to choose between
 * the two empty texts: "No meetings" is a fact about the day, "Nothing here matches this filter" a
 * fact about the filter, and printing the first when the second is true tells the user their
 * Tuesday is free when it is not.
 *
 * The list owns its scroll container (`h-full overflow-y-auto`), so its parent must give it a
 * bounded height — the sticky week headers, the scroll spy and `scrollToDay` all measure against it.
 */
export function AgendaList({
  ref,
  month,
  meetings,
  dayKeysWithAnyMeeting,
  now,
  workspaceSlug,
  onOpenMeeting,
  onVisibleDayChange,
}: {
  ref?: Ref<AgendaListHandle>;
  month: Date;
  meetings: readonly TimedMeeting[];
  dayKeysWithAnyMeeting: ReadonlySet<string>;
  /** The page's minute clock. Null before hydration: no today, no "This week", no now rule. */
  now: Date | null;
  workspaceSlug: string;
  onOpenMeeting: (meeting: TimedMeeting) => void;
  /** The day currently at the top of the list, for the mini calendar to mark. */
  onVisibleDayChange?: (day: Date) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /**
   * The scroll container, plus room at its end so the last days of the month can reach the top.
   *
   * Without the room, "today at the top" is a promise the list breaks for the last week of every
   * month: the content runs out, the browser stops with the 20th at the top and today somewhere
   * below it, and the scroll spy tells the mini calendar it is the 20th.
   *
   * Sized by writing the spacer's style directly, not through state, and that is load-bearing: a
   * ref callback runs before this component's layout effects in the same commit, so the spacer is
   * already tall when the auto-scroll below runs. Held in state it would only grow on the NEXT
   * commit, after the auto-scroll had been clamped short of today.
   */
  const attachScroller = useCallback((node: HTMLDivElement | null) => {
    scrollerRef.current = node;
    if (!node) return;

    const fitTail = () => {
      const tail = node.querySelector<HTMLElement>("[data-agenda-tail]");
      if (tail) tail.style.height = `${Math.max(0, node.clientHeight - TAIL_OFFSET)}px`;
    };
    fitTail();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitTail);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      scrollerRef.current = null;
    };
  }, []);

  // Rebuilt when the DAY changes, not every minute: the sections only need to know which day is
  // today, and the minute tick would otherwise rebuild thirty days of buckets for nothing.
  const todayKey = now ? agendaDayKey(now) : null;
  const sections = useMemo(
    () =>
      buildAgendaSections(month, meetings, todayKey === null ? null : new Date(Number(todayKey))),
    [month, meetings, todayKey],
  );

  const currentMonthKey = monthKey(month);
  const todayInMonth = sections.some((week) => week.days.some((day) => day.isToday));

  // ---------------------------------------------------------------------------------------------
  // Scrolling
  // ---------------------------------------------------------------------------------------------

  const scrollToKey = useCallback((key: string, smooth: boolean) => {
    const scroller = scrollerRef.current;
    if (!scroller) return false;
    const target = scroller.querySelector<HTMLElement>(`[data-day-key="${key}"]`);
    if (!target) return false;
    scroller.scrollTo({
      top: offsetBelowHeader(scroller, target),
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    });
    return true;
  }, []);

  /**
   * A `scrollToDay` for a day that is not drawn yet.
   *
   * Picking the 3rd of next month in the mini calendar means the caller moves `month` AND asks for
   * the 3rd in the same tick — while this month is still on screen. Dropped, the jump would be
   * lost and the month-change auto-scroll below would land on the 1st instead; held, that
   * auto-scroll honours it. Same expiry as a held highlight, for the same reason.
   */
  const pendingDay = useRef<{ key: string; until: number } | null>(null);

  /**
   * On mount and whenever the month changes: today at the top if today is in this month, else the
   * 1st. Instant, not smooth — the content was just replaced, so there is nothing to animate FROM,
   * and a list gliding down from the 1st on every month switch is motion for its own sake.
   *
   * Keyed on month AND on whether the clock has arrived. The first render has no clock (server
   * markup, then hydration), so it lands on the 1st; the very next pass has one, and must move to
   * today once. After that the minute tick changes nothing, so the list never yanks itself back to
   * today while someone is reading the 25th — not even at midnight.
   */
  const autoScrolledFor = useRef<string | null>(null);
  const autoScrollToken = `${currentMonthKey}:${now ? "clock" : "no-clock"}`;
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // A jump somebody asked for outranks the default position. Instant for the same reason the
    // default is: it lands on a month that was drawn a moment ago.
    const pending = pendingDay.current;
    if (pending) {
      if (Date.now() > pending.until) {
        pendingDay.current = null;
      } else if (scrollToKey(pending.key, false)) {
        pendingDay.current = null;
        autoScrolledFor.current = autoScrollToken;
        return;
      }
    }

    if (autoScrolledFor.current === autoScrollToken) return;
    autoScrolledFor.current = autoScrollToken;
    if (!(todayInMonth && todayKey && scrollToKey(todayKey, false))) {
      scroller.scrollTo({ top: 0, behavior: "auto" });
    }
    // `sections` is a dependency only so a held jump is retried when the rows are redrawn.
  }, [autoScrollToken, sections, todayInMonth, todayKey, scrollToKey]);

  // ---------------------------------------------------------------------------------------------
  // Scroll spy
  // ---------------------------------------------------------------------------------------------

  const lastReportedKey = useRef<string | null>(null);
  const reportVisibleDay = useEffectEvent(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !onVisibleDayChange) return;
    const key = topVisibleDayKey(scroller);
    if (key === null || key === lastReportedKey.current) return;
    lastReportedKey.current = key;
    onVisibleDayChange(new Date(Number(key)));
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // One reading per frame at most. A scroll event fires many times a frame on a trackpad, and
    // each reading walks up to 31 day blocks and tells the mini calendar to re-render.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        reportVisibleDay();
      });
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // A new month, or a filter that changed what is drawn, can move a different day under the top
  // edge without any scroll event at all. This runs after the auto-scroll above (layout effects
  // run first, and an "auto" scroll is synchronous), so the first report is the day the list
  // actually settled on rather than the 1st it started from.
  useEffect(() => {
    reportVisibleDay();
  }, [sections]);

  // ---------------------------------------------------------------------------------------------
  // Deep-link highlight
  // ---------------------------------------------------------------------------------------------

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const pendingHighlight = useRef<{ id: string; until: number } | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tryHighlight = useCallback((id: string) => {
    const scroller = scrollerRef.current;
    if (!scroller) return false;
    const row = scroller.querySelector<HTMLElement>(`[data-meeting-id="${cssEscape(id)}"]`);
    if (!row) return false;

    // A third of the way down rather than flush with the top: the day's date and the rows before
    // it stay in view, so the highlighted meeting arrives with its context rather than alone.
    const top = offsetBelowHeader(scroller, row) - Math.round(scroller.clientHeight / 3);
    scroller.scrollTo({
      top: Math.max(0, top),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });

    setHighlightedId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    return true;
  }, []);

  // A held request is retried whenever the rows change. Not dropped on a month change: a deep
  // link's caller typically moves `month` to the meeting's month and asks for the highlight in the
  // same tick, so the request arrives while the OLD month is still drawn.
  useEffect(() => {
    const pending = pendingHighlight.current;
    if (!pending) return;
    if (Date.now() > pending.until || tryHighlight(pending.id)) pendingHighlight.current = null;
  }, [sections, tryHighlight]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToDay(date, opts) {
        const key = agendaDayKey(date);
        pendingDay.current = scrollToKey(key, opts?.smooth ?? true)
          ? null
          : { key, until: Date.now() + PENDING_REQUEST_MS };
      },
      highlightMeeting(id) {
        pendingHighlight.current = tryHighlight(id)
          ? null
          : { id, until: Date.now() + PENDING_REQUEST_MS };
      },
    }),
    [scrollToKey, tryHighlight],
  );

  // ---------------------------------------------------------------------------------------------

  return (
    <div
      ref={attachScroller}
      className="h-full min-h-0 overflow-y-auto overscroll-contain bg-surface-1"
    >
      {sections.map((week) => (
        <section key={week.key} aria-label={`Week of ${week.label}`}>
          <h2
            data-week-header
            className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-1/95 px-5 py-1.5 text-[11px] font-medium tabular-nums text-ink-muted backdrop-blur lg:px-8"
          >
            <span>{week.label}</span>
            {week.isCurrentWeek ? (
              <span className="font-semibold text-primary">This week</span>
            ) : null}
          </h2>

          <ol>
            {week.days.map((day) => (
              <AgendaDayBlock
                key={day.key}
                day={day}
                now={now}
                hasAnyMeeting={dayKeysWithAnyMeeting.has(day.key)}
                workspaceSlug={workspaceSlug}
                highlightedId={highlightedId}
                onOpenMeeting={onOpenMeeting}
              />
            ))}
          </ol>
        </section>
      ))}

      {/* No `style` prop, on purpose: `attachScroller` owns this element's height, and a React
          style here would be re-applied over it on every render. */}
      <div
        aria-hidden
        data-agenda-tail
        className="px-5 pt-4 text-center text-[11px] text-ink-subtle lg:px-8"
      >
        End of {month.toLocaleDateString(APP_CALENDAR_LOCALE, { month: "long", year: "numeric" })}
      </div>
    </div>
  );
}

function AgendaDayBlock({
  day,
  now,
  hasAnyMeeting,
  workspaceSlug,
  highlightedId,
  onOpenMeeting,
}: {
  day: AgendaDay<TimedMeeting>;
  now: Date | null;
  hasAnyMeeting: boolean;
  workspaceSlug: string;
  highlightedId: string | null;
  onOpenMeeting: (meeting: TimedMeeting) => void;
}) {
  const isEmpty = day.meetings.length === 0;

  // Only today has a now rule, and only once there is a clock. Same boundary rule as the week
  // view's `NowLine`: before the first meeting that has not started, -1 meaning after them all.
  const nowIndex = day.isToday && now && !isEmpty ? nowInsertionIndex(day.meetings, now) : null;

  return (
    <li
      data-day-key={day.key}
      aria-current={day.isToday ? "date" : undefined}
      className={cn(
        "flex gap-2 border-b border-border/60 px-5 lg:px-8",
        isEmpty ? "min-h-[34px] items-center py-[2px]" : "items-start py-1",
      )}
    >
      <div className={cn("flex w-[76px] shrink-0 items-center gap-2", !isEmpty && "pt-[5px]")}>
        {/* The full date is for screen readers; the number and the weekday are drawn for eyes. */}
        <span className="sr-only">{formatDayHeading(day.date)}</span>
        <span
          aria-hidden
          className={cn(
            "grid size-[30px] place-items-center rounded-full text-[20px] font-semibold leading-none tabular-nums",
            day.isToday ? "bg-primary text-white" : "text-ink",
          )}
        >
          {day.date.getDate()}
        </span>
        <span
          aria-hidden
          className={cn(
            "text-[10.5px] uppercase tracking-wide",
            day.isToday ? "font-semibold text-primary" : "text-ink-subtle",
          )}
        >
          {shortWeekday(day.date)}
        </span>
      </div>

      {isEmpty ? (
        <p className="min-w-0 text-[12px] text-ink-subtle">
          {hasAnyMeeting ? "Nothing here matches this filter" : "No meetings"}
        </p>
      ) : (
        <ol className="min-w-0 flex-1">
          {day.meetings.map((meeting, index) => (
            <Fragment key={meeting.id}>
              {now && nowIndex === index ? <AgendaNowLine now={now} /> : null}
              <li>
                <AgendaRow
                  meeting={meeting}
                  workspaceSlug={workspaceSlug}
                  highlighted={meeting.id === highlightedId}
                  onOpen={() => onOpenMeeting(meeting)}
                />
              </li>
            </Fragment>
          ))}
          {now && nowIndex === -1 ? <AgendaNowLine now={now} /> : null}
        </ol>
      )}
    </li>
  );
}

/**
 * The red "Now hh:mm" rule between what has started and what has not.
 *
 * The week view's `NowLine`, re-drawn at list scale with the word "Now" in it: in a week column
 * the bare time sits next to cards that carry their own times, but here it sits in the time
 * column's own rhythm, where "14:05" alone reads as one more meeting.
 */
function AgendaNowLine({ now }: { now: Date }) {
  const label = new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  // A plain <li> wrapping the separator, not an <li role="separator">: an ordered list whose
  // children are not all list items is what screen readers and axe both trip over.
  return (
    <li>
      <div
        role="separator"
        aria-label={`Current time, ${label}`}
        className="flex items-center gap-2 px-2 py-0.5"
      >
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-rose-600 dark:text-rose-400">
          Now {label}
        </span>
        <span className="size-1.5 shrink-0 rounded-full bg-rose-500" />
        <span className="h-px flex-1 bg-rose-500" />
      </div>
    </li>
  );
}

/**
 * The top of `target`, in the scroller's scroll coordinates, less the sticky week header.
 *
 * The header is sticky, so it covers whatever scrolls under it: scrolling a day flush to the top
 * would hide the day behind its own week's label. Measured rather than assumed, so a header that
 * wraps on a narrow screen still clears.
 */
function offsetBelowHeader(scroller: HTMLElement, target: HTMLElement) {
  const header = scroller.querySelector<HTMLElement>("[data-week-header]");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const top =
    target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  return Math.max(0, top - headerHeight);
}

/**
 * The key of the first day block that is still visible below the sticky header.
 *
 * A linear walk over at most 31 elements, once per frame — cheaper than keeping an
 * IntersectionObserver's bookkeeping in sync with a list that is rebuilt on every filter change.
 */
function topVisibleDayKey(scroller: HTMLElement): string | null {
  const header = scroller.querySelector<HTMLElement>("[data-week-header]");
  const edge =
    scroller.getBoundingClientRect().top + (header ? header.getBoundingClientRect().height : 0);
  const days = scroller.querySelectorAll<HTMLElement>("[data-day-key]");
  for (const day of days) {
    // +1: a block whose bottom sits exactly on the edge has scrolled out, it is not "at the top".
    if (day.getBoundingClientRect().bottom > edge + 1) return day.dataset.dayKey ?? null;
  }
  return days.length ? (days[days.length - 1].dataset.dayKey ?? null) : null;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Meeting ids are GUIDs today; escaped anyway so an id is never parsed as selector syntax. */
function cssEscape(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}

/** "Tuesday, 8 September 2026" — the same heading the page's day panel uses. */
function formatDayHeading(day: Date) {
  return new Intl.DateTimeFormat(APP_CALENDAR_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(day);
}
