import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { PlanDto } from "@/types/billing";
import type {
  BillingPolicyDto,
  PlanRequest,
  PricingConfigDto,
  UpdatePricingConfigRequest,
  UpsertUsageRateCardRequest,
  UsageRateCardDto,
} from "@/types/admin-pricing";

/**
 * The platform catalogue and the rate cards behind it.
 *
 * Every endpoint here already existed and was already gated on the platform admin role. The reads
 * were wired first and the writes are wired now; nothing on this service is new to the API.
 *
 * What it cannot do is as load-bearing as what it can:
 *
 *   - There is no `deletePlan`. There is no DELETE either, and there should not be: a plan is
 *     named on every invoice raised against it, so retiring one means `isActive: false` and
 *     leaving the row where the history can still point at it.
 *   - `upsertRateCard` cannot introduce a rate card. The service refuses an identity it has not
 *     seen before — a new charge type also arrives by migration. It edits the price, the cost,
 *     the margin and whether the card is live.
 */
export const adminPricingService = {
  /** Every plan, deactivated ones included. Its own route, not a flag on the public list. */
  getAllPlans: async (): Promise<PlanDto[]> => {
    const { data } = await apiClient.get<PlanDto[]>(API.adminPricing.allPlans);
    return data;
  },

  getRateCards: async (): Promise<UsageRateCardDto[]> => {
    const { data } = await apiClient.get<UsageRateCardDto[]>(API.adminPricing.rateCard);
    return data;
  },

  getPricingConfig: async (): Promise<PricingConfigDto> => {
    const { data } = await apiClient.get<PricingConfigDto>(API.adminPricing.pricingConfig);
    return data;
  },

  getBillingPolicy: async (): Promise<BillingPolicyDto> => {
    const { data } = await apiClient.get<BillingPolicyDto>(API.adminPricing.billingPolicy);
    return data;
  },

  updateBillingPolicy: async (request: BillingPolicyDto): Promise<BillingPolicyDto> => {
    const { data } = await apiClient.put<BillingPolicyDto>(
      API.adminPricing.billingPolicy,
      request,
    );
    return data;
  },

  /**
   * Replace a plan.
   *
   * A REPLACEMENT, not a patch — the server writes all twenty-two columns from this body. Build
   * the argument with `planRequestFromDto` / `applyPlanEdits`; assembling it from a form's own
   * fields is how the overage and invoicing columns get reset to defaults without anyone noticing.
   */
  updatePlan: async (id: string, request: PlanRequest): Promise<PlanDto> => {
    const { data } = await apiClient.put<PlanDto>(API.adminPricing.plan(id), request);
    return data;
  },

  /** Create a catalogue entry. Same validation as the PUT; duplicate slugs are refused. */
  createPlan: async (request: PlanRequest): Promise<PlanDto> => {
    const { data } = await apiClient.post<PlanDto>(API.adminPricing.plans, request);
    return data;
  },

  /**
   * Update a rate card, matched on its identity columns.
   *
   * Send the identity back exactly as it was read. The service looks the combination up and
   * refuses one it does not recognise rather than creating it.
   */
  upsertRateCard: async (request: UpsertUsageRateCardRequest): Promise<UsageRateCardDto> => {
    const { data } = await apiClient.put<UsageRateCardDto>(API.adminPricing.rateCard, request);
    return data;
  },

  updatePricingConfig: async (
    request: UpdatePricingConfigRequest,
  ): Promise<PricingConfigDto> => {
    const { data } = await apiClient.put<PricingConfigDto>(
      API.adminPricing.pricingConfig,
      request,
    );
    return data;
  },
};
