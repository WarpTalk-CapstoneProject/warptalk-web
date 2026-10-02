/**
 * What a meeting is charged per second — the three credit-unit (CRD) rate cards billing_worker
 * settles on, picked out of the rate-card list for the platform settings console.
 *
 * The rate-card screen cannot edit them: its editor publishes provider-cost cards, matched on a
 * provider and model these cards do not have. They are edited here instead, one number each, through
 * PUT /usages/rate-card/{id}/credit-price, which supersedes the card so settled usage keeps its price.
 *
 * Deliberately free of React so `node:test` can exercise it without a renderer.
 */

/** In the order a meeting meets them: the words are translated, then spoken. */
export const MEETING_CREDIT_CHARGE_TYPES = [
  "TRANSLATION",
  "AUDIO_DUBBING_STANDARD",
  "AUDIO_DUBBING_VOICE_CLONE",
] as const;

export type MeetingCreditChargeType = (typeof MEETING_CREDIT_CHARGE_TYPES)[number];

/** Mirrors UsageRateCardAdminService.MaxCreditUnitPrice — the server is what enforces it. */
export const MAX_CREDIT_UNIT_PRICE = 100;

export interface MeetingRateCardLike {
  id: string;
  chargeType: string;
  unit: string;
  currency: string;
  unitPrice: number;
  sourceLanguageCode: string | null;
  targetLanguageCode: string | null;
  effectiveTo: string | null;
  isActive: boolean;
}

/**
 * The card in force for each billed charge type, or null where the database has none.
 *
 * Only the language-agnostic per-second card: billing_worker prefers a language-specific card when
 * one exists, and offering one number for a charge type that several cards price would be a lie.
 */
export function meetingCreditRates<T extends MeetingRateCardLike>(
  cards: readonly T[],
): { chargeType: MeetingCreditChargeType; card: T | null }[] {
  return MEETING_CREDIT_CHARGE_TYPES.map((chargeType) => ({
    chargeType,
    card:
      cards.find(
        (card) =>
          card.chargeType === chargeType &&
          card.currency.trim().toUpperCase() === "CRD" &&
          card.unit === "second" &&
          card.sourceLanguageCode == null &&
          card.targetLanguageCode == null &&
          card.isActive &&
          card.effectiveTo == null,
      ) ?? null,
  }));
}

/** A typed price, or null when it is not one the server would take. */
export function parseCreditUnitPrice(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= MAX_CREDIT_UNIT_PRICE ? value : null;
}

/**
 * Credits for one minute of speech at a per-second price. An estimate from below: every charge is
 * rounded up to a whole credit, so short sentences cost more than this.
 */
export function creditsPerMinute(unitPrice: number): number {
  return Math.round(unitPrice * 60 * 100) / 100;
}
