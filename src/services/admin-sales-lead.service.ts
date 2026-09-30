import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  SalesLeadDto,
  SalesLeadPage,
  SalesLeadQuery,
  SalesLeadStatus,
} from "@/types/admin-sales-lead";

/**
 * System-admin sales lead inbox. Platform-wide and gated server-side by the system-admin policy.
 *
 * Converting a lead into a contract subscription is deliberately absent: billing already has
 * that flow, and it cancels and creates subscriptions — wiring it to a button is its own decision.
 */
export const adminSalesLeadService = {
  list: async (query: SalesLeadQuery): Promise<SalesLeadPage> => {
    const { data } = await apiClient.get<SalesLeadPage>(API.adminSalesLeads.base, {
      params: query,
    });
    return data;
  },

  updateStatus: async (id: string, status: SalesLeadStatus): Promise<SalesLeadDto> => {
    const { data } = await apiClient.patch<SalesLeadDto>(API.adminSalesLeads.status(id), {
      status,
    });
    return data;
  },
};
