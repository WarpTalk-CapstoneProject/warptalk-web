"use client";

/**
 * A date control that speaks the app's language. WT-548.
 *
 * The native `<input type="date">` renders its month grid in the BROWSER's language, not the
 * page's, so an English Create Room dialog opened a Vietnamese calendar — "Tháng Chín 2026", a
 * "H B T N S B C" weekday header, and "Xóa"/"Hôm nay" buttons. No attribute changes that.
 *
 * This is the same Popover + Calendar pairing StartTimePicker already uses, which is why the
 * start-date half of that control never had the bug. Sharing the pattern is the point: one
 * calendar in the product, in one language.
 *
 * The value stays the "YYYY-MM-DD" local-date string the native input produced, so the
 * recurrence code that parses it is untouched.
 */

import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toLocalDateString } from "@/lib/meeting/daily-recurrence";
import { cn } from "@/lib/utils";

/**
 * Parsed as a LOCAL date, not through `new Date("2026-09-30")` — that spelling is read as UTC
 * and lands on the previous day for everyone west of Greenwich, which would show the calendar
 * one day behind the value beside it.
 */
function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** "30 Sep 2026" — month spelled out, so there is no dd/mm vs mm/dd ambiguity to resolve. */
function formatLabel(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return "Pick a date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function DateField({
  value,
  onChange,
  min,
  label,
  className,
  "data-testid": testId,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Local "YYYY-MM-DD"; earlier days are shown disabled rather than hidden. */
  min?: string;
  label: string;
  className?: string;
  "data-testid"?: string;
}) {
  const selected = parseLocalDate(value);
  const minDate = min ? parseLocalDate(min) : undefined;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            data-testid={testId}
            // The row this sits in toggles the whole setting when clicked.
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-canvas px-1.5 text-[12px] tabular-nums text-ink focus:outline-none focus:ring-1 focus:ring-ink/20",
              className,
            )}
          >
            <CalendarBlank size={13} className="shrink-0 text-ink-muted" />
            {formatLabel(value)}
          </button>
        }
      />
      <PopoverContent
        align="end"
        className="w-auto rounded-xl border-border/50 bg-canvas p-3 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={(date) => {
            if (date) onChange(toLocalDateString(date));
          }}
          className="border-none bg-transparent p-0"
        />
      </PopoverContent>
    </Popover>
  );
}
