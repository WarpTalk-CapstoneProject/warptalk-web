/**
 * Contracts and manual (bank-transfer) billing, as the system-admin portal sees them.
 *
 * Every shape here is read off the billing service's own records, not guessed:
 *   AdminContractSubscriptionDto        SubscriptionDtos.cs  `SubscriptionDto`
 *   ContractTermsRequest                SubscriptionDtos.cs  `UpdateSubscriptionContractTermsRequest`
 *   CreateContractSubscriptionRequest   SubscriptionDtos.cs  `CreateWorkspaceContractSubscriptionRequest`
 *   RateCardPreviewRequest / Dto        UsageRateCardDtos.cs
 */

import type { SubscriptionDto } from "@/types/billing";

/**
 * The body `PUT /subscriptions/workspace/{id}/contract-terms` takes — and the `contractTerms` of a
 * create.
 *
 * A REPLACEMENT of all six: `ApplyContractTerms` assigns every field, so a null here is not
 * "unchanged", it is "clear the override and fall back to the plan". Build it from the stored
 * subscription (`draftFromSubscription`) so an edit to one field does not reset the other five.
 *
 * `contractPriceUsd` is USD (the accounting currency) by name and by the server's reading of it —
 * `AdminSubscriptionRevenue` labels it USD regardless of the plan's own currency.
 */
export interface ContractTermsRequest {
  creditsPerCycleOverride: number | null;
  contractPriceUsd: number | null;
  overageCapCreditsOverride: number | null;
  overagePricePerCreditOverride: number | null;
  invoiceTermsDaysOverride: number | null;
  billingContactEmail: string | null;
}

export interface CreateContractSubscriptionRequest {
  workspaceId: string;
  planId: string;
  contractTerms: ContractTermsRequest;
  /**
   * Who the subscription notifies. Optional on the wire, but the mapper stores `Guid.Empty` when
   * it is missing, so the portal always sends the workspace owner.
   */
  userId: string;
}

/**
 * `SubscriptionDto` with the contract columns the shared web type does not carry. Every field is
 * on the wire today; they are optional here only because the shared type predates them.
 */
export interface AdminContractSubscriptionDto extends SubscriptionDto {
  creditsPerCycleOverride?: number | null;
  contractPriceUsd?: number | null;
  overageCapCreditsOverride?: number | null;
  overagePricePerCreditOverride?: number | null;
  invoiceTermsDaysOverride?: number | null;
  billingContactEmail?: string | null;
  effectiveCreditsPerCycle?: number;
  /** One cycle's price: the negotiated USD price, else the plan's price in the plan's currency. */
  effectiveContractPrice?: number;
  /** Upper-case currency of `effectiveContractPrice` ("USD", "VND"). */
  effectiveContractCurrency?: string;
  effectiveOverageCapCredits?: number;
  effectiveOveragePricePerCredit?: number;
  effectiveInvoiceTermsDays?: number;
  overageCreditsThisCycle?: number;
  /** "healthy" | "suspended". */
  serviceState?: string;
  /** e.g. "invoice_overdue", "overage_cap". */
  suspendedReason?: string | null;
  trialEndsAt?: string | null;
}

/** `POST /usages/rate-card/preview`. The credit value falls back to the stored config; no FX is involved. */
export interface RateCardPreviewRequest {
  providerUnitCostUsd: number;
  markupMultiplier: number;
  quantity?: number;
}

export interface RateCardPreviewDto {
  unitPriceCredits: number;
  creditsCharged: number;
  customerPriceUsd: number;
  providerCostUsd: number;
  marginUsd: number;
  marginRatio: number;
  creditValueUsd: number;
  formula: string;
}
