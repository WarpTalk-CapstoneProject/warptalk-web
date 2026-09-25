/**
 * G11 — the admin package forms' rules, and small pure helpers the catalog UI shares.
 *
 * These MIRROR the server (billing PackageCatalogRules): the server is the check that counts and
 * refuses anything these let through. They exist so an admin sees the problem while typing
 * instead of after a round trip. Each validator returns an i18n KEY (under
 * `adminPackages.validation`) and its values, or null — never an English sentence.
 *
 * Pure and dependency-free (relative imports only) so node:test runs it without a bundler.
 */

import type {
  AddonRequest,
  CatalogPriceDto,
  CouponRequest,
  CreditPackRequest,
  PackageStatus,
  SyncState,
} from "../../types/admin-packages.ts";

export interface ValidationIssue {
  key: string;
  values?: Record<string, string | number>;
}

/** Stripe's smallest charge per currency (VND has no minor unit). Mirrors the server. */
export const MINIMUM_CHARGE: Record<"vnd" | "usd", number> = { vnd: 12_000, usd: 0.5 };

export const ADDON_ENTITLEMENT_KEYS = [
  "max_participants",
  "max_languages",
  "max_active_rooms",
  "voice_clone",
  "ai_assistant",
  "glossary",
] as const;

export const NUMERIC_ENTITLEMENT_KEYS: readonly string[] = ["max_participants", "max_languages", "max_active_rooms"];

export function isNumericEntitlement(key: string): boolean {
  return NUMERIC_ENTITLEMENT_KEYS.includes(key);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

export function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/** A form string as a number: empty is null, garbage is NaN (and fails validation). */
export function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return Number(trimmed.replace(/,/g, ""));
}

function priceIssue(price: number | null, currency: "vnd" | "usd", field: string): ValidationIssue | null {
  if (price === null) return null;
  if (!Number.isFinite(price) || price <= 0) return { key: "pricePositive", values: { field } };
  if (currency === "vnd" ? !Number.isInteger(price) : Math.round(price * 100) !== price * 100) {
    return { key: currency === "vnd" ? "priceWholeDong" : "priceTwoDecimals", values: { field } };
  }
  if (price < MINIMUM_CHARGE[currency]) {
    return { key: "priceBelowStripeMinimum", values: { field, minimum: `${MINIMUM_CHARGE[currency]} ${currency.toUpperCase()}` } };
  }
  return null;
}

function commonIssue(slug: string, name: string, description: string | null): ValidationIssue | null {
  if (!slug || slug.length > 60 || !SLUG.test(slug)) return { key: "slug" };
  if (!name.trim() || name.trim().length > 100) return { key: "name" };
  if (description && description.length > 500) return { key: "description" };
  return null;
}

function windowIssue(from: string | null, until: string | null): ValidationIssue | null {
  if (from && until && new Date(from).getTime() >= new Date(until).getTime()) return { key: "window" };
  return null;
}

export function validateCreditPack(request: CreditPackRequest): ValidationIssue | null {
  const common = commonIssue(request.slug, request.name, request.description);
  if (common) return common;
  if (!Number.isInteger(request.credits) || request.credits <= 0) return { key: "credits" };
  if (!Number.isInteger(request.bonusCredits) || request.bonusCredits < 0) return { key: "bonusCredits" };
  if (request.priceVnd === null && request.priceUsd === null) return { key: "priceRequired" };
  const price = priceIssue(request.priceVnd, "vnd", "VND") ?? priceIssue(request.priceUsd, "usd", "USD");
  if (price) return price;
  if (request.validityDays !== null && (!Number.isInteger(request.validityDays) || request.validityDays <= 0 || request.validityDays > 3650)) {
    return { key: "validity" };
  }
  if (request.visibility === "plans" && request.eligiblePlanIds.length === 0) return { key: "visibilityPlans" };
  if (request.visibility === "workspaces" && request.eligibleWorkspaceIds.length === 0) return { key: "visibilityWorkspaces" };
  if (request.maxPerWorkspace !== null && !(request.maxPerWorkspace >= 1)) return { key: "limitPositive" };
  if (request.maxTotal !== null && !(request.maxTotal >= 1)) return { key: "limitPositive" };
  if (request.maxPerWorkspace !== null && request.maxTotal !== null && request.maxPerWorkspace > request.maxTotal) {
    return { key: "limitOrder" };
  }
  return windowIssue(request.availableFrom, request.availableUntil);
}

