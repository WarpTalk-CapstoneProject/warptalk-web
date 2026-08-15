"use client";

import { useQuery } from "@tanstack/react-query";

import { adminPricingService } from "@/services/admin-pricing.service";

export const ADMIN_PRICING_KEYS = {
  plans: ["admin-pricing", "plans"] as const,
  rateCards: ["admin-pricing", "rate-cards"] as const,
  config: ["admin-pricing", "config"] as const,
};

/** The catalogue changes rarely, so these are cached longer than the operational screens. */
export function useAdminPlans() {
  return useQuery({
    queryKey: ADMIN_PRICING_KEYS.plans,
    queryFn: () => adminPricingService.getAllPlans(),
    staleTime: 5 * 60_000,
  });
}

export function useAdminRateCards() {
  return useQuery({
    queryKey: ADMIN_PRICING_KEYS.rateCards,
    queryFn: () => adminPricingService.getRateCards(),
    staleTime: 5 * 60_000,
  });
}

export function useAdminPricingConfig() {
  return useQuery({
    queryKey: ADMIN_PRICING_KEYS.config,
    queryFn: () => adminPricingService.getPricingConfig(),
    staleTime: 5 * 60_000,
  });
}
