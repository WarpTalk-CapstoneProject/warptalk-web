"use client";

/**
 * The billing knobs that are not registry settings, moved here unchanged from the old
 * /admin/settings page when it became the platform settings console: the billing policy (VAT),
 * and the pricing economics with the Stripe FX rate row. They render in the console's Billing
 * category, beside the registry's billing settings.
 *
 * Writes are gated the way the server gates them: the VAT rate needs settings.manage
 * (BillingPolicyController); the FX actions and the pricing dialog need billing.pricing_manage
 * (AdminFxRateController, UsagesController) — and, since they live on the settings console,
 * settings.manage as well. A read-only viewer sees the values and no buttons.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowsClockwise, PencilSimple, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { PricingConfigDialog } from "@/components/admin/pricing-editors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCan } from "@/hooks/use-staff-access";
import { useAdminFxActions, useAdminFxRate } from "@/hooks/use-admin-insights";
import {
  useAdminBillingPolicy,
  useAdminPricingConfig,
  useUpdateAdminBillingPolicy,
  useUpdateAdminPricingConfig,
} from "@/hooks/use-admin-pricing";
import { fxLineView } from "@/lib/admin/insights-pnl";
import { ADMIN_PERMISSIONS } from "@/lib/admin/staff-permissions";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US");
// USD per Cartesia credit is ~0.00004: the default six-digit cut would show 0.000039.
const usdPerCreditFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });

export function KnobRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function PanelError({ what, onRetry }: { what: string; onRetry: () => void }) {
  const t = useTranslations("adminPlansSettings.settings.panelError");
  return (
    <div className="flex items-start gap-3 px-4 py-8 text-sm">
      <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
      <div>
        <p className="font-medium">{t("message", { what })}</p>
        <p className="mt-1 text-ink-muted">{t("hint")}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {t("tryAgain")}
        </Button>
      </div>
    </div>
  );
}

export function BillingPolicyPanel() {
  const t = useTranslations("adminPlansSettings.settings.billingPolicy");
  const canManage = useCan(ADMIN_PERMISSIONS.settingsManage);
  const policyQuery = useAdminBillingPolicy();
  const updatePolicy = useUpdateAdminBillingPolicy();

  const [draft, setDraft] = useState<string | null>(null);
  const stored = policyQuery.data?.vatRate;
  const value = draft ?? (stored == null ? "" : String(stored));
  const parsed = Number(value);
  const isDirty = draft !== null && stored != null && parsed !== stored;
  const isValid = value !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;

  const save = async () => {
    try {
      await updatePolicy.mutateAsync({ vatRate: parsed });
      setDraft(null);
      toast.success(t("saveSuccessToast"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("saveErrorToast")));
    }
  };

  return (
    <AdminPanel className="mt-3">
      {policyQuery.isError ? (
        <PanelError what={t("errorWhat")} onRetry={() => void policyQuery.refetch()} />
      ) : (
        <KnobRow label={t("vatLabel")} hint={t("vatHint")}>
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(event) => setDraft(event.target.value)}
              inputMode="decimal"
              disabled={!canManage || policyQuery.isPending || updatePolicy.isPending}
              readOnly={!canManage}
              aria-label={t("vatAriaLabel")}
              className="h-9 w-28 text-right tabular-nums"
            />
            {canManage ? (
              <Button
                size="sm"
                disabled={!isDirty || !isValid || updatePolicy.isPending}
                onClick={() => void save()}
              >
                {updatePolicy.isPending ? t("saving") : t("save")}
              </Button>
            ) : null}
          </div>
        </KnobRow>
      )}
    </AdminPanel>
  );
}


const fxInstant = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * The USD→VND rate: Stripe's by default (recorded daily by billing), with its source and as-of time,
 * an amber warning whenever Stripe has not answered for a day (the reports then run on the last known
 * rate), and an explicit, reversible override. Replaces the hand-typed 26,300.
 */
