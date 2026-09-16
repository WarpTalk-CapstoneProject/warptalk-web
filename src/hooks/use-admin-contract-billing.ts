"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiErrorCode } from "@/lib/api/errors";
import { adminContractBillingService } from "@/services/admin-contract-billing.service";
import type {
  ContractTermsRequest,
  CreateContractSubscriptionRequest,
} from "@/types/admin-contract-billing";

export const ADMIN_CONTRACT_BILLING_KEYS = {
  subscription: (workspaceId: string) =>
    ["admin-contract-billing", "subscription", workspaceId] as const,
  invoices: (workspaceId: string, page: number) =>
    ["admin-contract-billing", "invoices", workspaceId, page] as const,
};

export const INVOICE_PAGE_SIZE = 10;

/**
 * The active subscription, with "there is none" as a value rather than an error.
 *
 * The endpoint answers a missing subscription with a 400 whose code is
 * BILLING_SUBSCRIPTION_NOT_FOUND. That is the state in which a contract can be CREATED, so it must
 * not render as a failure — while every other error still does.
 */
export function useAdminWorkspaceSubscription(workspaceId: string) {
  return useQuery({
    queryKey: ADMIN_CONTRACT_BILLING_KEYS.subscription(workspaceId),
    queryFn: async () => {
      try {
        return await adminContractBillingService.getActiveSubscription(workspaceId);
      } catch (error) {
        if (apiErrorCode(error) === "BILLING_SUBSCRIPTION_NOT_FOUND") return null;
        throw error;
      }
    },
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useAdminWorkspaceInvoices(workspaceId: string, page: number) {
  return useQuery({
    queryKey: ADMIN_CONTRACT_BILLING_KEYS.invoices(workspaceId, page),
    queryFn: () =>
      adminContractBillingService.getInvoices(workspaceId, page, INVOICE_PAGE_SIZE),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/**
 * Every write refreshes the whole billing picture for the portal: this workspace's contract and
 * invoices, its analytics tiles, and the subscriptions directory whose revenue headline reads the
 * contract price.
 */
function useInvalidateContractBilling() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-contract-billing"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-workspaces", "analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }),
    ]);
}

export function useCreateAdminContract() {
  const invalidate = useInvalidateContractBilling();
  return useMutation({
    mutationFn: (request: CreateContractSubscriptionRequest) =>
      adminContractBillingService.createContract(request),
    onSuccess: invalidate,
  });
}

export function useUpdateAdminContractTerms(workspaceId: string) {
  const invalidate = useInvalidateContractBilling();
  return useMutation({
    mutationFn: (request: ContractTermsRequest) =>
      adminContractBillingService.updateContractTerms(workspaceId, request),
    onSuccess: invalidate,
  });
}

export function useResumeAdminWorkspaceService(workspaceId: string) {
  const invalidate = useInvalidateContractBilling();
  return useMutation({
    mutationFn: (reason: string) => adminContractBillingService.resumeService(workspaceId, reason),
    onSuccess: invalidate,
  });
}

export function useMarkAdminInvoicePaid() {
  const invalidate = useInvalidateContractBilling();
  return useMutation({
    mutationFn: (invoiceId: string) => adminContractBillingService.markInvoicePaid(invoiceId),
    onSuccess: invalidate,
  });
}