export function validateAddon(request: AddonRequest): ValidationIssue | null {
  const common = commonIssue(request.slug, request.name, request.description);
  if (common) return common;
  if (!request.unitLabel.trim() || request.unitLabel.trim().length > 40) return { key: "unitLabel" };
  if (!(ADDON_ENTITLEMENT_KEYS as readonly string[]).includes(request.entitlementKey)) return { key: "entitlement" };
  const numeric = isNumericEntitlement(request.entitlementKey);
  if (!Number.isInteger(request.unitsPerQuantity) || request.unitsPerQuantity < 1 || request.unitsPerQuantity > 10_000) {
    return { key: "unitsPerQuantity" };
  }
  if (!numeric && (request.unitsPerQuantity !== 1 || request.maxQuantity !== 1)) return { key: "capabilityOnce" };
  if (
    !Number.isInteger(request.minQuantity) ||
    !Number.isInteger(request.maxQuantity) ||
    request.minQuantity < 1 ||
    request.maxQuantity < request.minQuantity ||
    request.maxQuantity > 1000
  ) {
    return { key: "quantities" };
  }
  const prices = [request.priceMonthlyVnd, request.priceYearlyVnd, request.priceMonthlyUsd, request.priceYearlyUsd];
  if (prices.every((price) => price === null)) return { key: "priceRequired" };
  return (
    priceIssue(request.priceMonthlyVnd, "vnd", "VND / month") ??
    priceIssue(request.priceYearlyVnd, "vnd", "VND / year") ??
    priceIssue(request.priceMonthlyUsd, "usd", "USD / month") ??
    priceIssue(request.priceYearlyUsd, "usd", "USD / year")
  );
}

export function validateCoupon(request: CouponRequest): ValidationIssue | null {
  const code = normalizeCode(request.code);
  if (code && !CODE.test(code)) return { key: "code" };
  if (!code && !request.autoApply) return { key: "codeOrAuto" };
  if (!request.name.trim() || request.name.trim().length > 100) return { key: "name" };
  if (request.discountType === "percent") {
    const percent = request.percentOff;
    if (percent === null || !Number.isFinite(percent) || percent <= 0 || percent > 100) return { key: "percent" };
  } else {
    if (request.amountOffCurrency === null) return { key: "fixedCurrency" };
    const amount = request.amountOff;
    if (amount === null || !Number.isFinite(amount) || amount <= 0) return { key: "fixedAmount" };
    const scale = priceIssue(amount, request.amountOffCurrency, "amount");
    if (scale && scale.key !== "priceBelowStripeMinimum") return scale;
  }
  if (request.appliesToTypes.length === 0) return { key: "appliesTo" };
  if (request.duration === "repeating") {
    const months = request.durationInMonths;
    if (months === null || !Number.isInteger(months) || months < 1 || months > 36) return { key: "months" };
  } else if (request.durationInMonths !== null) {
    return { key: "months" };
  }
  if (request.maxRedemptions !== null && !(request.maxRedemptions >= 1)) return { key: "limitPositive" };
  if (!(request.perWorkspaceLimit >= 1)) return { key: "limitPositive" };
  if (request.maxRedemptions !== null && request.perWorkspaceLimit > request.maxRedemptions) return { key: "limitOrder" };
  return windowIssue(request.validFrom, request.validUntil);
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** A catalog price for this currency (and cycle, for an add-on), or null. */
export function priceFor(
  prices: readonly CatalogPriceDto[],
  currency: string,
  billingCycle: "monthly" | "yearly" | null = null,
): CatalogPriceDto | null {
  const wanted = currency.toLowerCase();
  return prices.find((price) => price.currency.toLowerCase() === wanted && (billingCycle === null || price.billingCycle === billingCycle)) ?? null;
}

/**
 * The currency to show a catalog in: the workspace's, when the item is priced in it, otherwise
 * whichever currency the item has. Never silently converts.
 */
export function displayCurrency(prices: readonly CatalogPriceDto[], workspaceCurrency: string): string | null {
  if (priceFor(prices, workspaceCurrency)) return workspaceCurrency.toLowerCase();
  return prices[0]?.currency.toLowerCase() ?? null;
}

export type Tone = "positive" | "neutral" | "warning" | "danger";

export function syncTone(state: SyncState): Tone {
  switch (state) {
    case "synced":
      return "positive";
    case "outdated":
      return "warning";
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

export function statusTone(status: PackageStatus): Tone {
  return status === "active" ? "positive" : status === "archived" ? "neutral" : "warning";
}

/** "20%" or "50,000 VND" — the discount as a customer reads it. */
export function describeDiscount(coupon: Pick<CouponRequest, "discountType" | "percentOff" | "amountOff" | "amountOffCurrency">): string {
  if (coupon.discountType === "percent") return `${coupon.percentOff ?? 0}%`;
  const currency = (coupon.amountOffCurrency ?? "vnd").toUpperCase();
  const amount = coupon.amountOff ?? 0;
  return `${currency === "VND" ? Math.round(amount).toLocaleString("en-US") : amount.toFixed(2)} ${currency}`;
}

/** A datetime-local input value ("2026-09-25T10:00") as an ISO instant, or null. */
export function localInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** An ISO instant as a datetime-local input value in the browser's zone. */
export function isoToLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