export function FxRateRow({ fallbackRate, canManage }: { fallbackRate: number; canManage: boolean }) {
  const t = useTranslations("adminPlansSettings.settings.pricingEconomics");
  const fxQuery = useAdminFxRate();
  const actions = useAdminFxActions();
  const fx = fxQuery.data ?? null;
  const view = fxLineView(fx, fxInstant);
  const busy = actions.refresh.isPending || actions.clearOverride.isPending;

  const refresh = async () => {
    try {
      const result = await actions.refresh.mutateAsync();
      if (result.error) toast.warning(t("fxRefreshPartial", { error: result.error }));
      else toast.success(t("fxRefreshed"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("fxRefreshError")));
    }
  };

  const backToStripe = async () => {
    try {
      await actions.clearOverride.mutateAsync();
    } catch (error) {
      toast.error(getErrorMessage(error, t("fxOverrideError")));
    }
  };

  return (
    <div className="border-b border-hairline/60 px-4 py-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{t("fxRateLabel")}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{t("fxRateHint")}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={cn("text-[13px] font-medium tabular-nums", view?.tone === "warning" ? "text-warning" : "text-ink")}>
            {view ? view.rate : `${numberFormatter.format(fallbackRate)} VND/USD`}
          </span>
          {view ? (
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {view.asOf ? t("fxSourceAsOf", { source: view.source, asOf: view.asOf }) : view.source}
            </p>
          ) : fxQuery.isError ? (
            <p className="mt-0.5 text-[11px] text-warning">{t("fxStatusUnavailable")}</p>
          ) : null}
        </div>
      </div>

      {view?.warning ? (
        <p role="status" className="mt-2 flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-[12px] text-warning">
          <Warning size={14} className="mt-0.5 shrink-0" />
          {view.warning}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {canManage ? (
          <Button variant="outline" size="sm" disabled={busy || !fx} onClick={() => void refresh()}>
            <ArrowsClockwise size={14} />
            {actions.refresh.isPending ? t("fxRefreshing") : t("fxRefresh")}
          </Button>
        ) : null}
        {/* The rate is Stripe's. A manual rate set before that rule can still be cleared here. */}
        {canManage && fx?.mode === "manual" ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void backToStripe()}>
            {t("fxUseStripe")}
          </Button>
        ) : null}
        {fx?.mode === "manual" && fx.latestStripe ? (
          <span className="text-[11px] text-ink-muted">
            {t("fxStripeWouldBe", { rate: numberFormatter.format(fx.latestStripe.rate), date: fx.latestStripe.rateDate })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PricingEconomicsPanel() {
  const t = useTranslations("adminPlansSettings.settings.pricingEconomics");
  // The FX actions and this dialog are billing.pricing_manage on the server; on the settings
  // console they also need settings.manage, like every other write here.
  const canManageSettings = useCan(ADMIN_PERMISSIONS.settingsManage);
  const canManagePricing = useCan(ADMIN_PERMISSIONS.billingPricingManage);
  const canManage = canManageSettings && canManagePricing;
  const configQuery = useAdminPricingConfig();
  const updateConfig = useUpdateAdminPricingConfig();
  const [isEditing, setIsEditing] = useState(false);
  const config = configQuery.data ?? null;

  return (
    <>
      <AdminPanel className="mt-3">
        {configQuery.isError ? (
          <PanelError what={t("errorWhat")} onRetry={() => void configQuery.refetch()} />
        ) : configQuery.isPending || !config ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        ) : (
          <>
            <FxRateRow fallbackRate={config.fxRateUsdVnd} canManage={canManage} />
            {/* Framed like the FX rate beside it: a conversion Insights applies to a measured
                quantity, not a price anyone is charged. */}
            <KnobRow label={t("cartesiaUsdPerCreditLabel")} hint={t("cartesiaUsdPerCreditHint")}>
              <span className="text-[13px] tabular-nums text-ink">
                {config.cartesiaUsdPerCredit == null
                  ? "—"
                  : t("cartesiaUsdPerCreditValue", {
                      price: usdPerCreditFormatter.format(config.cartesiaUsdPerCredit),
                    })}
              </span>
            </KnobRow>
            {/* WT-690: no credit value or per-credit price floor here. Stripe owns customer
                prices; both values are still read by billing (top-up pricing, plan/contract floor),
                so they stay stored and change by migration, not from this page. */}
            <KnobRow label={t("minimumContractPriceLabel")} hint={t("minimumContractPriceHint")}>
              <span className="text-[13px] tabular-nums text-ink">
                {t("minimumContractPriceValue", {
                  vnd: numberFormatter.format(config.minimumContractPriceVnd),
                  usd: numberFormatter.format(config.minimumContractPriceUsd),
                })}
              </span>
            </KnobRow>
            <KnobRow
              label={t("defaultInvoiceTermsLabel")}
              hint={t("defaultInvoiceTermsHint")}
            >
              <span className="text-[13px] tabular-nums text-ink">
                {t("defaultInvoiceTermsValue", {
                  days: config.defaultInvoiceTermsDays,
                  hours: config.defaultInvoiceGraceHours,
                })}
              </span>
            </KnobRow>
          </>
        )}
      </AdminPanel>

      <PricingConfigDialog
        config={isEditing ? config : null}
        open={isEditing}
        onOpenChange={setIsEditing}
        onSubmit={(request) => updateConfig.mutateAsync(request)}
        isSaving={updateConfig.isPending}
      />

      {config && canManage ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <PencilSimple size={14} />
            {t("editButton")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
