"use client";

/**
 * G11 — the packs and add-ons this workspace may buy, on the billing page.
 *
 * WHAT IS OFFERED is the server's decision (GET /payments/workspace/{id}/catalog): active, in
 * window, visible to this workspace's plan or to this workspace, under its purchase limits. The
 * page draws exactly that list and nothing it computes itself.
 *
 * WHAT IT COSTS is also the server's: checkout sends the item id (and quantity, cycle, coupon
 * code) and the server prices it from the catalog, discarding any amount. The numbers shown here
 * come from the same catalog response, so the page and the charge cannot disagree.
 *
 * CURRENCY: the workspace's (its plan's), when the item is sold in it — never converted.
 */

import { Spinner } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { AddonCard, CreditPackCard } from "@/components/billing/catalog-cards";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBillingCatalog, useCancelWorkspaceAddon, useCouponPreview } from "@/hooks/use-billing-catalog";
import { getErrorMessage } from "@/lib/api/errors";
import { isPurchaseRequiresSubscription } from "@/lib/billing/extra-credits";
import { displayCurrency, isNumericEntitlement, priceFor } from "@/lib/billing/package-request";
import { formatAmount, formatMoney } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import type {
  CatalogAddonDto,
  CatalogCreditPackDto,
  CouponPreviewDto,
  WorkspaceAddonDto,
} from "@/types/admin-packages";

import { BillingButton, Pill, Row, RowGroup, Section } from "./billing-primitives";

function Heading({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-[14px] font-semibold leading-tight text-ink">{title}</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{description}</p>
    </div>
  );
}

type Purchase =
  | { kind: "pack"; pack: CatalogCreditPackDto }
  | { kind: "addon"; addon: CatalogAddonDto };

