"use client";

/**
 * G11 — how a credit pack and an add-on look to a customer.
 *
 * One component for both places that draw them: the workspace billing page, where they are
 * bought, and the admin package editor, whose "customer preview" renders the draft through the
 * same card. A preview that used its own markup would drift from the real page the first time
 * either changed.
 *
 * Presentational only: prices arrive already computed by the server (catalog endpoint) or, in the
 * admin preview, straight from the draft.
 */

import { Gift, HourglassMedium, Lightning, Sparkle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { formatAmount, formatMoney } from "@/lib/format/currency";
import { isNumericEntitlement } from "@/lib/billing/package-request";
import { cn } from "@/lib/utils";

export interface CatalogCardPrice {
  amount: number;
  currency: string;
  discountedAmount?: number | null;
  campaignName?: string | null;
}

function PriceLine({ price, suffix }: { price: CatalogCardPrice | null; suffix?: string }) {
  const t = useTranslations("settingsBillingCatalog.cards");
  if (!price) return <p className="text-[13px] text-ink-muted">{t("noPrice")}</p>;

  const discounted = price.discountedAmount !== null && price.discountedAmount !== undefined && price.discountedAmount < price.amount;
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
        <span className="text-[18px] font-semibold text-ink">
          {formatMoney(discounted ? price.discountedAmount! : price.amount, price.currency)}
        </span>
        {discounted ? (
          <span className="text-[12px] text-ink-subtle line-through">{formatMoney(price.amount, price.currency)}</span>
        ) : null}
        {suffix ? <span className="text-[12px] text-ink-muted">{suffix}</span> : null}
      </p>
      {discounted && price.campaignName ? (
        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <Sparkle size={11} weight="fill" />
          {price.campaignName}
        </p>
      ) : null}
    </div>
  );
}

function Shell({ children, highlighted, className }: { children: ReactNode; highlighted?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-3 rounded-[12px] border bg-surface-1 p-4 shadow-none",
        highlighted ? "border-primary/40" : "border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CreditPackCard({
  name,
  description,
  credits,
  bonusCredits,
  validityDays,
  price,
  purchasesRemaining,
  availableUntil,
  action,
}: {
  name: string;
  description?: string | null;
  credits: number;
  bonusCredits: number;
  validityDays: number | null;
  price: CatalogCardPrice | null;
  purchasesRemaining?: number | null;
  availableUntil?: string | null;
  action?: ReactNode;
}) {
  const t = useTranslations("settingsBillingCatalog.cards");
  return (
    <Shell highlighted={bonusCredits > 0}>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{name || t("untitled")}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Lightning size={12} weight="fill" className="text-primary" />
            {t("credits", { credits: formatAmount(credits) })}
          </span>
          {bonusCredits > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <Gift size={11} />
              {t("bonus", { bonus: formatAmount(bonusCredits) })}
            </span>
          ) : null}
        </p>
        {description ? <p className="mt-2 line-clamp-2 text-[12px] text-ink-muted">{description}</p> : null}
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-subtle">
          <HourglassMedium size={11} />
          {validityDays ? t("validFor", { days: validityDays }) : t("neverExpires")}
        </p>
        {purchasesRemaining !== null && purchasesRemaining !== undefined ? (
          <p className="mt-1 text-[11px] text-ink-subtle">{t("remaining", { count: purchasesRemaining })}</p>
        ) : null}
        {availableUntil ? (
          <p className="mt-1 text-[11px] text-ink-subtle">
            {t("availableUntil", { date: new Date(availableUntil).toLocaleDateString() })}
          </p>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <PriceLine price={price} />
        {action}
      </div>
    </Shell>
  );
}

export function AddonCard({
  name,
  description,
  unitLabel,
  entitlementKey,
  unitsPerQuantity,
  minQuantity,
  maxQuantity,
  price,
  cycle,
  status,
  action,
}: {
  name: string;
  description?: string | null;
  unitLabel: string;
  entitlementKey: string;
  unitsPerQuantity: number;
  minQuantity: number;
  maxQuantity: number;
  price: CatalogCardPrice | null;
  cycle: "monthly" | "yearly";
  status?: ReactNode;
  action?: ReactNode;
}) {
  const t = useTranslations("settingsBillingCatalog.cards");
  const numeric = isNumericEntitlement(entitlementKey);
  const entitlement = t(`entitlements.${entitlementKey}` as "entitlements.max_participants");
  return (
    <Shell>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[13px] font-medium text-ink">{name || t("untitled")}</p>
          {status}
        </div>
        <p className="mt-1 text-[12px] text-ink-muted">
          {numeric
            ? t("raises", { units: formatAmount(unitsPerQuantity), unit: unitLabel || t("unit"), entitlement })
            : t("unlocks", { entitlement })}
        </p>
        {description ? <p className="mt-2 line-clamp-2 text-[12px] text-ink-muted">{description}</p> : null}
        {numeric && maxQuantity > 1 ? (
          <p className="mt-2 text-[11px] text-ink-subtle">{t("quantityRange", { min: minQuantity, max: maxQuantity })}</p>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <PriceLine price={price} suffix={numeric ? t(cycle === "yearly" ? "perUnitYear" : "perUnitMonth", { unit: unitLabel || t("unit") }) : t(cycle === "yearly" ? "perYear" : "perMonth")} />
        {action}
      </div>
    </Shell>
  );
}
