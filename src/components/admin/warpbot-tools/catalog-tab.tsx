"use client";

/**
 * Catalog: what WarpBot can do on this platform. Read-only.
 *
 * WHY THE COPY CATALOG AND NOT THE MANIFEST
 *   `GET /api/v1/assistant/tools` is workspace-scoped: it answers for a workspace member, already
 *   filtered for them. A platform page has no workspace to ask with, so the built-in list here is
 *   the web's copy catalog (`lib/assistant/warpbot-tools-catalog.ts`), plus any built-in tool the
 *   usage data shows that the copy does not know yet. The page says which list it is.
 *
 * Web search is the one tool an admin can switch, and the switch is a platform setting
 * (`flags.warpbot_web_search`). This tab shows its value and links to it; it does not write it.
 */

import { ArrowRight, Globe, Info } from "@phosphor-icons/react/dist/ssr";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  formatCount,
  formatRate,
  StatusBadge,
} from "@/components/admin/warpbot-tools/tool-format";
import { settingHref } from "@/lib/admin/platform-settings";
import { toolSuccessRate, WEB_SEARCH_FLAG_KEY, webSearchFlagView } from "@/lib/admin/warpbot-tools-usage";
import { humaniseToolName, WARPBOT_TOOL_COPY } from "@/lib/assistant/warpbot-tools-catalog";
import type { PlatformSettingsConsoleDto } from "@/types/admin-platform-settings";
import type { AdminToolInsightsDto, AdminToolInsightsToolDto } from "@/types/admin-warpbot-tools";

interface CatalogRow {
  name: string;
  displayName: string;
  description: string;
  usage: AdminToolInsightsToolDto | null;
}

function catalogRows(usage: AdminToolInsightsDto | undefined): CatalogRow[] {
  const builtInUsage = new Map(
    (usage?.byTool ?? []).filter((row) => row.source === "builtin").map((row) => [row.tool, row] as const),
  );
  const rows: CatalogRow[] = Object.entries(WARPBOT_TOOL_COPY).map(([name, copy]) => ({
    name,
    displayName: copy.displayName,
    description: copy.description,
    usage: builtInUsage.get(name) ?? null,
  }));
  for (const [name, row] of builtInUsage) {
    if (!Object.prototype.hasOwnProperty.call(WARPBOT_TOOL_COPY, name)) {
      rows.push({ name, displayName: humaniseToolName(name), description: "", usage: row });
    }
  }
  return rows;
}

export function WarpbotToolsCatalogTab({
  usage,
  settings,
  canReadSettings,
  canManageSettings,
}: {
  usage: UseQueryResult<AdminToolInsightsDto>;
  settings: UseQueryResult<PlatformSettingsConsoleDto>;
  canReadSettings: boolean;
  canManageSettings: boolean;
}) {
  const t = useTranslations("adminPlugins.warpbotTools.catalog");
  const tSource = useTranslations("adminPlugins.warpbotTools.source");

  const rows = useMemo(() => catalogRows(usage.data), [usage.data]);
  const flagSetting = settings.data?.settings.find((setting) => setting.key === WEB_SEARCH_FLAG_KEY) ?? null;
  const flag = webSearchFlagView(flagSetting);
  const webSearchUsage = usage.data?.byTool.find((row) => row.source === "web_search") ?? null;
  const usageAvailable = usage.status === "success";

  const flagState = !canReadSettings ? "unknown" : settings.isPending ? null : flag.state;
  const flagNotes = [
    flag.deniedWorkspaces > 0 ? t("webSearch.flagDenied", { count: flag.deniedWorkspaces }) : null,
    flag.scopedOverrides > 0 ? t("webSearch.flagOverrides", { count: flag.scopedOverrides }) : null,
    flag.rolloutPercent !== null ? t("webSearch.flagRollout", { percent: flag.rolloutPercent }) : null,
  ].filter((note): note is string => Boolean(note));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <Globe size={14} className="text-ink-muted" />
            {t("webSearch.title")}
          </h2>
          <span className="text-[12px] text-ink-muted">{t("webSearch.subtitle")}</span>
        </div>
        <AdminPanel>
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline/60 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">
                {t("webSearch.flagLabel")} <code className="ml-1 font-mono text-[11px] text-ink-muted">{WEB_SEARCH_FLAG_KEY}</code>
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {!canReadSettings
                  ? t("webSearch.flagNoAccess")
                  : settings.isError
                    ? t("webSearch.flagUnavailable")
                    : [t("webSearch.flagHint"), ...flagNotes].join(" · ")}
              </p>
            </div>
            {flagState ? (
              <StatusBadge tone={flagState}>{t(`webSearch.state.${flagState}`)}</StatusBadge>
            ) : (
              <span className="h-4 w-10 animate-pulse rounded bg-surface-2" aria-hidden />
            )}
            <Link
              href={settingHref(WEB_SEARCH_FLAG_KEY)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              {canManageSettings ? t("webSearch.changeInSettings") : t("webSearch.openInSettings")}
              <ArrowRight size={12} />
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline/60 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">
                {t("webSearch.ceilingLabel")}{" "}
                <code className="ml-1 font-mono text-[11px] text-ink-muted">ASSISTANT_CHAT_WEB_SEARCH_ENABLED</code>
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">{t("webSearch.ceilingHint")}</p>
            </div>
            <StatusBadge tone="off">{t("webSearch.ceilingNotVisible")}</StatusBadge>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">{t("webSearch.usageLabel")}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {!usageAvailable
                  ? usage.isPending
                    ? t("loading")
                    : t("usageUnavailable")
                  : webSearchUsage
                    ? t("webSearch.usageLine", {
                        calls: formatCount(webSearchUsage.calls),
                        rate: formatRate(toolSuccessRate(webSearchUsage)),
                        workspaces: formatCount(webSearchUsage.workspaces),
                      })
                    : t("webSearch.usageNone")}
              </p>
            </div>
          </div>
        </AdminPanel>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-semibold text-ink">{t("builtIn.title")}</h2>
          <span className="text-[12px] text-ink-muted">{t("builtIn.subtitle", { count: rows.length })}</span>
        </div>
        <AdminPanel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-hairline/60 text-left text-[11px] font-medium text-ink-muted">
                  <th className="px-4 py-2 font-medium">{t("builtIn.columns.tool")}</th>
                  <th className="px-4 py-2 font-medium">{t("builtIn.columns.description")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("builtIn.columns.calls")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("builtIn.columns.success")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-hairline/60 align-top last:border-b-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{row.displayName}</div>
                      <code className="font-mono text-[11px] text-ink-muted">{row.name}</code>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{row.description || t("builtIn.noCopy")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                      {usageAvailable ? formatCount(row.usage?.calls ?? 0) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                      {usageAvailable && row.usage ? formatRate(toolSuccessRate(row.usage)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-ink-muted">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            {t("builtIn.note", { webSearch: tSource("webSearch") })}{" "}
            {!usageAvailable && !usage.isPending ? t("usageUnavailable") : null}
          </span>
        </p>
        <p className="mt-1 text-[12px] text-ink-muted">
          {t("pluginsNote")}{" "}
          <Link href="/admin/plugins" className="font-medium text-primary hover:underline">
            {t("pluginsLink")}
          </Link>
        </p>
      </section>
    </div>
  );
}