export function CatalogSection({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("settingsBillingCatalog");
  const catalogQuery = useBillingCatalog(workspaceId);
  const cancelAddon = useCancelWorkspaceAddon(workspaceId);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [cancelling, setCancelling] = useState<WorkspaceAddonDto | null>(null);

  const catalog = catalogQuery.data;
  // backend#467: a credit pack is sold only on top of a live plan — the server's hasActivePlan,
  // the same liveness its checkout refuses on (409). The billing page says why, once, above.
  const packs = catalog?.hasActivePlan ? catalog.creditPacks : [];
  // Nothing to sell and nothing owned: the section would only be an empty heading.
  if (!catalog || (packs.length === 0 && catalog.addons.length === 0 && catalog.activeAddons.length === 0)) {
    return null;
  }

  const workspaceCurrency = catalog.currency;

  return (
    <>
      {packs.length > 0 ? (
        <div className="border-b border-border px-4 py-4">
          <Heading title={t("packs.title")} description={t("packs.description")} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((pack) => {
              const currency = displayCurrency(pack.prices, workspaceCurrency);
              const price = currency ? priceFor(pack.prices, currency) : null;
              return (
                <CreditPackCard
                  key={pack.id}
                  name={pack.name}
                  description={pack.description}
                  credits={pack.credits}
                  bonusCredits={pack.bonusCredits}
                  validityDays={pack.validityDays}
                  purchasesRemaining={pack.purchasesRemaining}
                  availableUntil={pack.availableUntil}
                  price={price ? { amount: price.amount, currency: price.currency, discountedAmount: price.discountedAmount, campaignName: price.autoCouponName } : null}
                  action={
                    <BillingButton tone="primary" className="w-auto px-3" disabled={!price} onClick={() => setPurchase({ kind: "pack", pack })}>
                      {t("cards.buy")}
                    </BillingButton>
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {catalog.addons.length > 0 || catalog.activeAddons.length > 0 ? (
        <div className="border-b border-border px-4 py-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Heading title={t("addons.title")} description={t("addons.description")} />
            <div role="radiogroup" aria-label={t("addons.cycle")} className="inline-flex rounded-full border border-border p-0.5">
              {(["monthly", "yearly"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={cycle === value}
                  onClick={() => setCycle(value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[12px] transition-colors",
                    cycle === value ? "bg-foreground text-background" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t(`addons.cycles.${value}`)}
                </button>
              ))}
            </div>
          </div>

          {catalog.activeAddons.length > 0 ? (
            <Section className="mt-3">
              <RowGroup>
                {catalog.activeAddons.map((owned) => (
                  <Row
                    key={owned.id}
                    label={owned.name}
                    value={
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        <span className="tabular-nums">
                          {isNumericEntitlement(owned.entitlementKey)
                            ? t("addons.ownedUnits", { units: formatAmount(owned.unitsGranted), unit: owned.unitLabel })
                            : t("addons.ownedOn")}
                        </span>
                        {owned.status === "cancelling" ? (
                          <Pill>
                            {t("addons.endsOn", { date: owned.currentPeriodEnd ? new Date(owned.currentPeriodEnd).toLocaleDateString() : "—" })}
                          </Pill>
                        ) : (
                          <button
                            type="button"
                            className="text-[12px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                            onClick={() => setCancelling(owned)}
                          >
                            {t("addons.cancel")}
                          </button>
                        )}
                      </span>
                    }
                    hint={t("addons.billed", {
                      price: formatMoney(owned.unitPrice * owned.quantity, owned.currency),
                      cycle: t(`addons.cycles.${owned.billingCycle === "yearly" ? "yearly" : "monthly"}`),
                    })}
                  />
                ))}
              </RowGroup>
            </Section>
          ) : null}

          {!catalog.hasActivePlan ? (
            <p className="mt-3 text-[12px] text-ink-muted">{t("addons.needsPlan")}</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.addons.map((addon) => {
                const currency = displayCurrency(addon.prices.filter((p) => p.billingCycle === cycle), workspaceCurrency);
                const price = currency ? priceFor(addon.prices, currency, cycle) : null;
                return (
                  <AddonCard
                    key={addon.id}
                    name={addon.name}
                    description={addon.description}
                    unitLabel={addon.unitLabel}
                    entitlementKey={addon.entitlementKey}
                    unitsPerQuantity={addon.unitsPerQuantity}
                    minQuantity={addon.minQuantity}
                    maxQuantity={addon.maxQuantity}
                    cycle={cycle}
                    price={price ? { amount: price.amount, currency: price.currency, discountedAmount: price.discountedAmount, campaignName: price.autoCouponName } : null}
                    status={addon.owned ? <Pill tone="accent">{t("addons.owned")}</Pill> : null}
                    action={
                      <BillingButton
                        tone="outline"
                        className="w-auto px-3"
                        disabled={!price || addon.owned}
                        onClick={() => setPurchase({ kind: "addon", addon })}
                      >
                        {t("cards.add")}
                      </BillingButton>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <PurchaseDialog
        workspaceId={workspaceId}
        workspaceCurrency={workspaceCurrency}
        purchase={purchase}
        cycle={cycle}
        onOpenChange={(open) => {
          if (!open) setPurchase(null);
        }}
      />

      <Dialog open={cancelling !== null} onOpenChange={(open) => (!open ? setCancelling(null) : undefined)}>
        <DialogContent className="max-w-[420px] rounded-[14px] border-border bg-surface-1 p-5 shadow-none">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold text-ink">{t("cancelDialog.title", { name: cancelling?.name ?? "" })}</DialogTitle>
            <DialogDescription className="text-[12px] text-ink-muted">{t("cancelDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <BillingButton tone="outline" className="w-auto px-3" onClick={() => setCancelling(null)}>
              {t("cancelDialog.keep")}
            </BillingButton>
            <BillingButton
              tone="primary"
              className="w-auto px-3"
              disabled={cancelAddon.isPending}
              onClick={async () => {
                if (!cancelling) return;
                try {
                  await cancelAddon.mutateAsync(cancelling.id);
                  toast.success(t("cancelDialog.done"));
                  setCancelling(null);
                } catch (error) {
                  toast.error(getErrorMessage(error, t("cancelDialog.failed")));
                }
              }}
            >
              {cancelAddon.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("cancelDialog.confirm")}
            </BillingButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PurchaseDialog({
  workspaceId,
  workspaceCurrency,
  purchase,
  cycle,
  onOpenChange,
}: {
  workspaceId: string;
  workspaceCurrency: string;
  purchase: Purchase | null;
  cycle: "monthly" | "yearly";
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={purchase !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] rounded-[14px] border-border bg-surface-1 p-0 shadow-none">
        {purchase ? (
          <PurchaseForm
            key={purchase.kind === "pack" ? purchase.pack.id : `${purchase.addon.id}-${cycle}`}
            workspaceId={workspaceId}
            workspaceCurrency={workspaceCurrency}
            purchase={purchase}
            cycle={cycle}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PurchaseForm({
  workspaceId,
  workspaceCurrency,
  purchase,
  cycle,
}: {
  workspaceId: string;
  workspaceCurrency: string;
  purchase: Purchase;
  cycle: "monthly" | "yearly";
}) {
  const t = useTranslations("settingsBillingCatalog.purchase");
  const tBilling = useTranslations("settingsBilling");
  const user = useAuthStore((state) => state.user);
  const previewCoupon = useCouponPreview(workspaceId);
  const isPack = purchase.kind === "pack";
  const item = isPack ? purchase.pack : purchase.addon;
  const prices = isPack ? purchase.pack.prices : purchase.addon.prices.filter((p) => p.billingCycle === cycle);
  const currency = displayCurrency(prices, workspaceCurrency) ?? workspaceCurrency;
  const price = priceFor(prices, currency, isPack ? null : cycle);

  const [quantity, setQuantity] = useState(isPack ? 1 : purchase.addon.minQuantity);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<CouponPreviewDto | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const list = (price?.amount ?? 0) * quantity;
  // Without a typed code the server applies the best running campaign, which the catalog price
  // already shows; with one, the preview answers.
  const campaignTotal = price?.discountedAmount != null ? price.discountedAmount * quantity : null;
  const total = preview?.valid && preview.code ? preview.total : campaignTotal ?? list;

  const applyCode = async () => {
    if (!code.trim()) return;
    try {
      setPreview(
        await previewCoupon.mutateAsync({
          code: code.trim(),
          itemType: isPack ? "credit_pack" : "addon",
          itemId: item.id,
          currency,
          billingCycle: isPack ? null : cycle,
          quantity,
          listPrice: null,
        }),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, t("couponFailed")));
    }
  };

  const checkout = async () => {
    if (!user || !price) return;
    try {
      setIsProcessing(true);
      const url = await billingService.createCheckoutSession({
        userId: user.id,
        workspaceId,
        // Ignored by the server for a catalog item: it prices packageId from the catalog.
        amount: total,
        currency,
        paymentType: isPack ? "CreditPack" : "AddOn",
        packageId: item.id,
        quantity,
        billingCycle: isPack ? undefined : cycle,
        couponCode: preview?.valid && preview.code ? preview.code : undefined,
      });
      if (url) window.location.assign(url);
    } catch (error) {
      // backend#467: the plan lapsed between the page loading and the click.
      toast.error(
        isPurchaseRequiresSubscription(error)
          ? tBilling("purchaseGate.refused")
          : getErrorMessage(error, t("checkoutFailed")),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <DialogHeader className="px-5 pt-5">
        <DialogTitle className="text-[16px] font-semibold text-ink">{item.name}</DialogTitle>
        <DialogDescription className="text-[12px] text-ink-muted">
          {isPack ? t("packDescription") : t("addonDescription", { cycle: t(`cycles.${cycle}`) })}
        </DialogDescription>
      </DialogHeader>

      <div className="px-5 pb-5">
        {!isPack && purchase.addon.maxQuantity > 1 ? (
          <div className="mt-2">
            <label htmlFor="addon-quantity" className="text-[12px] font-medium text-ink-muted">
              {t("quantity", { unit: purchase.addon.unitLabel })}
            </label>
            <Input
              id="addon-quantity"
              type="number"
              min={purchase.addon.minQuantity}
              max={purchase.addon.maxQuantity}
              value={quantity}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                setQuantity(Number.isFinite(next) ? Math.min(Math.max(next, purchase.addon.minQuantity), purchase.addon.maxQuantity) : purchase.addon.minQuantity);
                setPreview(null);
              }}
              className="mt-1.5 h-9 rounded-[8px] border-border bg-surface-1 text-[13px] shadow-none"
            />
          </div>
        ) : null}

        <div className="mt-3">
          <label htmlFor="coupon-code" className="text-[12px] font-medium text-ink-muted">
            {t("coupon")}
          </label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="coupon-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setPreview(null);
              }}
              placeholder={t("couponPlaceholder")}
              className="h-9 rounded-[8px] border-border bg-surface-1 font-mono text-[13px] shadow-none"
            />
            <BillingButton tone="outline" className="w-auto shrink-0 px-3" disabled={!code.trim() || previewCoupon.isPending} onClick={() => void applyCode()}>
              {t("apply")}
            </BillingButton>
          </div>
          {preview && preview.code ? (
            <p className={cn("mt-1.5 text-[12px]", preview.valid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600")}>
              {preview.valid
                ? t("couponApplied", { name: preview.name ?? preview.code, discount: formatMoney(preview.discount, currency) })
                : preview.error ?? t("couponInvalid")}
            </p>
          ) : null}
        </div>

        <Section className="mt-4 bg-surface-2/40">
          <RowGroup>
            {isPack ? (
              <Row
                label={t("credits")}
                value={formatAmount(purchase.pack.credits + purchase.pack.bonusCredits)}
                hint={purchase.pack.bonusCredits > 0 ? t("includesBonus", { bonus: formatAmount(purchase.pack.bonusCredits) }) : undefined}
              />
            ) : null}
            <Row label={t("listPrice")} value={formatMoney(list, currency)} />
            <Row
              label={t("total")}
              value={formatMoney(total, currency)}
              hint={isPack ? t("totalHintOnce") : t("totalHintRecurring", { cycle: t(`cycles.${cycle}`) })}
            />
          </RowGroup>
        </Section>

        <BillingButton tone="primary" className="mt-4 h-[36px]" disabled={isProcessing || !price} onClick={() => void checkout()}>
          {isProcessing ? (
            <>
              <Spinner className="h-3.5 w-3.5 animate-spin" />
              {t("starting")}
            </>
          ) : (
            t("continue")
          )}
        </BillingButton>
      </div>
    </>
  );
}
