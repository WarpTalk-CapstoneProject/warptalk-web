"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { billingCatalogService } from "@/services/billing-catalog.service";
import type { CouponPreviewRequest } from "@/types/admin-packages";

export const BILLING_CATALOG_KEYS = {
  catalog: (workspaceId: string) => ["billing", "catalog", workspaceId] as const,
};

export function useBillingCatalog(workspaceId: string) {
  return useQuery({
    queryKey: BILLING_CATALOG_KEYS.catalog(workspaceId),
    queryFn: () => billingCatalogService.getCatalog(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
}

export function useCouponPreview(workspaceId: string) {
  return useMutation({
    mutationFn: (request: CouponPreviewRequest) => billingCatalogService.previewCoupon(workspaceId, request),
  });
}

export function useCancelWorkspaceAddon(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceAddonId: string) => billingCatalogService.cancelAddon(workspaceId, workspaceAddonId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["billing"] }),
  });
}
