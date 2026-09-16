"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminSalesLeadService } from "@/services/admin-sales-lead.service";
import type { SalesLeadQuery, SalesLeadStatus } from "@/types/admin-sales-lead";

export const ADMIN_SALES_LEAD_KEYS = {
  all: ["admin-sales-leads"] as const,
  list: (query: SalesLeadQuery) => ["admin-sales-leads", "list", query] as const,
};

/** `placeholderData` keeps the previous page on screen while the next one loads. */
export function useAdminSalesLeads(query: SalesLeadQuery) {
  return useQuery({
    queryKey: ADMIN_SALES_LEAD_KEYS.list(query),
    queryFn: () => adminSalesLeadService.list(query),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/**
 * Invalidates every list, not just the row: under a status tab, a lead that changes status has
 * to leave the tab it no longer belongs to.
 */
export function useUpdateSalesLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SalesLeadStatus }) =>
      adminSalesLeadService.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_SALES_LEAD_KEYS.all }),
  });
}
