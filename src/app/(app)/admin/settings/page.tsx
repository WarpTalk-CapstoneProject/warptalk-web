"use client";

/**
 * Platform settings — the writable knobs the platform runs on (2026-08-17).
 *
 * Distinct from /admin/configuration on purpose: that page is READ-ONLY reference data that
 * changes by migration (language catalog, consent ledger), and mixing an editable VAT rate into
 * it would blur exactly the line that page exists to draw. What is editable lives here:
 * the billing policy, and the pricing economics the plan validator reads.
 */

import { useState } from "react";
import { GearSix, PencilSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { PricingConfigDialog } from "@/components/admin/pricing-editors";
import {
  useAdminBillingPolicy,
  useAdminPricingConfig,
  useUpdateAdminBillingPolicy,
  useUpdateAdminPricingConfig,
} from "@/hooks/use-admin-pricing";
import { getErrorMessage } from "@/lib/api/errors";

const numberFormatter = new Intl.NumberFormat("en-US");

function SettingRow({
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

function BillingPolicyPanel() {
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
      toast.success("Billing policy saved.");
    } catch (error) {
      toast.error(getErrorMessage(error, "The billing policy could not be saved."));
    }
  };

  return (
    <AdminPanel className="mt-3">
      {policyQuery.isError ? (
        <div className="flex items-start gap-3 px-4 py-8 text-sm">
          <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">The billing policy could not be loaded.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void policyQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <SettingRow
          label="VAT rate"
          hint="Applied to every invoice the platform raises. A fraction: 0.1 is 10%."
        >
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(event) => setDraft(event.target.value)}
              inputMode="decimal"
              disabled={policyQuery.isPending || updatePolicy.isPending}
              aria-label="VAT rate"
              className="h-9 w-28 text-right tabular-nums"
            />
            <Button
              size="sm"
              disabled={!isDirty || !isValid || updatePolicy.isPending}
              onClick={() => void save()}
            >
              {updatePolicy.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </SettingRow>
      )}
    </AdminPanel>
  );
}

function PricingEconomicsPanel() {
  const configQuery = useAdminPricingConfig();
  const updateConfig = useUpdateAdminPricingConfig();
  const [isEditing, setIsEditing] = useState(false);
  const config = configQuery.data ?? null;

  return (
    <>
      <AdminPanel className="mt-3">
        {configQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-8 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">The pricing configuration could not be loaded.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void configQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : configQuery.isPending || !config ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        ) : (
          <>
            <SettingRow label="FX rate (USD → VND)" hint="Reads a USD provider cost in VND terms.">
              <span className="text-[13px] tabular-nums text-ink">
                {numberFormatter.format(config.fxRateUsdVnd)}
              </span>
            </SettingRow>
            <SettingRow label="Credit value" hint="What one credit costs a customer, in VND.">
              <span className="text-[13px] tabular-nums text-ink">
                {numberFormatter.format(config.creditValueVnd)} ₫
              </span>
            </SettingRow>
            <SettingRow
              label="Minimum price per credit"
              hint="The plan validator's price floor — a VND plan cannot sell credits below this."
            >
              <span className="text-[13px] tabular-nums text-ink">
                {numberFormatter.format(config.minimumPricePerCreditVnd)} ₫
              </span>
            </SettingRow>
            <SettingRow label="Minimum contract price" hint="Per cycle, before a plan is valid.">
              <span className="text-[13px] tabular-nums text-ink">
                {numberFormatter.format(config.minimumContractPriceVnd)} ₫ ·{" "}
                {numberFormatter.format(config.minimumContractPriceUsd)} $
              </span>
            </SettingRow>
            <SettingRow
              label="Default invoice terms"
              hint="Days to pay, and the grace window after that, for plans that do not override them."
            >
              <span className="text-[13px] tabular-nums text-ink">
                {config.defaultInvoiceTermsDays} days · {config.defaultInvoiceGraceHours} h grace
              </span>
            </SettingRow>
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

      {config ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <PencilSimple size={14} />
            Edit pricing economics
          </Button>
        </div>
      ) : null}
    </>
  );
}

export default function AdminSettingsPage() {
  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Configuration"
        eyebrowIcon={<GearSix size={14} weight="fill" />}
        title="Platform settings"
        description="The writable knobs the platform runs on. Reference data that changes by migration stays on Platform config."
      />

      <h2 className="mt-6 text-sm font-semibold text-ink">Billing policy</h2>
      <BillingPolicyPanel />

      <h2 className="mt-8 text-sm font-semibold text-ink">Pricing economics</h2>
      <p className="mt-1 text-xs text-ink-muted">
        The same configuration the plan validator and the rate-card margin reader consult — also
        reachable from Plans &amp; pricing.
      </p>
      <PricingEconomicsPanel />
    </AdminPage>
  );
}
