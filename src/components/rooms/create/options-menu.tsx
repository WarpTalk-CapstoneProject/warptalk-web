"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Calendar as CalendarIcon,
  CheckCircle,
  DotsThree,
  Repeat,
} from "@phosphor-icons/react/dist/ssr";

import {
  DEFAULT_DAILY_TIME,
  type DailyRecurrenceDraft,
  defaultEndDate,
  describeDailyDraftProblem,
  describeDailySchedule,
  detectTimeZone,
  toLocalDateString,
  validateDailyDraft,
} from "@/lib/daily-recurrence";

/**
 * The scheduling menu: a one-off date, or a daily rule.
 *
 * WT-327 required that choosing Daily ASK for the hour rather than commit one silently — the
 * control it replaced was a dead switch whose check mark looked identical whether the setting
 * reached the server or not. That was first met with a modal, then with a panel in the create
 * dialog; both answered it by opening a second surface on top of the first, so choosing an
 * hour meant looking at a popup over a panel over a dialog.
 *
 * The asking now happens in the row itself. Turning Daily on reveals the hour beside its own
 * label, the end date under it, and the resulting occurrence count under that — so the hour is
 * never hidden, never assumed without being shown, and never needs a surface of its own. The
 * value commits as it is edited; there is no Save, because there is nothing to dismiss.
 *
 * Deliberately plain buttons rather than cmdk's Command/CommandItem: a text input inside a
 * CommandItem fights the list for arrow keys and typing, and selects the row on click.
 */
export function OptionsMenu({
  hasScheduledAt,
  onAddScheduledAt,
  daily,
  onDailyChange,
}: {
  hasScheduledAt?: boolean;
  onAddScheduledAt?: () => void;
  /** The rule in force, or null when Daily is off. */
  daily?: DailyRecurrenceDraft | null;
  /** null turns Daily off. The parent clears any one-off time when a rule arrives. */
  onDailyChange?: (draft: DailyRecurrenceDraft | null) => void;
}) {
  const now = new Date();
  const isDaily = !!daily;
  const problem = daily ? validateDailyDraft(daily, now) : null;

  function toggleDaily() {
    if (!onDailyChange) return;
    if (daily) {
      onDailyChange(null);
      return;
    }
    // Turning it on shows the hour immediately, in an editable field one row down from the
    // click. A default that is visible and adjustable on the spot is not a silent commit.
    onDailyChange({
      time: DEFAULT_DAILY_TIME,
      endDate: defaultEndDate(DEFAULT_DAILY_TIME, now),
    });
  }

  function changeTime(next: string) {
    if (!daily || !onDailyChange) return;
    // Moving the hour can move the first occurrence by a day, stranding an end date behind the
    // start. Re-default rather than leaving an invalid range the host did not create.
    const endDate =
      validateDailyDraft({ time: next, endDate: daily.endDate }, now)?.kind === "endBeforeStart"
        ? defaultEndDate(next, now)
        : daily.endDate;
    onDailyChange({ time: next, endDate });
  }

  return (
    <Popover>
      <PopoverTrigger className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-full border border-border/60 bg-white text-ink-muted shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-border hover:bg-surface-1 hover:text-ink dark:bg-transparent">
        <DotsThree weight="bold" size={16} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[262px] rounded-xl border-border/50 bg-canvas p-1.5 shadow-xl"
      >
        {!hasScheduledAt && (
          <button
            type="button"
            onClick={onAddScheduledAt}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-surface-2"
          >
            <CalendarIcon weight="duotone" size={14} />
            Date &amp; Time
          </button>
        )}

        {onDailyChange && (
          <div className="rounded-md">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
              <button
                type="button"
                onClick={toggleDaily}
                aria-pressed={isDaily}
                className="flex flex-1 cursor-pointer items-center gap-2 text-left text-[13px]"
              >
                <Repeat weight="duotone" size={16} className="shrink-0" />
                <span className="font-medium whitespace-nowrap text-ink">Daily</span>
              </button>

              {/* Beside the label, not behind a button that opens somewhere else. */}
              {isDaily && (
                <input
                  type="time"
                  data-testid="daily-time-input"
                  aria-label="Time each day"
                  value={daily.time}
                  onChange={(e) => changeTime(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-7 w-[92px] rounded-md border border-border/60 bg-surface-1 px-1.5 text-[12px] tabular-nums text-ink focus:ring-1 focus:ring-ink/20 focus:outline-none"
                />
              )}

              <button
                type="button"
                onClick={toggleDaily}
                aria-label={isDaily ? "Turn off daily repeat" : "Turn on daily repeat"}
                className="flex shrink-0 cursor-pointer items-center"
              >
                {isDaily ? (
                  <CheckCircle weight="fill" size={16} color="#3b82f6" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-border/60 transition-colors" />
                )}
              </button>
            </div>

            {/* Expanded under Daily, so the rule reads top to bottom: how often, until when,
                and how much that adds up to. */}
            {isDaily && (
              <div className="mt-0.5 flex flex-col gap-1.5 rounded-md bg-surface-1/60 px-2 py-2">
                <label className="flex items-center gap-2">
                  <span className="flex-1 text-[12px] text-ink-muted">Repeat until</span>
                  <input
                    type="date"
                    data-testid="daily-end-date-input"
                    value={daily.endDate}
                    min={toLocalDateString(now)}
                    onChange={(e) => onDailyChange({ ...daily, endDate: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 w-[124px] rounded-md border border-border/60 bg-canvas px-1.5 text-[12px] tabular-nums text-ink focus:ring-1 focus:ring-ink/20 focus:outline-none"
                  />
                </label>

                {/* The count, before the room is created. This preview is what distinguishes
                    the control from the dead switch it replaced. */}
                {problem ? (
                  <p role="alert" className="text-[11px] leading-snug text-destructive">
                    {describeDailyDraftProblem(problem)}
                  </p>
                ) : (
                  <p
                    data-testid="daily-summary"
                    className="text-[11px] leading-snug text-ink-muted"
                  >
                    {describeDailySchedule(daily, now)} · {detectTimeZone()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
