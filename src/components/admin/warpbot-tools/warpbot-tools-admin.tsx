"use client";

/**
 * The admin WarpBot tools page: a read-only Catalog and the platform-wide Usage of every tool call
 * (built-in, web search and plugin). Design: artifact 6tiXws9F; data: wave 4 contract 2d.
 *
 * WHY TWO QUERIES FOR ONE ENDPOINT
 *   The Usage tab reads the window the period bar picks. The Catalog's "calls, 30 days" columns
 *   always read the last 30 days. Both resolve their window from the same `now` truncated to the
 *   minute, so on the default period they are the same query and React Query asks once.
 */

import { ArrowsClockwise, Toolbox } from "@phosphor-icons/react/dist/ssr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { AdminFilterTabs, AdminPage, AdminPageHeader } from "@/components/admin/admin-page-chrome";
import { WarpbotToolsCatalogTab } from "@/components/admin/warpbot-tools/catalog-tab";
import { WarpbotToolsUsageTab } from "@/components/admin/warpbot-tools/usage-tab";
import { Button } from "@/components/ui/button";
import { useAdminPlatformSettings } from "@/hooks/use-admin-platform-settings";
import { useAdminWarpbotToolUsage } from "@/hooks/use-admin-warpbot-tools";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { ADMIN_PERMISSIONS, hasPermission } from "@/lib/admin/staff-permissions";
import {
  DEFAULT_USAGE_PERIOD,
  DEFAULT_WARPBOT_TOOLS_TAB,
  parseUsagePeriod,
  parseWarpbotToolsTab,
  resolveUsageWindow,
  WARPBOT_TOOLS_TABS,
  type UsagePeriod,
  type WarpbotToolsTab,
} from "@/lib/admin/warpbot-tools-usage";
import { cn } from "@/lib/utils";

export function WarpbotToolsAdmin() {
  const t = useTranslations("adminPlugins.warpbotTools");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { access } = useStaffAccess();

  const tab = parseWarpbotToolsTab(searchParams.get("tab"));
  const period = parseUsagePeriod(searchParams.get("period"));
  const [now, setNow] = useState(() => new Date());

  const setParams = useCallback(
    (next: { tab?: WarpbotToolsTab; period?: UsagePeriod }) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextTab = next.tab ?? tab;
      const nextPeriod = next.period ?? period;
      if (nextTab === DEFAULT_WARPBOT_TOOLS_TAB) params.delete("tab");
      else params.set("tab", nextTab);
      if (nextPeriod === DEFAULT_USAGE_PERIOD) params.delete("period");
      else params.set("period", nextPeriod);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, period, router, searchParams, tab],
  );

  const usageWindow = useMemo(() => resolveUsageWindow(period, now), [period, now]);
  const catalogWindow = useMemo(() => resolveUsageWindow("30d", now), [now]);
  const usage = useAdminWarpbotToolUsage(usageWindow, tab === "usage");
  const catalogUsage = useAdminWarpbotToolUsage(catalogWindow, tab === "catalog");

  const canReadSettings = hasPermission(access, ADMIN_PERMISSIONS.settingsRead);
  const settings = useAdminPlatformSettings(tab === "catalog" && canReadSettings);

  const active = tab === "usage" ? usage : catalogUsage;
  const refreshing = active.isFetching || (tab === "catalog" && settings.isFetching);

  const tabs = useMemo(() => WARPBOT_TOOLS_TABS.map((value) => ({ value, label: t(`tabs.${value}`) })), [t]);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Toolbox size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setNow(new Date());
              if (tab === "catalog" && canReadSettings) void settings.refetch();
            }}
          >
            <ArrowsClockwise size={14} className={cn(refreshing && "animate-spin")} />
            {t("refresh")}
          </Button>
        }
      />

      <AdminFilterTabs tabs={tabs} value={tab} onChange={(value) => setParams({ tab: value })} label={t("tabsLabel")} />

      <div className="mt-5">
        {tab === "catalog" ? (
          <WarpbotToolsCatalogTab
            usage={catalogUsage}
            settings={settings}
            canReadSettings={canReadSettings}
            canManageSettings={hasPermission(access, ADMIN_PERMISSIONS.settingsManage)}
          />
        ) : (
          <WarpbotToolsUsageTab
            usage={usage}
            period={period}
            windowFrom={usageWindow.from}
            onChoosePeriod={(next) => setParams({ period: next })}
            canReadWorkspaces={hasPermission(access, ADMIN_PERMISSIONS.workspacesRead)}
          />
        )}
      </div>
    </AdminPage>
  );
}
