"use client";

/**
 * One workspace across every marketplace plugin, on the admin workspace page: the same effective
 * state and Enable / Disable / Reset as a plugin's "Workspaces" tab, for this workspace only.
 *
 * Enforcement is the server's; the rules for filtering, sorting and which actions a row offers are
 * shared with the plugin tab through lib/admin/plugin-workspace-access.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { PluginOverrideDialog } from "@/components/admin/plugins/plugin-override-dialog";
import { PluginStateCell, RowActions } from "@/components/admin/plugins/plugin-workspaces-tab";
import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { Button } from "@/components/ui/button";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { useAdminWorkspaceMembers } from "@/hooks/use-admin-workspaces";
import { useAdminWorkspacePlugins, useSetAdminWorkspacePluginOverride } from "@/hooks/use-admin-plugin-workspaces";
import {
  EMPTY_PLUGIN_WORKSPACE_FILTER,
  filterPluginWorkspaceRows,
  sortPluginWorkspaceRows,
  summarizePluginWorkspaceRows,
  type PluginWorkspaceFilter,
} from "@/lib/admin/plugin-workspace-access";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminPluginWorkspaceRowDto, PluginOverrideAction } from "@/types/admin-plugin-workspaces";

type Pending = { row: AdminPluginWorkspaceRowDto; action: PluginOverrideAction };

export function WorkspacePluginsTab({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("adminPlugins.workspaceAccess");
  const locale = useLocale();
  const query = useAdminWorkspacePlugins(workspaceId);
  const membersQuery = useAdminWorkspaceMembers(workspaceId);
  const mutation = useSetAdminWorkspacePluginOverride(workspaceId);
  const [filter, setFilter] = useState<PluginWorkspaceFilter>(EMPTY_PLUGIN_WORKSPACE_FILTER);
  const [pending, setPending] = useState<Pending | null>(null);

  const rows = useMemo(() => query.data?.plugins ?? [], [query.data]);
  const visible = useMemo(
    () => sortPluginWorkspaceRows(filterPluginWorkspaceRows(rows, filter), "plugin", "asc"),
    [rows, filter],
  );
  const summary = useMemo(() => summarizePluginWorkspaceRows(rows), [rows]);
  const names = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.userId, member.fullName ?? member.email ?? member.userId])),
    [membersQuery.data],
  );

  if (query.isPending) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface-2" aria-busy="true" />;
  }

  if (query.isError || !query.data) {
    return (
      <AdminPanel>
        <div className="flex items-start gap-3 px-4 py-6 text-sm">
          <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">{t("loadError")}</p>
            <p className="mt-1 text-ink-muted">{getErrorMessage(query.error, t("loadErrorFallback"))}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        </div>
      </AdminPanel>
    );
  }

  const submit = async (reason: string) => {
    if (!pending) return;
    await mutation.mutateAsync({
      pluginKey: pending.row.pluginKey,
      request: { action: pending.action, ...(reason ? { reason } : {}) },
    });
    toast.success(t(`toast.${pending.action}`, { plugin: pending.row.pluginLabel }));
    setPending(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("workspaceTab.title")}</h2>
        <p className="mt-0.5 text-[12px] text-ink-muted">
          {t("workspaceTab.body", { plan: query.data.planSlug ?? t("noPlan") })}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-muted">
          {t("workspaceTab.summary", { enabled: summary.enabled, disabled: summary.disabled, overridden: summary.overridden })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter.search}
          onChange={(event) => setFilter({ ...filter, search: event.target.value })}
          placeholder={t("filters.searchPlugins")}
          aria-label={t("filters.searchPlugins")}
          className="h-8 w-full max-w-xs rounded-lg border border-hairline bg-surface-1 px-2.5 text-[13px] text-ink focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <FilterChipGroup label={t("filters.stateLabel")}>
          {(["all", "enabled", "disabled"] as const).map((state) => (
            <FilterChip key={state} selected={filter.state === state} onClick={() => setFilter({ ...filter, state })}>
              {t(`filters.state.${state}`)}
            </FilterChip>
          ))}
        </FilterChipGroup>
      </div>

      <AdminPanel>
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
            {rows.length === 0 ? t("workspaceTab.noPlugins") : t("table.noMatches")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                  <th className="px-3 py-2">{t("columns.plugin")}</th>
                  <th className="px-3 py-2">{t("columns.state")}</th>
                  <th className="px-3 py-2">{t("columns.list")}</th>
                  <th className="px-3 py-2">{t("columns.connected")}</th>
                  <th className="px-3 py-2 text-right">{t("columns.usage")}</th>
                  <th className="px-3 py-2 text-right">{t("columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.pluginKey} className="border-b border-hairline/60 align-top last:border-b-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <PluginGlyph
                          plugin={{ pluginKey: row.pluginKey, avatarUrl: row.pluginAvatarUrl, label: row.pluginLabel }}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/plugins/${encodeURIComponent(row.pluginKey)}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {row.pluginLabel}
                          </Link>
                          <p className="font-mono text-[11px] text-ink-muted">{row.pluginKey}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <PluginStateCell row={row} />
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-muted">
                      {row.onWorkspaceList ? t("list.added") : t("list.notAdded")}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {row.connectedUserIds.length === 0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        <span className={cn(!row.enabled && "text-ink-muted")}>
                          {row.connectedUserIds.map((id) => names.get(id) ?? id).join(", ")}
                          {!row.enabled ? <span className="block text-[11px]">{t("connected.kept")}</span> : null}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.usageCount}
                      {row.lastUsedAt ? (
                        <p className="text-[11px] text-ink-muted">
                          {t("lastUsed", {
                            date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.lastUsedAt)),
                          })}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <RowActions row={row} onAction={(action) => setPending({ row, action })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      <PluginOverrideDialog
        action={pending?.action ?? null}
        target={pending ? t("workspaceTab.target", { plugin: pending.row.pluginLabel, workspace: pending.row.workspaceName }) : ""}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onSubmit={submit}
        isSaving={mutation.isPending}
      />
    </div>
  );
}
