/**
 * G11 — the sellable catalog beyond plans: credit packs, add-ons and coupons.
 *
 * Mirrors WarpTalk.BillingService.Application.DTOs.PackageCatalogDtos. Money is a number in the
 * currency's own unit (VND whole dong, USD dollars) with a lower-case currency code.
 */

export type PackageStatus = "draft" | "active" | "archived";
export type PackVisibility = "public" | "plans" | "workspaces";
export type CatalogItemType = "plan" | "credit_pack" | "addon";
export type DiscountType = "percent" | "fixed";
export type CouponDuration = "once" | "repeating" | "forever";
export type CatalogCurrency = "vnd" | "usd";
export type SyncState = "not_synced" | "synced" | "outdated" | "error";

export interface MoneyDto {
  currency: string;
  amount: number;
}

export interface StripeSyncStatusDto {
  state: SyncState;
  productId: string | null;
  priceIds: Record<string, string>;
  syncedAt: string | null;
  error: string | null;
}

export interface CreditPackRequest {
  slug: string;
  name: string;
  description: string | null;
  credits: number;
  bonusCredits: number;
  priceVnd: number | null;
  priceUsd: number | null;
  validityDays: number | null;
  visibility: PackVisibility;
  eligiblePlanIds: string[];
  eligibleWorkspaceIds: string[];
  maxPerWorkspace: number | null;
  maxTotal: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  status: Exclude<PackageStatus, "archived">;
  sortOrder: number;
}

export interface CreditPackDto extends Omit<CreditPackRequest, "status"> {
  id: string;
  status: PackageStatus;
  stripe: StripeSyncStatusDto;
  unitsSold: number;
  revenue: MoneyDto[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AddonRequest {
  slug: string;
  name: string;
  description: string | null;
  unitLabel: string;
  entitlementKey: string;
  unitsPerQuantity: number;
  priceMonthlyVnd: number | null;
  priceYearlyVnd: number | null;
  priceMonthlyUsd: number | null;
  priceYearlyUsd: number | null;
  minQuantity: number;
  maxQuantity: number;
  eligiblePlanIds: string[];
  status: Exclude<PackageStatus, "archived">;
  sortOrder: number;
}

export interface AddonDto extends Omit<AddonRequest, "status"> {
  id: string;
  status: PackageStatus;
  stripe: StripeSyncStatusDto;
  unitsSold: number;
  activeSubscribers: number;
  activeQuantity: number;
  revenue: MoneyDto[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CouponRequest {
  code: string | null;
  name: string;
  discountType: DiscountType;
  percentOff: number | null;
  amountOff: number | null;
  amountOffCurrency: CatalogCurrency | null;
  appliesToTypes: CatalogItemType[];
  appliesToIds: string[];
  duration: CouponDuration;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  perWorkspaceLimit: number;
  validFrom: string | null;
  validUntil: string | null;
  autoApply: boolean;
  status: Exclude<PackageStatus, "archived">;
}

export interface CouponDto extends Omit<CouponRequest, "status"> {
  id: string;
  status: PackageStatus;
  stripe: StripeSyncStatusDto;
  stripePromotionCodeId: string | null;
  redemptions: number;
  discountGiven: MoneyDto[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface StripeDriftItemDto {
  field: string;
  database: string | null;
  stripe: string | null;
}

export interface StripeDriftDto {
  itemType: string;
  itemId: string;
  syncState: SyncState;
  stripeReachable: boolean;
  checkedAt: string;
  differences: StripeDriftItemDto[];
  error: string | null;
}

export interface PackageCatalogOptionsDto {
  addonEntitlementKeys: string[];
  numericEntitlementKeys: string[];
  currencies: string[];
  minimumCharges: MoneyDto[];
  stripeConfigured: boolean;
}

// ── Customer catalog ─────────────────────────────────────────────────────────

export interface CatalogPriceDto {
  currency: string;
  billingCycle: "monthly" | "yearly" | null;
  amount: number;
  discountedAmount: number | null;
  autoCouponName: string | null;
}

export interface CatalogCreditPackDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  credits: number;
  bonusCredits: number;
  validityDays: number | null;
  prices: CatalogPriceDto[];
  purchasesRemaining: number | null;
  availableUntil: string | null;
}

export interface CatalogAddonDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unitLabel: string;
  entitlementKey: string;
  unitsPerQuantity: number;
  minQuantity: number;
  maxQuantity: number;
  prices: CatalogPriceDto[];
  owned: boolean;
}

export interface WorkspaceAddonDto {
  id: string;
  addonId: string;
  name: string;
  unitLabel: string;
  entitlementKey: string;
  quantity: number;
  unitsGranted: number;
  billingCycle: string;
  currency: string;
  unitPrice: number;
  status: "active" | "cancelling" | "cancelled";
  currentPeriodEnd: string | null;
  startedAt: string;
}

export interface WorkspaceCatalogDto {
  workspaceId: string;
  currency: string;
  hasSubscription: boolean;
  hasActivePlan: boolean;
  planSlug: string | null;
  creditPacks: CatalogCreditPackDto[];
  addons: CatalogAddonDto[];
  activeAddons: WorkspaceAddonDto[];
}

export interface CouponPreviewRequest {
  code: string | null;
  itemType: CatalogItemType;
  itemId: string | null;
  currency: string;
  billingCycle: string | null;
  quantity: number;
  listPrice: number | null;
}

export interface CouponPreviewDto {
  valid: boolean;
  error: string | null;
  couponId: string | null;
  code: string | null;
  name: string | null;
  autoApplied: boolean;
  currency: string;
  listPrice: number;
  discount: number;
  total: number;
  duration: string | null;
  durationInMonths: number | null;
}
