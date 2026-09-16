import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminContractSubscriptionDto,
  ContractTermsRequest,
  CreateContractSubscriptionRequest,
} from "@/types/admin-contract-billing";
import type { InvoiceDto, PagedResult } from "@/types/billing";

/**
 * Contracts and bank-transfer reconciliation for one workspace, from the admin workspace page.
 *
 * Every call reaches an endpoint that already existed and is gated server-side: the writes on
 * `[Authorize(Roles = "Admin, admin")]`, the reads on `RequireWorkspaceRole`, which lets a platform
 * admin through before it asks about membership.
 *
 * What is deliberately NOT here: `POST /payments`. It does not record money received. It creates a
 * PENDING payment priced at the plan's list price (never the contract price), attaches no invoice,
 * and nothing can settle it afterwards — mark-paid works on invoices. Wiring it would put a
 * wrong-amount row in the ledger that reads like a reconciliation. The invoice a contract owes is
 * raised by the billing-cycle close; settling THAT invoice is the reconciliation.
 */
export const adminContractBillingService = {
  /** The active subscription, or a 400 carrying BILLING_SUBSCRIPTION_NOT_FOUND when there is none. */
  getActiveSubscription: async (workspaceId: string): Promise<AdminContractSubscriptionDto> => {
    const { data } = await apiClient.get<AdminContractSubscriptionDto>(
      API.adminSubscriptions.active(workspaceId),
    );
    return data;
  },

  /** Refused while the workspace has any active subscription, a trial included. */
  createContract: async (
    request: CreateContractSubscriptionRequest,
  ): Promise<AdminContractSubscriptionDto> => {
    const { data } = await apiClient.post<AdminContractSubscriptionDto>(
      API.adminSubscriptions.createContract,
      request,
    );
    return data;
  },

  /** A REPLACEMENT of all six overrides — build the body from the stored subscription. */
  updateContractTerms: async (
    workspaceId: string,
    request: ContractTermsRequest,
  ): Promise<AdminContractSubscriptionDto> => {
    const { data } = await apiClient.put<AdminContractSubscriptionDto>(
      API.adminSubscriptions.contractTerms(workspaceId),
      request,
    );
    return data;
  },

  /**
   * Lift a service suspension. Marking an overdue invoice paid does not do this on its own — the
   * sweeper only ever suspends — so reconciliation offers it as the next step.
   */
  resumeService: async (workspaceId: string, reason: string): Promise<void> => {
    await apiClient.post(API.adminSubscriptions.resume(workspaceId), { reason });
  },

  getInvoices: async (
    workspaceId: string,
    pageNumber: number,
    pageSize: number,
  ): Promise<PagedResult<InvoiceDto>> => {
    const { data } = await apiClient.get<PagedResult<InvoiceDto>>(
      API.adminInvoices.workspace(workspaceId),
      { params: { pageNumber, pageSize } },
    );
    return data;
  },

  /** No body: the endpoint records neither who nor which bank reference. */
  markInvoicePaid: async (invoiceId: string): Promise<InvoiceDto> => {
    const { data } = await apiClient.post<InvoiceDto>(API.adminInvoices.markPaid(invoiceId));
    return data;
  },
};
