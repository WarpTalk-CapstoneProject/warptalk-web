"use client";

import { Repeat } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * WT-327: the modal the owner asked for — "khi chọn mode daily thì mở modal để user chọn giờ
 * daily". Picking Daily opens this; from then on a meeting is scheduled at that hour every day.
 *
 * It asks for three things and shows one:
 *  - the hour (the whole point),
 *  - the last day, defaulted rather than left open — a series with no end generates rooms for an
 *    abandoned workspace until somebody notices the row count,
 *  - implicitly, the time zone, read from the browser so "8am" means 8am where the host is.
 * And it prints how many meetings this will create, BEFORE the button is pressed. That preview is
 * the difference between this control and the dead switch it replaces: the old Daily toggle looked
 * identical whether it worked or not.
 */
export function DailyScheduleDialog({
  open,
  onOpenChange,
  value,
  onConfirm,
  onDisable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The draft already in force, or null when Daily is currently off. */
  value: DailyRecurrenceDraft | null;
  onConfirm: (draft: DailyRecurrenceDraft) => void;
  /** Turn Daily off entirely. Only offered once it is on. */
  onDisable: () => void;
}) {
  const now = new Date();
  const [time, setTime] = useState(value?.time ?? DEFAULT_DAILY_TIME);
  const [endDate, setEndDate] = useState(
    value?.endDate ?? defaultEndDate(value?.time ?? DEFAULT_DAILY_TIME, now),
  );
  // Re-keyed on every open so reopening the modal shows what is actually in force rather than
  // whatever was typed and abandoned last time.
  const [initializedFor, setInitializedFor] = useState<boolean | null>(null);

  if (open && initializedFor !== true) {
    setInitializedFor(true);
    setTime(value?.time ?? DEFAULT_DAILY_TIME);
    setEndDate(value?.endDate ?? defaultEndDate(value?.time ?? DEFAULT_DAILY_TIME, now));
  }
  if (!open && initializedFor !== null) {
    setInitializedFor(null);
  }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="!bg-black/40 !backdrop-blur-none"
        className="sm:max-w-[420px] p-0 border-border/60 bg-white dark:bg-zinc-950 rounded-xl overflow-hidden"
      >
        <DialogTitle className="sr-only">Repeat daily</DialogTitle>
        <DialogDescription className="sr-only">
          Choose the time this meeting is scheduled at every day
        </DialogDescription>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 px-5 pt-4 pb-1">
            <Repeat weight="duotone" size={16} className="text-ink-muted" />
            <span className="text-[14px] font-medium text-ink">Repeat daily</span>
          </div>

          <div className="px-5 pt-2 pb-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-muted">Time each day</span>
              <input
                type="time"
                data-testid="daily-time-input"
                value={time}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="h-9 px-2.5 text-[13px] bg-surface-1 border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-ink/20 text-ink"
              />
              {/* Named out loud. "8am" is ambiguous the moment two people are in two zones, and
                  the server stores this exact id rather than an offset. */}
              <span className="text-[11px] text-ink-muted/80">{timeZone}</span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-muted">Repeat until</span>
              <input
                type="date"
                data-testid="daily-end-date-input"
                value={endDate}
                min={toLocalDateString(now)}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 px-2.5 text-[13px] bg-surface-1 border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-ink/20 text-ink"
              />
            </label>

            {problem ? (
              <p role="alert" className="text-[12px] leading-snug text-destructive">
                {describeDailyDraftProblem(problem)}
              </p>
            ) : (
              <p
                data-testid="daily-summary"
                className="text-[12px] leading-snug text-ink-muted rounded-md bg-surface-1 border border-border/50 px-2.5 py-2"
              >
                {summary}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-surface-1/50">
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onDisable();
                  onOpenChange(false);
                }}
                className="text-[12px] text-ink-muted hover:text-destructive transition-colors"
              >
                Turn off
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-[30px] px-3 rounded-md text-[13px]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                data-testid="daily-confirm"
                disabled={problem !== null}
                onClick={() => {
                  onConfirm(draft);
                  onOpenChange(false);
                }}
                className="h-[30px] px-3.5 rounded-md bg-ink text-canvas hover:opacity-90 disabled:opacity-40 text-[13px] font-medium"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
