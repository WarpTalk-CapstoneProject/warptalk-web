import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { PlanDto } from "@/types/billing";
import type { PricingConfigDto, UsageRateCardDto } from "@/types/admin-pricing";

/**
 * The platform catalogue and the rate cards behind it.
 *
 * Every endpoint here already existed and was already gated on the platform admin role — this
 * service is the first thing to call them. Read-only for now: the write endpoints exist
 * (PUT /plans/{id}, PUT /usages/rate-card) and editing money is worth its own release rather
 * than arriving as a side effect of building a table.
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
};
