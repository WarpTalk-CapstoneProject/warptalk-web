"use client";

/**
 * Whether a meeting keeps translating after the credits run out.
 *
 * The engine has been in the database since migration 041 — `settle_usage_charge` lets the
 * balance go negative, counts the overage, and suspends at a cap. Nothing ever exposed the
 * switch, so the answer was always no and a meeting stopped mid-sentence with nothing on any
 * screen explaining that it could have been otherwise.
 *
 * WHAT THIS CONTROL IS NOT
 *   It does not set the cap. That is a commercial term, written by WarpTalk through
 *   `PUT /contract-terms`, which is system-admin-only precisely because a customer choosing
 *   their own ceiling is a customer issuing themselves credit. This moves between OFF and the
 *   allowance the plan already grants, and says the figure out loud so nobody has to guess how
 *   far "keep going" goes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/api/errors";
import { billingService } from "@/services/billing.service";

import { Panel } from "./metric-grid";

export function OveragePanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("settingsBillingUsage");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "overage", workspaceId],
    queryFn: () => billingService.getOverageSetting(workspaceId),
    enabled: !!workspaceId,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => billingService.setOverage(workspaceId, enabled),
    onSuccess: (next) => {
      queryClient.setQueryData(["billing", "overage", workspaceId], next);
      toast.success(
        next.enabled
          ? t("overagePanel.toasts.enabled")
          : t("overagePanel.toasts.disabled"),
      );
    },
    // The server's own sentence. It refuses to enable this on a plan with no allowance, and
    // "Could not update" would leave the owner retrying a switch that can never move.
    onError: (error) =>
      toast.error(getErrorMessage(error, t("overagePanel.toasts.failed"))),
  });

  if (isLoading || !data) return null;

  // A plan with no allowance at all. Rendering a switch here would offer a choice that does not
  // exist — the honest answer is to say who can change that.
  if (data.planCapCredits <= 0) {
    return (
      <Panel title={t("overagePanel.noAllowance.title")} description={t("overagePanel.noAllowance.description")}>
        <p className="text-[13px] text-ink-muted">
          {t("overagePanel.noAllowance.body")}
        </p>
      </Panel>
    );
  }

  const used = data.overageCreditsThisCycle;
  const cap = data.effectiveCapCredits || data.planCapCredits;

  return (
    <Panel
      title={t("overagePanel.control.title")}
      description={t("overagePanel.control.description")}
      actions={
        <Switch
          checked={data.enabled}
          disabled={mutation.isPending}
          onCheckedChange={(next) => mutation.mutate(next)}
          aria-label={t("overagePanel.control.switchAria")}
        />
      }
    >
      <p className="text-[13px] text-ink-muted">
        {data.enabled
          ? t.rich("overagePanel.control.enabledBody", {
              cap: () => <span className="font-medium text-ink">{cap.toLocaleString()}</span>,
            })
          : t.rich("overagePanel.control.disabledBody", {
              cap: () => <span className="font-medium text-ink">{data.planCapCredits.toLocaleString()}</span>,
            })}
      </p>

      {/* Only once it has actually been used. A "0 of 50,000" bar on a workspace that has never
          gone into overage is a debt meter for a debt nobody has. */}
      {used > 0 ? (
        <div className="mt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${Math.min(100, (used / Math.max(cap, 1)) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-ink-subtle">
            {t("overagePanel.control.usedOfCap", { used: used.toLocaleString(), cap: cap.toLocaleString() })}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
