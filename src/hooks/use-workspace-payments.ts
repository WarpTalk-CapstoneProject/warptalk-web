"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { billingService } from "@/services/billing.service";

export const WORKSPACE_PAYMENT_KEYS = {
  history: (workspaceId: string, page: number, pageSize: number) =>
    ["billing", "payments", workspaceId, page, pageSize] as const,
};

/**
 * One page of the workspace's payment history.
 *
 * No local `retry`: the global policy already refuses 4xx and retries server faults, and a local
 * override would re-enable retrying the 403 and "no subscription" answers this page renders as
 * states rather than errors. `placeholderData` keeps the previous page on screen while the next
 * one loads, so a page turn does not flash the empty state.
 */
export function useWorkspacePaymentHistory(
  workspaceId: string | null | undefined,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: WORKSPACE_PAYMENT_KEYS.history(workspaceId ?? "", page, pageSize),
    queryFn: () => billingService.getWorkspacePaymentHistory(workspaceId!, page, pageSize),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/**
 * Open Stripe checkout for one invoice and leave the app for it.
 *
 * `window.location.assign` rather than the router: the URL is Stripe's, and the return trip lands
 * on the payment success page, which settles the payment (and so the invoice) on arrival — the
 * same idiom the top-up and plan checkouts use. Nothing is invalidated here because this page is
 * about to be unloaded; the invoice list refetches when the owner comes back.
 */
export function useInvoiceCheckout() {
  return useMutation({
    mutationFn: (invoiceId: string) => billingService.createInvoiceCheckout(invoiceId),
    onSuccess: (url) => {
      if (url) window.location.assign(url);
    },
  });
}
