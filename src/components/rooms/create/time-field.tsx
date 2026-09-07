"use client";

/**
 * A 24-hour time control that reads the same on every machine. WT-548.
 *
 * WHY NOT `<input type="time">`
 *   The native control's language comes from the BROWSER, not from the page. `<html lang="en">`
 *   does not reach it. On a Vietnamese Chrome — which is most of the team's and most of the
 *   users' — the English Create Room dialog rendered "09:00 SA", and its date sibling rendered
 *   "Tháng Chín 2026" with a "Xóa"/"Hôm nay" footer. There is no attribute that fixes that,
 *   because the widget is not ours to style or translate.
 *
 * Two selects rather than a masked text input: every value is reachable with the keyboard, none
 * of them can be half-typed, and there is no parse step that can disagree with what is on screen.
 *
 * The value is the same "HH:mm" string the native input produced, so callers and the recurrence
 * code that reads it are unchanged.
 */

import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

/** Tolerates "9:5", "", and anything else a caller might still hold. */
function splitTime(value: string): [string, string] {
  const [rawHour = "", rawMinute = ""] = (value ?? "").split(":");
  const hour = String(Number.parseInt(rawHour, 10) || 0).padStart(2, "0");
  const minute = String(Number.parseInt(rawMinute, 10) || 0).padStart(2, "0");
  return [HOURS.includes(hour) ? hour : "00", MINUTES.includes(minute) ? minute : "00"];
}

export function TimeField({
  value,
  onChange,
  label,
  className,
  "data-testid": testId,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  "data-testid"?: string;
}) {
  const [hour, minute] = splitTime(value);

  const selectClass =
    "h-7 cursor-pointer rounded-md border border-border/60 bg-surface-1 px-1 text-[12px] tabular-nums text-ink focus:outline-none focus:ring-1 focus:ring-ink/20";

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      data-testid={testId}
      // The row this sits in toggles the whole setting when clicked.
      onClick={(event) => event.stopPropagation()}
    >
      <select
        aria-label={`${label} — hour`}
        value={hour}
        onChange={(event) => onChange(`${event.target.value}:${minute}`)}
        className={selectClass}
      >
        {HOURS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-[12px] text-ink-muted">
        :
      </span>
      <select
        aria-label={`${label} — minute`}
        value={minute}
        onChange={(event) => onChange(`${hour}:${event.target.value}`)}
        className={selectClass}
      >
        {MINUTES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
