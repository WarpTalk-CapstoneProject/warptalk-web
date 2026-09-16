/**
 * When a rate-card edit has been previewed, and when that preview has gone stale.
 *
 * The rate-card editor changes what real usage is charged. `POST /usages/rate-card/preview` prices
 * a provider cost and markup without publishing, so the editor requires one before it saves a
 * change to either — and a preview of different numbers than the ones being saved is no preview.
 *
 * Deliberately free of React so `node:test` can exercise it without a renderer.
 */

export interface PricingInputs {
  providerUnitCostUsd: number | null;
  markupMultiplier: number | null;
}

/** The two inputs the preview endpoint needs, or null when either is missing or unusable. */
export function previewableInputs(inputs: PricingInputs): { providerUnitCostUsd: number; markupMultiplier: number } | null {
  const { providerUnitCostUsd: cost, markupMultiplier: markup } = inputs;
  if (cost == null || markup == null) return null;
  if (!Number.isFinite(cost) || !Number.isFinite(markup)) return null;
  // The calculator refuses these with ArgumentOutOfRange; asking would only manufacture a 400.
  if (cost < 0 || markup <= 0) return null;
  return { providerUnitCostUsd: cost, markupMultiplier: markup };
}

function sameNumber(a: number | null, b: number | null): boolean {
  return a === b || (a != null && b != null && Math.abs(a - b) < 1e-12);
}

/** Whether the draft moved either pricing input away from what is stored. */
export function pricingInputsChanged(stored: PricingInputs, draft: PricingInputs): boolean {
  return (
    !sameNumber(stored.providerUnitCostUsd, draft.providerUnitCostUsd) ||
    !sameNumber(stored.markupMultiplier, draft.markupMultiplier)
  );
}

/**
 * Whether Save may proceed.
 *
 * - Neither input changed: yes — a price or Active-switch edit needs no preview.
 * - An input changed and a preview exists for EXACTLY the draft's inputs: yes.
 * - An input was cleared to blank: yes. Blank means "not recorded", which no preview can price,
 *   and refusing it would make an honest "we do not know the cost" unsaveable.
 * - Otherwise: no.
 */
export function canSaveRateCard(
  stored: PricingInputs,
  draft: PricingInputs,
  previewedFor: PricingInputs | null,
): { ok: true } | { ok: false; reason: "preview-required" | "preview-stale" } {
  if (!pricingInputsChanged(stored, draft)) return { ok: true };
  if (previewableInputs(draft) == null) return { ok: true };
  if (previewedFor == null) return { ok: false, reason: "preview-required" };
  if (pricingInputsChanged(previewedFor, draft)) return { ok: false, reason: "preview-stale" };
  return { ok: true };
}

/** A margin ratio as a percentage with a sign that cannot be missed on a loss. */
export function formatMarginRatio(ratio: number): string {
  const percent = ratio * 100;
  return `${percent < 0 ? "−" : ""}${Math.abs(percent).toFixed(1)}%`;
}
