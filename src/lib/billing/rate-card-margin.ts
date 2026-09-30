/**
 * What margin a rate card is actually reporting — and when it is honest to report one at all.
 *
 * This exists because the obvious calculation is wrong. `unitPrice` is denominated in the card's
 * own `currency` (VND for everything the platform currently sells), while `providerUnitCostUsd`
 * is, by its name, in USD. Dividing one by the other is a category error: it produces a number
 * that looks like a margin, is off by the exchange rate, and would be believed.
 *
 * The multiplier is a STORED column, so the normal answer is simply to report it. Everything else
 * here is about refusing to invent one.
 *
 * Deliberately free of React so `node:test` can exercise it without a renderer.
 */

export interface RateCardLike {
  unitPrice: number;
  currency: string;
  providerUnitCostUsd: number | null;
  markupMultiplier: number | null;
}

export type MarginSource =
  /** Read from the stored markup_multiplier column. */
  | "recorded"
  /** Computed from price and cost, which is only sound when both are the same currency. */
  | "derived"
  /** No sound answer exists; `reason` says which of the two ways. */
  | "unavailable";

export interface RateCardMargin {
  value: number | null;
  source: MarginSource;
  /** Present only when unavailable — what to say instead of a number. */
  reason?: "no-cost-recorded" | "currency-mismatch";
}

/**
 * Precedence: recorded, then derived, then nothing.
 *
 * "Derived" is allowed only when the card's own currency is USD, because that is the only case in
 * which price and cost are the same unit. On a VND card with a USD cost the honest output is a
 * dash and an explanation — not a number scaled by whatever the exchange rate happens to be.
 *
 * A recorded multiplier wins even when a derivation is possible: it is what pricing decided, and
 * a screen that silently recomputed it would be reporting a second opinion as fact.
 */
export function resolveRateCardMargin(card: RateCardLike): RateCardMargin {
  if (card.markupMultiplier != null) {
    return { value: card.markupMultiplier, source: "recorded" };
  }

  if (card.providerUnitCostUsd == null || card.providerUnitCostUsd === 0) {
    return { value: null, source: "unavailable", reason: "no-cost-recorded" };
  }

  if (card.currency.toUpperCase() !== "USD") {
    return { value: null, source: "unavailable", reason: "currency-mismatch" };
  }

  return { value: card.unitPrice / card.providerUnitCostUsd, source: "derived" };
}

/**
 * How a margin reads on screen.
 *
 * Thin margins are the reason this column exists, so the bands are set where a decision changes:
 * below 1 the platform is selling at a loss, and below 1.5 it is close enough that a provider
 * price rise erases it.
 */
export function marginTone(margin: RateCardMargin): "loss" | "thin" | "healthy" | "unknown" {
  if (margin.value == null) return "unknown";
  if (margin.value < 1) return "loss";
  if (margin.value < 1.5) return "thin";
  return "healthy";
}

/** The dash and its explanation, so an absent margin never reads as a margin of zero. */
export function marginLabel(margin: RateCardMargin): string {
  if (margin.value != null) return `${margin.value.toFixed(1)}×`;
  return margin.reason === "currency-mismatch" ? "not comparable" : "no cost recorded";
}

/**
 * The internal credit-unit cards — the ones billing_worker actually settles usage on. Their
 * `unitPrice` is credits per unit, set by hand, not derived from a provider cost; so the only thing
 * worth editing on one is the provider cost, which is what admin Insights reads to compute AI
 * provider cost. The full editor would reprice them from cost × markup, which is wrong for them.
 */
export function isCreditRateCard(card: { currency: string }): boolean {
  return card.currency.trim().toUpperCase() === "CRD";
}

/**
 * What saving a provider cost on a credit card does to history, mirroring the server:
 *
 * - "backfill"  — the card has no cost yet. It is recorded on the card itself, so the usage already
 *   settled on it becomes costable. A missing fact, not a price change.
 * - "supersede" — the card has a different cost. A new version takes effect now and the usage
 *   already settled keeps the cost that applied to it.
 * - "unchanged" — same number; nothing is written.
 */
export function providerCostEffect(
  card: { providerUnitCostUsd: number | null },
  nextCostUsd: number,
): "backfill" | "supersede" | "unchanged" {
  if (card.providerUnitCostUsd == null) return "backfill";
  return card.providerUnitCostUsd === nextCostUsd ? "unchanged" : "supersede";
}

/**
 * A provider cost typed by an admin: a positive USD amount, or null. Zero is refused on purpose —
 * no provider in the pipeline is free, and the server would reject it as a claim that one is.
 */
export function parseProviderCostUsd(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d*\.?\d+(e-?\d+)?$/i.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

