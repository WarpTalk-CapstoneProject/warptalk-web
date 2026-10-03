"use client";

/**
 * Admin → Plans & pricing → Preview: the plan ladder exactly as a buyer sees it, with the editing
 * controls laid over it.
 *
 * NOT A LOOK-ALIKE. This renders the Billing page's own `PlanGrid`, fed through the same
 * `selectablePlans` that page uses, so a change to either the component or the rule shows up here
 * the moment it ships. A preview drawn separately would be accurate on the day it was written.
 *
 * TWO CONTROLS, ONE EACH. The pencil inside a column adjusts that plan; the "+" cell after the last
 * column adds one. Both open the dialogs the Plans tab already uses, so a plan has one editor.
 *
 * HIDDEN PLANS. Off by default, because the point is "what does a buyer see". Turned on, they are
 * slotted into the ladder where their sort order puts them and marked Hidden, so an admin can see
 * where a plan would land before making it active.
 *
 * Nothing here can buy anything: the grid's Choose / Upgrade buttons have no effect.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";

import { Pill } from "@/app/(app)/[workspaceSlug]/settings/billing/components/billing-primitives";
import { PlanGrid } from "@/app/(app)/[workspaceSlug]/settings/billing/components/plan-grid";
import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { comparePlans, selectablePlans, type BillingInterval } from "@/lib/billing/plan-pricing";
import type { PlanDto } from "@/types/billing";

export function PlanStorefrontPreview({
  plans,
  isPending,
  isError,
  onRetry,
  onEdit,
  onCreate,
}: {
  plans: readonly PlanDto[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onEdit: (plan: PlanDto) => void;
  onCreate: () => void;
}) {
  const t = useTranslations("adminPlansSettings.plans.preview");
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [includeHidden, setIncludeHidden] = useState(false);

  const ladder = useMemo(
    () => (includeHidden ? [...plans].sort(comparePlans) : selectablePlans(plans)),
    [plans, includeHidden],
  );
  const hiddenCount = plans.filter((plan) => !plan.isActive).length;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-ink-muted">{t("note")}</p>
        <label className="flex items-center gap-2 text-[12px] text-ink-muted">
          <Switch
            checked={includeHidden}
            onCheckedChange={setIncludeHidden}
            disabled={hiddenCount === 0}
            aria-label={t("includeHidden", { count: hiddenCount })}
          />
          {t("includeHidden", { count: hiddenCount })}
        </label>
      </div>

      <AdminPanel className="mt-3 overflow-hidden">
        {isError ? (
          <div className="px-4 py-8 text-sm">
            <p className="font-medium text-ink">{t("error")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : isPending ? (
          <div className="grid gap-px sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-56 animate-pulse bg-surface-2" />
            ))}
          </div>
        ) : (
          <PlanGrid
            plans={ladder}
            currentPlanId={null}
            onSelect={() => undefined}
            interval={interval}
            onIntervalChange={setInterval}
            renderPlanAction={(plan) => (
              <>
                {!plan.isActive ? <Pill>{t("hidden")}</Pill> : null}
                <button
                  type="button"
                  onClick={() => onEdit(plan)}
                  aria-label={t("adjust", { name: plan.name })}
                  title={t("adjust", { name: plan.name })}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <PencilSimple size={14} />
                </button>
              </>
            )}
            trailingCell={
              <button
                type="button"
                onClick={onCreate}
                className="m-3 flex min-h-48 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline text-[13px] font-medium text-ink-muted outline-none hover:border-primary/50 hover:bg-primary/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface-1">
                  <Plus size={16} />
                </span>
                {t("addPlan")}
              </button>
            }
          />
        )}
      </AdminPanel>
    </>
  );
}
