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

/**
 * The body `PUT /plans/{id}` takes.
 *
 * A WHOLE plan, not a patch: PlanService writes every one of these onto the row through
 * `UpdateFromRequest`, so a field left out of the JSON is not "unchanged" — it takes the C#
 * record's default and overwrites what was stored. Build it with `planRequestFromDto` rather than
 * by hand; that is where the completeness is enforced and tested.
 *
 * `billingCycle` is typed as a string to match the wire, but the server accepts only "monthly" on
 * this route — see PLAN_BILLING_CYCLE.
 */
export interface PlanRequest {
  name: string;
  slug: string;
  tier: string;
  price: number;
  currency: string;
  billingCycle: string;
  creditsPerCycle: number;
  maxParticipants: number;
  features: string;
  sortOrder: number;
  overageCapCredits: number;
  overagePricePerCredit: number;
  lowBalanceThresholdCredits: number;
  rolloverCapCredits: number;
  invoiceTermsDays: number;
  invoiceGraceHours: number;
  isActive: boolean;
  maxLanguages: number;
  voiceCloneEnabled: boolean;
  aiAssistantEnabled: boolean;
  glossaryEnabled: boolean;
  dedicatedGpu: boolean;
}

/**
 * The body `PUT /usages/rate-card` takes.
 *
 * The first six fields are the IDENTITY the upsert matches on, not editable values. The service
 * refuses a combination it has never seen — `RateCardIdentityExistsAsync`, whose failure message
 * says a new billing identity has to arrive through a migration — so a form that let an admin
 * retype them would be offering to create rate cards it cannot create. Send them back unchanged.
 */
export interface UpsertUsageRateCardRequest {
  chargeType: string;
  unit: string;
  provider: string;
  model: string;
  sourceLanguageCode: string | null;
  targetLanguageCode: string | null;
  unitPrice: number;
  currency: string;
  providerUnitCostUsd: number | null;
  markupMultiplier: number | null;
  isActive?: boolean;
}

/**
 * The body `PUT /usages/pricing-config` takes.
 *
 * `PricingConfigDto` minus `formula` and `resolverKey` — those two describe how the config is
 * resolved rather than what it holds, and the endpoint does not accept them.
 */
export interface UpdatePricingConfigRequest {
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
}

/** Platform-wide pricing knobs. Editable through `PUT /usages/pricing-config`. */
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

/** Platform billing policy. One knob today; the endpoint replaces the whole record. */
export interface BillingPolicyDto {
  vatRate: number;
}
