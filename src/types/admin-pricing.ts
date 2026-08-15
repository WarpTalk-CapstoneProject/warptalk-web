/**
 * Contracts for the system-admin pricing screens.
 *
 * Both endpoints already existed and were gated on the platform admin role; nothing rendered
 * them. `PlanDto` is reused from `@/types/billing` — the catalogue an admin edits is the same
 * catalogue a workspace buys from, and a second shape for it would drift.
 */

/**
 * One rate card row.
 *
 * `unitPrice` is denominated in `currency`; `providerUnitCostUsd` is, by its name, in USD. The two
 * are NOT comparable unless `currency` is USD — see lib/billing/rate-card-margin.ts, which is
 * where that rule lives rather than in a component.
 */
export interface UsageRateCardDto {
  id: string;
  chargeType: string;
  unit: string;
  provider: string;
  model: string;
  sourceLanguageCode: string | null;
  targetLanguageCode: string | null;
  unitPrice: number;
  currency: string;
  providerUnitCostUsd: number | null;
  /** The margin pricing recorded. Null when nobody stated one. */
  markupMultiplier: number | null;
  effectiveFrom: string;
  /** Null while this row is the one in force. */
  effectiveTo: string | null;
  isActive: boolean;
}

/** Platform-wide pricing knobs. Read-only here; editing them is its own decision. */
export interface PricingConfigDto {
  fxRateUsdVnd: number;
  creditValueVnd: number;
  minimumPricePerCreditVnd: number;
  minimumContractPriceVnd: number;
  minimumContractPriceUsd: number;
  salesUsageWeight: number;
  salesMembersWeight: number;
  salesLanguagesWeight: number;
  salesAiServicesWeight: number;
  defaultOverageCapRatio: number;
  defaultInvoiceTermsDays: number;
  defaultInvoiceGraceHours: number;
  formula: string;
  resolverKey: string;
}
