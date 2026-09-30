import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AddonDto,
  AddonRequest,
  CouponDto,
  CouponRequest,
  CreditPackDto,
  CreditPackRequest,
  PackageCatalogOptionsDto,
  StripeDriftDto,
} from "@/types/admin-packages";

/** The three catalog kinds share one set of verbs; the path segment is what differs. */
export type PackageKind = "credit-packs" | "addons" | "coupons";

export type DtoOf<K extends PackageKind> = K extends "credit-packs" ? CreditPackDto : K extends "addons" ? AddonDto : CouponDto;
export type RequestOf<K extends PackageKind> = K extends "credit-packs"
  ? CreditPackRequest
  : K extends "addons"
    ? AddonRequest
    : CouponRequest;

function base(kind: PackageKind): string {
  return kind === "credit-packs"
    ? API.adminPackages.creditPacks
    : kind === "addons"
      ? API.adminPackages.addons
      : API.adminPackages.coupons;
}

function item(kind: PackageKind, id: string): string {
  return kind === "credit-packs"
    ? API.adminPackages.creditPack(id)
    : kind === "addons"
      ? API.adminPackages.addon(id)
      : API.adminPackages.coupon(id);
}

/**
 * G11 — /admin/packages. There is no delete: a sold item is referenced by purchases,
 * subscriptions, redemptions and Stripe objects that must never be deleted, so it is archived.
 */
export const adminPackagesService = {
  getOptions: async (): Promise<PackageCatalogOptionsDto> => {
    const { data } = await apiClient.get<PackageCatalogOptionsDto>(API.adminPackages.options);
    return data;
  },

  list: async <K extends PackageKind>(kind: K): Promise<DtoOf<K>[]> => {
    const { data } = await apiClient.get<DtoOf<K>[]>(base(kind));
    return data;
  },

  create: async <K extends PackageKind>(kind: K, request: RequestOf<K>): Promise<DtoOf<K>> => {
    const { data } = await apiClient.post<DtoOf<K>>(base(kind), request);
    return data;
  },

  update: async <K extends PackageKind>(kind: K, id: string, request: RequestOf<K>): Promise<DtoOf<K>> => {
    const { data } = await apiClient.put<DtoOf<K>>(item(kind, id), request);
    return data;
  },

  duplicate: async <K extends PackageKind>(kind: K, id: string): Promise<DtoOf<K>> => {
    const { data } = await apiClient.post<DtoOf<K>>(`${item(kind, id)}/duplicate`);
    return data;
  },

  setArchived: async <K extends PackageKind>(kind: K, id: string, archived: boolean): Promise<DtoOf<K>> => {
    const { data } = await apiClient.post<DtoOf<K>>(`${item(kind, id)}/${archived ? "archive" : "unarchive"}`);
    return data;
  },

  /** Creates or updates the Stripe Product/Prices (or Coupon/Promotion code). Never deletes. */
  syncToStripe: async <K extends PackageKind>(kind: K, id: string): Promise<DtoOf<K>> => {
    const { data } = await apiClient.post<DtoOf<K>>(`${item(kind, id)}/stripe-sync`);
    return data;
  },

  /** Read-only comparison of the database row against what Stripe holds. */
  getDrift: async (kind: PackageKind, id: string): Promise<StripeDriftDto> => {
    const { data } = await apiClient.get<StripeDriftDto>(`${item(kind, id)}/stripe-drift`);
    return data;
  },
};
