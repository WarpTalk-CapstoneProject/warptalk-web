"use client";

/**
 * Insights → Usage (WT-878): the workspace's Usage surface, inside the Insights page.
 *
 * NOTHING HERE IS A SECOND USAGE PAGE
 *   The surface is `UsageOverview`, the component the stand-alone `/settings/billing/usage` page
 *   rendered — its member filter, refresh and CSV export included — fed by
 *   `useWorkspaceUsageOverview`. That page was retired on 2026-10-03 and its address forwards here
 *   (`?tab=usage`, proxy.ts), so this tab is the workspace's only Usage surface. What it adds is only what
 *   the Insights frame needs around it:
 *
 *   - A caption, because the page's period bar is hidden on this tab: usage is counted per billing
 *     cycle, so the tab follows the current cycle whatever period the other tabs show. The
 *     `period` prop is therefore deliberately unused. Dates are formatted in the viewer's local
 *     time, as `UsageOverview`'s own cycle pill formats them, so the two never disagree by a day.
 *     `UsageOverview` is rendered `embedded`: its "Usage" h1 and cycle pill are hidden, so the
 *     surface has one title (the Insights tab) and one cycle line (this caption).
 *   - The states the old page left on an empty surface: loading, a billing service that did not
 *     answer ("Not available yet" + retry, the admin Insights `SourceBody` wording), and a
 *     workspace with no plan (BILLING_SUBSCRIPTION_NOT_FOUND), which is an account state with its
 *     way out rather than a failure.
 */

import { ArrowClockwise, CalendarBlank } from "@phosphor-icons/react";
import { format } from "date-fns";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";

import { UsageOverview } from "@/app/(app)/[workspaceSlug]/settings/billing/components/usage-overview";
import type { InsightsTabProps } from "@/components/workspace/insights/insights-types";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { useWorkspaceUsageOverview } from "@/hooks/use-workspace-usage-overview";
import { WORKSPACE_INSIGHTS_USAGE_PAGE_TYPE } from "@/lib/assistant/assistant-scope";
import { usageAssistantSnapshot } from "@/lib/workspace/insights/usage-assistant-snapshot";

/** The admin Insights card: a hairline box on the panel, one step up the surface ladder. */
const CARD = "min-w-0 overflow-hidden rounded-xl border border-hairline bg-surface-1";

export function UsageTab({ workspaceId, workspaceSlug }: InsightsTabProps) {
  const t = useTranslations("workspaceInsightsUsage");
  const tUsage = useTranslations("settingsBillingUsage");
  const usage = useWorkspaceUsageOverview(workspaceId);

  // WarpBot answers this tab's starters from the figures on it (usage-assistant-snapshot.ts), the
  // whole-workspace view the tab opens with. Nothing is registered until the cycle and its ledger
  // have both been read, so a figure still loading is never told to WarpBot as 0.
  const assistantSnapshot = useMemo(
    () =>
      usage.canView && usage.status === "ready" && usage.balance && usage.ledger && usage.ledgerComplete !== undefined
        ? usageAssistantSnapshot({
            balance: usage.balance,
            ledger: usage.ledger,
            ledgerComplete: usage.ledgerComplete,
            serviceUsage: usage.serviceUsage,
            members: usage.members,
            rooms: usage.rooms,
            nowMs: usage.now,
          })
        : null,
    [usage.canView, usage.status, usage.balance, usage.ledger, usage.ledgerComplete, usage.serviceUsage, usage.members, usage.rooms, usage.now],
  );
  useRegisterAssistantContext(
    assistantSnapshot ? { pageType: WORKSPACE_INSIGHTS_USAGE_PAGE_TYPE, workspaceId, snapshot: assistantSnapshot } : null,
  );

  if (usage.roleLoaded && !usage.canView) {
    return <StateCard>{tUsage("accessDenied")}</StateCard>;
  }

  const { balance } = usage;
  const cycle = balance
    ? t("caption.cycle", {
        start: format(new Date(balance.currentPeriodStart), "MMM d"),
        end: format(new Date(balance.currentPeriodEnd), "MMM d, yyyy"),
      })
    : t("caption.currentCycle");

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <CalendarBlank className="size-3.5 text-ink-muted" aria-hidden />
          {cycle}
        </span>
        <span>{t("caption.followsCycle")}</span>
      </div>

      {usage.status === "loading" ? (
        <div className={CARD} role="status" aria-label={t("state.loading")}>
          <div className="h-[56px] border-b border-hairline" />
          <div className="space-y-3 px-4 py-5 sm:px-6">
            <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
            <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
            <div className="h-[260px] animate-pulse rounded-md bg-surface-2" />
          </div>
        </div>
      ) : usage.status === "unavailable" ? (
        <StateCard>
          <p>{t("state.unavailable")}</p>
          <button
            type="button"
            onClick={usage.onRefresh}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <ArrowClockwise className="size-3.5" aria-hidden />
            {t("state.retry")}
          </button>
        </StateCard>
      ) : usage.status === "noSubscription" ? (
        <StateCard>
          <p className="text-[13px] font-medium text-ink">{t("noSubscription.title")}</p>
          <p className="mt-1 max-w-[420px]">{t("noSubscription.body")}</p>
          <Link
            href={`/${workspaceSlug}/settings/billing`}
            className="mt-3 inline-flex h-8 items-center rounded-full border border-border px-3 text-[13px] font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {t("noSubscription.action")}
          </Link>
        </StateCard>
      ) : (
        <div className={CARD}>
          <UsageOverview
            balance={balance}
            ledger={usage.ledger}
            serviceUsage={usage.serviceUsage}
            members={usage.members}
            rooms={usage.rooms}
            now={usage.now}
            isLoading={usage.isLoading}
            workspaceSlug={workspaceSlug}
            onRefresh={usage.onRefresh}
            embedded
          />
        </div>
      )}
    </div>
  );
}

function StateCard({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${CARD} flex min-h-[240px] flex-col items-center justify-center px-4 py-8 text-center text-[12px] text-ink-muted`}
    >
      {children}
    </div>
  );
}
