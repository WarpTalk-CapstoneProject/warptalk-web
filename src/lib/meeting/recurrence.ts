import type { RecurrenceType, SeriesListSummary, RecurrenceSummaryResponse } from "@/types/translationRoom";

/**
 * WT-327: how a repeat rule reads to a person.
 *
 * One implementation, because the meetings list, the series page, the create dialog's summary
 * line and the room header all describe the same rule, and four spellings of "every Monday and
 * Wednesday" is four chances for the screen to disagree with what was actually booked.
 *
 * ISO weekdays throughout — Monday 1 … Sunday 7 — matching the API. Never JavaScript's
 * `Date.getDay()`, where Sunday is 0 and every day is therefore off by one.
 */

const WEEKDAY_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

const WEEKDAY_FULL_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/** ISO weekday (Monday 1 … Sunday 7) for a Date, which `getDay()` numbers differently. */
export function isoWeekdayOf(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

export function weekdayName(isoWeekday: number, full = false): string {
  return (full ? WEEKDAY_FULL_NAMES : WEEKDAY_NAMES)[isoWeekday] ?? "";
}

export const WEEKDAY_OPTIONS: { value: number; short: string; full: string }[] = [1, 2, 3, 4, 5, 6, 7].map(
  (value) => ({ value, short: WEEKDAY_NAMES[value], full: WEEKDAY_FULL_NAMES[value] }),
);

/** The ordinal a monthly rule reads with: 1st, 2nd, 3rd, 21st, 31st. */
export function ordinal(day: number): string {
  const remainderOfTen = day % 10;
  const remainderOfHundred = day % 100;

  if (remainderOfTen === 1 && remainderOfHundred !== 11) return `${day}st`;
  if (remainderOfTen === 2 && remainderOfHundred !== 12) return `${day}nd`;
  if (remainderOfTen === 3 && remainderOfHundred !== 13) return `${day}rd`;
  return `${day}th`;
}

type RecurrenceRule = Pick<SeriesListSummary, "type" | "byWeekdays" | "byMonthDay"> &
  Partial<Pick<SeriesListSummary, "interval" | "startTimeLocal">>;

/**
 * The cadence alone — "Daily", "Weekly on Mon, Wed", "Monthly on the 15th".
 *
 * A weekly rule with no weekdays stored still reads as "Weekly" rather than as a broken string:
 * the server resolves an absent list to the start date's own weekday, so the rule is real even
 * when this row cannot name it.
 */
export function describeRecurrence(rule: RecurrenceRule): string {
  const every = rule.interval && rule.interval > 1 ? `Every ${rule.interval} ` : "";

  switch (rule.type) {
    case "DAILY":
      return every ? `${every}days` : "Daily";

    case "WEEKLY": {
      const days = (rule.byWeekdays ?? []).map((day) => weekdayName(day)).filter(Boolean);
      const label = every ? `${every}weeks` : "Weekly";
      return days.length > 0 ? `${label} on ${days.join(", ")}` : label;
    }

    case "MONTHLY": {
      const label = every ? `${every}months` : "Monthly";
      return rule.byMonthDay ? `${label} on the ${ordinal(rule.byMonthDay)}` : label;
    }

    default:
      return "Repeats";
  }
}

/**
 * The same rule as a sentence fragment — "Every day", "Every week on Mon, Wed", "Every month on
 * the 15th" — for copy that continues into "… at 08:00".
 *
 * A separate function rather than a flag on {@link describeRecurrence}: a chip and a sentence want
 * genuinely different English ("Daily" vs "Every day"), and one function returning either
 * depending on a boolean is how the chip ends up reading like half a sentence.
 */
export function describeRecurrenceSentence(rule: RecurrenceRule): string {
  const period = rule.interval && rule.interval > 1 ? `${rule.interval} ` : "";

  switch (rule.type) {
    case "DAILY":
      return period ? `Every ${period}days` : "Every day";

    case "WEEKLY": {
      const days = (rule.byWeekdays ?? []).map((day) => weekdayName(day)).filter(Boolean);
      const label = period ? `Every ${period}weeks` : "Every week";
      return days.length > 0 ? `${label} on ${days.join(", ")}` : label;
    }

    case "MONTHLY": {
      const label = period ? `Every ${period}months` : "Every month";
      return rule.byMonthDay ? `${label} on the ${ordinal(rule.byMonthDay)}` : label;
    }

    default:
      return "Repeats";
  }
}

/** The cadence plus the time of day: "Weekly on Mon, Wed · 08:00". */
export function describeRecurrenceWithTime(rule: RecurrenceRule): string {
  const cadence = describeRecurrence(rule);
  return rule.startTimeLocal ? `${cadence} · ${rule.startTimeLocal}` : cadence;
}

/** A short badge label — the cadence word on its own, for a chip with no room for the rest. */
export function recurrenceBadgeLabel(type: RecurrenceType): string {
  switch (type) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    default:
      return "Repeats";
  }
}

/**
 * Whether a booking is still producing meetings. A CANCELLED or COMPLETED series is history: it
 * keeps its occurrences and its page, but nothing new arrives, and the UI must not offer to join
 * or edit it as though something might.
 */
export function isSeriesLive(status: RecurrenceSummaryResponse["status"]): boolean {
  return status === "ACTIVE";
}
