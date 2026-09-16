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
 * `contractPriceVnd` is VND by name and by the server's reading of it — `AdminSubscriptionRevenue`
 * labels it VND regardless of the plan's own currency.
 */
export interface ContractTermsRequest {
  creditsPerCycleOverride: number | null;
  contractPriceVnd: number | null;
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
  contractPriceVnd?: number | null;
  overageCapCreditsOverride?: number | null;
  overagePricePerCreditOverride?: number | null;
  invoiceTermsDaysOverride?: number | null;
  billingContactEmail?: string | null;
  effectiveCreditsPerCycle?: number;
  effectiveContractPriceVnd?: number;
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

/** `POST /usages/rate-card/preview`. FX and credit value fall back to the stored config. */
export interface RateCardPreviewRequest {
  providerUnitCostUsd: number;
  markupMultiplier: number;
  quantity?: number;
}

export interface RateCardPreviewDto {
  unitPriceCredits: number;
  creditsCharged: number;
  customerPriceVnd: number;
  providerCostVnd: number;
  marginVnd: number;
  marginRatio: number;
  fxRateUsdVnd: number;
  creditValueVnd: number;
  formula: string;
}
