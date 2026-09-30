import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CouponPreviewDto,
  CouponPreviewRequest,
  WorkspaceAddonDto,
  WorkspaceCatalogDto,
} from "@/types/admin-packages";

/**
 * G11 — the customer side of the catalog. Purchases themselves go through
 * billingService.createCheckoutSession (paymentType CreditPack / AddOn); the server prices them.
 */
export const billingCatalogService = {
  getCatalog: async (workspaceId: string): Promise<WorkspaceCatalogDto> => {
    const { data } = await apiClient.get<WorkspaceCatalogDto>(API.billingCatalog.catalog(workspaceId));
    return data;
  },

  previewCoupon: async (workspaceId: string, request: CouponPreviewRequest): Promise<CouponPreviewDto> => {
    const { data } = await apiClient.post<CouponPreviewDto>(API.billingCatalog.couponPreview(workspaceId), request);
    return data;
  },

  cancelAddon: async (workspaceId: string, workspaceAddonId: string): Promise<WorkspaceAddonDto> => {
    const { data } = await apiClient.post<WorkspaceAddonDto>(API.billingCatalog.cancelAddon(workspaceId, workspaceAddonId));
    return data;
  },
};
