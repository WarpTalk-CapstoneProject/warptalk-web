"use client";

import { Repeat } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
 * WT-327: picking Daily has to ask for the hour rather than silently committing one — the
 * control it replaced was a dead switch whose check mark looked identical whether the setting
 * reached the server or not.
 *
 * It asks for three things and shows one:
 *  - the hour (the whole point),
 *  - the last day, defaulted rather than left open — a series with no end generates rooms for
 *    an abandoned workspace until somebody notices the row count,
 *  - implicitly, the time zone, read from the browser so "8am" means 8am where the host is.
 * And it prints how many meetings this will create BEFORE the button is pressed.
 *
 * This was a second Dialog stacked on the create dialog, which put a 420px modal over a modal
 * to collect two fields — and left the half-written meeting behind a dimmed overlay while the
 * host set a time. It is now a panel inside the dialog that already exists. Being plain markup
 * rather than a portalled popup also retires the base-ui nesting hazard the modal version
 * carried: a dialog whose root sat anywhere outside the parent's popup context was treated as
 * an outside interaction, closing the parent and discarding the meeting being written.
 *
 * Mounted only while open, so every open starts from what is actually in force rather than
 * from whatever was typed and abandoned last time.
 */
export function DailyScheduleInline({
  value,
  onConfirm,
  onCancel,
  onDisable,
}: {
  /** The draft already in force, or null when Daily is currently off. */
  value: DailyRecurrenceDraft | null;
  onConfirm: (draft: DailyRecurrenceDraft) => void;
  onCancel: () => void;
  /** Turn Daily off entirely. Only offered once it is on. */
  onDisable: () => void;
}) {
  const now = new Date();
  const [time, setTime] = useState(value?.time ?? DEFAULT_DAILY_TIME);
  const [endDate, setEndDate] = useState(
    value?.endDate ?? defaultEndDate(value?.time ?? DEFAULT_DAILY_TIME, now),
  );

  const draft: DailyRecurrenceDraft = { time, endDate };
  const problem = validateDailyDraft(draft, now);
  const summary = describeDailySchedule(draft, now);
  const timeZone = detectTimeZone();

  function handleTimeChange(next: string) {
    setTime(next);
    // Moving the hour can move the first occurrence by a day, which can strand an end date
    // behind the start. Re-default rather than leaving the host with an invalid range they did
    // not create.
    if (validateDailyDraft({ time: next, endDate }, now)?.kind === "endBeforeStart") {
      setEndDate(defaultEndDate(next, now));
    }
  }

  return (
    <div className="mx-5 mt-1 mb-2 rounded-lg border border-border/60 bg-surface-1/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 pb-2">
        <Repeat weight="duotone" size={14} className="text-ink-muted" />
        <span className="text-[12px] font-medium text-ink">Repeat daily</span>
        <span className="ml-auto text-[11px] text-ink-muted/80">{timeZone}</span>
      </div>

      {/* Side by side: two short fields do not need two rows, and keeping the panel shallow is
          what stops it pushing the Create button out of a dialog it lives inside. */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-muted">Time each day</span>
          <input
            type="time"
            data-testid="daily-time-input"
            value={time}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="h-8 rounded-md border border-border/60 bg-canvas px-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-muted">Repeat until</span>
          <input
            type="date"
            data-testid="daily-end-date-input"
            value={endDate}
            min={toLocalDateString(now)}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-8 rounded-md border border-border/60 bg-canvas px-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
          />
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          {value ? (
            <button
              type="button"
              onClick={onDisable}
              className="px-1.5 text-[12px] text-ink-muted transition-colors hover:text-destructive"
            >
              Turn off
            </button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-8 rounded-md px-2.5 text-[12px]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="daily-confirm"
            disabled={problem !== null}
            onClick={() => onConfirm(draft)}
            className="h-8 rounded-md bg-ink px-3 text-[12px] font-medium text-canvas hover:opacity-90 disabled:opacity-40"
          >
            Save
          </Button>
        </div>
      </div>

      {problem ? (
        <p role="alert" className="pt-2 text-[11px] leading-snug text-destructive">
          {describeDailyDraftProblem(problem)}
        </p>
      ) : (
        <p data-testid="daily-summary" className="pt-2 text-[11px] leading-snug text-ink-muted">
          {summary}
        </p>
      )}
    </div>
  );
}
