"use client";

import { useQuery } from "@tanstack/react-query";

import { billingService } from "@/services/billing.service";

/**
 * The platform VAT rate, for printing "+ VAT" beside a price (3 Oct 2026).
 *
 * `vatPercent` is null until it has loaded or when it could not be read: a card then shows the
 * price as before rather than inventing a rate. Long stale time — it changes when an operator edits
 * a platform setting, not during a page view.
 */
export function usePlanTax(): { vatPercent: number | null } {
  const { data } = useQuery({
    queryKey: ["plans", "tax"],
    queryFn: () => billingService.getPlanTax(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  return { vatPercent: typeof data?.vatPercent === "number" ? data.vatPercent : null };
}
