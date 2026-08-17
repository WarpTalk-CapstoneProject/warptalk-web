"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminPricingService } from "@/services/admin-pricing.service";
import type {
  BillingPolicyDto,
  PlanRequest,
  UpdatePricingConfigRequest,
  UpsertUsageRateCardRequest,
} from "@/types/admin-pricing";

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

/**
 * Every write invalidates the WHOLE pricing tree, not just the list it changed.
 *
 * The three are not independent. `PricingConfigDto` carries the minimum contract price and the
 * price floor per credit that `ValidatePlanRequest` checks a plan against, and the FX rate the
 * rate-card screen reads a USD provider cost through — so lowering a floor changes which plans are
 * valid, and a stale plans list would keep showing the old answer. Five minutes of staleness is
 * fine for reading; it is not fine for reading back what you just wrote.
 */
function useInvalidateAdminPricing() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
}

export function useUpdateAdminPlan() {
  const invalidate = useInvalidateAdminPricing();
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: PlanRequest }) =>
      adminPricingService.updatePlan(id, request),
    onSuccess: invalidate,
  });
}

export function useAdminBillingPolicy() {
  return useQuery({
    queryKey: ["admin-pricing", "billing-policy"] as const,
    queryFn: () => adminPricingService.getBillingPolicy(),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateAdminBillingPolicy() {
  const invalidate = useInvalidateAdminPricing();
  return useMutation({
    mutationFn: (request: BillingPolicyDto) =>
      adminPricingService.updateBillingPolicy(request),
    onSuccess: invalidate,
  });
}

export function useCreateAdminPlan() {
  const invalidate = useInvalidateAdminPricing();
  return useMutation({
    mutationFn: (request: PlanRequest) => adminPricingService.createPlan(request),
    onSuccess: invalidate,
  });
}

export function useUpsertAdminRateCard() {
  const invalidate = useInvalidateAdminPricing();
  return useMutation({
    mutationFn: (request: UpsertUsageRateCardRequest) =>
      adminPricingService.upsertRateCard(request),
    onSuccess: invalidate,
  });
}

export function useUpdateAdminPricingConfig() {
  const invalidate = useInvalidateAdminPricing();
  return useMutation({
    mutationFn: (request: UpdatePricingConfigRequest) =>
      adminPricingService.updatePricingConfig(request),
    onSuccess: invalidate,
  });
}
