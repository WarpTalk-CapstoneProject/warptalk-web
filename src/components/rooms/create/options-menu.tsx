"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Calendar as CalendarIcon,
  CheckCircle,
  DotsThree,
  Repeat,
  ShieldCheck,
  Translate,
} from "@phosphor-icons/react/dist/ssr";

import {
  DEFAULT_DAILY_TIME,
  type DailyRecurrenceDraft,
  defaultEndDate,
  describeDailyDraftProblem,
  firstOccurrenceDate,
  toLocalDateString,
  validateDailyDraft,
} from "@/lib/meeting/daily-recurrence";
import { WEEKDAY_OPTIONS, isoWeekdayOf } from "@/lib/meeting/recurrence";
import type { RecurrenceType } from "@/types/translationRoom";

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
  requiresApproval,
  participantsCanStartTranslation,
  onRequiresApprovalChange,
  onParticipantsCanStartTranslationChange,
}: {
  hasScheduledAt?: boolean;
  onAddScheduledAt?: () => void;
  /** The rule in force, or null when Daily is off. */
  daily?: DailyRecurrenceDraft | null;
  /** null turns Daily off. The parent clears any one-off time when a rule arrives. */
  onDailyChange?: (draft: DailyRecurrenceDraft | null) => void;
  /** WT-341: whether joiners wait in the lobby for the host. */
  requiresApproval?: boolean;
  /** WT-371: whether anyone in the room may start translation. Omit to hide the row. */
  participantsCanStartTranslation?: boolean;
  onRequiresApprovalChange?: (next: boolean) => void;
  onParticipantsCanStartTranslationChange?: (value: boolean) => void;
}) {
  const now = new Date();
  const isDaily = !!daily;
  const problem = daily ? validateDailyDraft(daily, now) : null;
  const cadence: RecurrenceType = daily?.type ?? "DAILY";

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

  /**
   * Switching cadence rewrites the rule's shape, and only the fields that belong to the new one
   * survive. Carrying stale weekdays into a MONTHLY rule would send the server a field it refuses
   * outright — and refusing rather than ignoring it is deliberate on both sides, because a rule
   * the host can see but the server discards is the dead-switch failure this control replaced.
   */
  function changeCadence(next: RecurrenceType) {
    if (!daily || !onDailyChange) return;

    const firstDate = firstOccurrenceDate(daily.time, now);

    onDailyChange({
      time: daily.time,
      endDate: daily.endDate,
      type: next,
      // Seeded from the start date so the panel opens on a rule that is already valid and already
      // visible, rather than on an empty selection the host has to guess the meaning of.
      byWeekdays: next === "WEEKLY" ? [isoWeekdayOf(firstDate)] : undefined,
      byMonthDay: next === "MONTHLY" ? firstDate.getDate() : undefined,
    });
  }

  function toggleWeekday(weekday: number) {
    if (!daily || !onDailyChange) return;

    const current = daily.byWeekdays ?? [];
    const next = current.includes(weekday)
      ? current.filter((day) => day !== weekday)
      : [...current, weekday].sort((a, b) => a - b);

    // Never down to nothing: an empty list means "the start date's weekday" to the server, so a
    // host who unticked their last day would get a rule they did not choose and cannot see.
    onDailyChange({ ...daily, byWeekdays: next.length > 0 ? next : current });
  }

  function changeMonthDay(value: string) {
    if (!daily || !onDailyChange) return;

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    onDailyChange({ ...daily, byMonthDay: Math.min(31, Math.max(1, Math.trunc(parsed))) });
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
                <span className="font-medium whitespace-nowrap text-ink">Repeat</span>
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
                {/* How often, before until-when: the cadence changes what the rest of this panel
                    even asks for, so it has to be the first thing decided. */}
                <div className="flex items-center gap-1">
                  {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      data-testid={`recurrence-type-${type.toLowerCase()}`}
                      aria-pressed={cadence === type}
                      onClick={(e) => {
                        e.stopPropagation();
                        changeCadence(type);
                      }}
                      className={`flex-1 cursor-pointer rounded-md border px-1.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                        cadence === type
                          ? "border-transparent bg-ink text-canvas"
                          : "border-border/60 bg-canvas text-ink-muted hover:text-ink"
                      }`}
                    >
                      {type.toLowerCase()}
                    </button>
                  ))}
                </div>

                {/* WEEKLY: which days. Nothing selected is not an empty rule — the server reads it
                    as "the weekday the series starts on" — but leaving the host with no selected
                    chip would make a real rule look like an unfinished one, so turning WEEKLY on
                    seeds the start date's own weekday. */}
                {cadence === "WEEKLY" && (
                  <div className="flex items-center gap-0.5" data-testid="recurrence-weekdays">
                    {WEEKDAY_OPTIONS.map((option) => {
                      const selected = (daily.byWeekdays ?? []).includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={selected}
                          aria-label={option.full}
                          title={option.full}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWeekday(option.value);
                          }}
                          className={`h-6 flex-1 cursor-pointer rounded border text-[10px] font-medium transition-colors ${
                            selected
                              ? "border-transparent bg-primary/15 text-primary"
                              : "border-border/60 bg-canvas text-ink-muted hover:text-ink"
                          }`}
                        >
                          {option.short.charAt(0)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* MONTHLY: which date. A month with fewer days simply has no meeting that month,
                    which is what the line under it says — clamping the 31st to the 28th would move
                    the meeting to a different day in every short month. */}
                {cadence === "MONTHLY" && (
                  <label className="flex items-center gap-2">
                    <span className="flex-1 text-[12px] text-ink-muted">Day of month</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      data-testid="recurrence-month-day-input"
                      aria-label="Day of the month"
                      value={daily.byMonthDay ?? ""}
                      placeholder="1–31"
                      onChange={(e) => changeMonthDay(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-[124px] rounded-md border border-border/60 bg-canvas px-1.5 text-[12px] tabular-nums text-ink focus:ring-1 focus:ring-ink/20 focus:outline-none"
                    />
                  </label>
                )}

                {cadence === "MONTHLY" && (daily.byMonthDay ?? 0) > 28 && (
                  <p className="text-[11px] leading-snug text-ink-muted">
                    Months without a {daily.byMonthDay}
                    {(daily.byMonthDay ?? 0) === 31 ? "st" : "th"} are skipped.
                  </p>
                )}

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

                {/* Only when the rule cannot be built. The prose summary that used to sit here
                    — "Every day at 09:00 · 31 meetings · Asia/Saigon" — restated the two fields
                    directly above it and named a zone nobody had chosen to see. The dialog's
                    own summary line still spells the rule out; this row is for setting it. */}
                {problem ? (
                  <p role="alert" className="text-[11px] leading-snug text-destructive">
                    {describeDailyDraftProblem(problem)}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* WT-341. This setting decides two things at once, and the second is the reason it is
            here rather than buried in room settings after the fact: it gates the lobby, AND it
            gates who may open the meeting. Leave it on and the meeting cannot start until the
            host arrives — which is correct for an interview or a webinar, and was a trap for
            every ordinary meeting whose host happened to be busy. */}
        {onRequiresApprovalChange && (
          <div className="rounded-md">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
              <button
                type="button"
                onClick={() => onRequiresApprovalChange(!requiresApproval)}
                aria-pressed={!!requiresApproval}
                className="flex flex-1 cursor-pointer items-center gap-2 text-left text-[13px]"
              >
                <ShieldCheck weight="duotone" size={16} className="shrink-0" />
                <span className="font-medium whitespace-nowrap text-ink">Require approval</span>
              </button>

              <button
                type="button"
                onClick={() => onRequiresApprovalChange(!requiresApproval)}
                aria-label={
                  requiresApproval
                    ? "Turn off approval to join"
                    : "Turn on approval to join"
                }
                className="flex shrink-0 cursor-pointer items-center"
              >
                {requiresApproval ? (
                  <CheckCircle weight="fill" size={16} color="#3b82f6" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-border/60 transition-colors" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* WT-371. Starting translation was host-only, full stop, and a host who is late or
            busy therefore blocks a meeting that is otherwise ready — the same trap "Require
            approval" above was loosened to avoid. WT-371 asked for the opposite (host-only,
            strictly), which is right for a customer demo and wrong for a standup, so the room
            decides rather than the product.

            Off by default: the permissive branch has to be something a host actually chose.
            Only STARTING is opened up — stopping stays host-only, because letting anyone cut
            translation off for everybody is a different thing entirely. */}
        {onParticipantsCanStartTranslationChange && (
          <div className="rounded-md">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
              <button
                type="button"
                onClick={() =>
                  onParticipantsCanStartTranslationChange(!participantsCanStartTranslation)
                }
                aria-pressed={!!participantsCanStartTranslation}
                className="flex flex-1 cursor-pointer items-center gap-2 text-left text-[13px]"
              >
                <Translate weight="duotone" size={16} className="shrink-0" />
                <span className="font-medium whitespace-nowrap text-ink">
                  Anyone can start translation
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onParticipantsCanStartTranslationChange(!participantsCanStartTranslation)
                }
                aria-label={
                  participantsCanStartTranslation
                    ? "Only the host may start translation"
                    : "Let anyone in the room start translation"
                }
                className="flex shrink-0 cursor-pointer items-center"
              >
                {participantsCanStartTranslation ? (
                  <CheckCircle weight="fill" size={16} color="#3b82f6" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-border/60 transition-colors" />
                )}
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
