/**
 * The choices offered in place of a bare number on the plan editor (owner, 3 Oct 2026: "the rates I
 * don't understand — make them dropdowns").
 *
 * Each option is a value plus the words that explain it, worked out from the plan's own numbers
 * where that is what makes it legible ("25% of the plan's credits — 175 credits"). The current
 * stored value always stays reachable: if it matches no option the editor shows "Custom" with the
 * number, so opening and saving a plan never changes it.
 */
import { formatAmount } from "../format/currency.ts";

export type PresetOption = {
  value: number;
  /** i18n key under adminPlansSettings.pricingEditors.planForm.presets */
  labelKey: string;
  values?: Record<string, string | number>;
};

function percentOf(credits: number, percent: number): number {
  return Math.round((credits * percent) / 100);
}

function share(credits: number, percents: number[], zeroKey: string, key: string): PresetOption[] {
  const options: PresetOption[] = [{ value: 0, labelKey: zeroKey }];
  if (credits > 0) {
    for (const percent of percents) {
      options.push({
        value: percentOf(credits, percent),
        labelKey: key,
        values: { percent, credits: formatAmount(percentOf(credits, percent)) },
      });
    }
  }
  return dedupe(options);
}

function dedupe(options: PresetOption[]): PresetOption[] {
  const seen = new Set<number>();
  return options.filter((option) => (seen.has(option.value) ? false : (seen.add(option.value), true)));
}

/** Extra credits a workspace may use past its allowance before it is cut off. */
export function overageCapPresets(creditsPerCycle: number): PresetOption[] {
  return share(creditsPerCycle, [10, 25, 50, 100], "overageCapNone", "overageCapShare");
}

/** Price of one overage credit, as a multiple of what a credit costs inside the plan. */
export function overagePricePresets(price: number, creditsPerCycle: number): PresetOption[] {
  if (!(price > 0) || !(creditsPerCycle > 0)) return [];
  const base = price / creditsPerCycle;
  return dedupe(
    [1, 1.25, 1.5, 2].map((multiple) => ({
      value: Number((base * multiple).toPrecision(6)),
      labelKey: multiple === 1 ? "overagePriceSame" : "overagePriceMultiple",
      values: { multiple },
    })),
  );
}

/** When the "running low" warning is sent. */
export function lowBalancePresets(creditsPerCycle: number): PresetOption[] {
  return share(creditsPerCycle, [5, 10, 20], "lowBalanceOff", "lowBalanceShare");
}

/** Unused credits carried into the next cycle. */
export function rolloverPresets(creditsPerCycle: number): PresetOption[] {
  return share(creditsPerCycle, [25, 50, 100], "rolloverNone", "rolloverShare");
}

export const INVOICE_TERMS_PRESETS: PresetOption[] = [
  { value: 0, labelKey: "termsOnReceipt" },
  ...[7, 15, 30].map((days) => ({ value: days, labelKey: "termsDays", values: { days } })),
];

export const INVOICE_GRACE_PRESETS: PresetOption[] = [
  { value: 0, labelKey: "graceNone" },
  ...[1, 3, 7, 15].map((days) => ({ value: days * 24, labelKey: "graceDays", values: { days } })),
];

export const PARTICIPANT_PRESETS: PresetOption[] = [2, 5, 10, 20, 50, 100].map((count) => ({
  value: count,
  labelKey: "participants",
  values: { count },
}));

export const LANGUAGE_PRESETS: PresetOption[] = [1, 2, 3].map((count) => ({
  value: count,
  labelKey: "languages",
  values: { count },
}));

export const VOICE_CLONE_LIMIT_PRESETS: PresetOption[] = [
  { value: -1, labelKey: "voiceCloneUnlimited" },
  ...[60, 120, 300].map((minutes) => ({ value: minutes, labelKey: "voiceCloneMinutes", values: { minutes } })),
];

/** The option a stored value matches, or null — which the editor shows as "Custom". */
export function matchPreset(options: readonly PresetOption[], value: number): PresetOption | null {
  if (!Number.isFinite(value)) return null;
  return options.find((option) => Math.abs(option.value - value) < 1e-9) ?? null;
}
