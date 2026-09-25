"use client";

/**
 * A marketplace plugin across every workspace (owner request 2026-09-25: "cần bật tắt hiển thị ở
 * các workspace"): its platform default and plan rule, then one row per workspace with the
 * effective state, whether that is inherited or an override, who connected it and how much WarpBot
 * used it — and Enable / Disable / Reset, one at a time, for a selection, or for every workspace on
 * a plan.
 *
 * Enforcement is the server's. Turning a plugin off here hides it from that workspace's marketplace
 * and stops WarpBot using it there; members' connections are kept, inert, and come back as they
 * were if it is turned on again.
 *
 * The table is deliberately plain (native inputs, one <table>): the shared admin list toolkit can
 * replace its chrome without touching the rules in lib/admin/plugin-workspace-access.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CaretDown, CaretRight, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { PluginOverrideDialog } from "@/components/admin/plugins/plugin-override-dialog";
import { Button } from "@/components/ui/button";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { useAdminWorkspaceMembers } from "@/hooks/use-admin-workspaces";
import {
  useAdminPluginWorkspaces,
  useApplyAdminPluginOverride,
  useSetAdminPluginAvailability,
} from "@/hooks/use-admin-plugin-workspaces";
import {
  availabilityRequest,
  buildOverrideRequest,
  EMPTY_PLUGIN_WORKSPACE_FILTER,
  filterPluginWorkspaceRows,
  isOverridden,
  planOptions,
  PLUGIN_WORKSPACE_DEFAULTS,
  rowOverrideActions,
  sortPluginWorkspaceRows,
  sourceKey,
  summarizePluginWorkspaceRows,
  type PluginWorkspaceFilter,
  type PluginWorkspaceSortKey,
  type SortDirection,
} from "@/lib/admin/plugin-workspace-access";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type {
  AdminPluginAvailabilityDto,
  AdminPluginWorkspaceDefault,
  AdminPluginWorkspaceRowDto,
  PluginOverrideAction,
} from "@/types/admin-plugin-workspaces";

const CONTROL =
  "h-8 rounded-lg border border-hairline bg-surface-1 px-2 text-[13px] text-ink focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20";

type PendingOverride =
  | { scope: "rows"; action: PluginOverrideAction; workspaceIds: string[]; target: string }
  | { scope: "plans"; action: PluginOverrideAction };

export function PluginWorkspacesTab({ pluginKey }: { pluginKey: string }) {
  const t = useTranslations("adminPlugins.workspaceAccess");
  const query = useAdminPluginWorkspaces(pluginKey);
  const applyMutation = useApplyAdminPluginOverride(pluginKey);

  const [filter, setFilter] = useState<PluginWorkspaceFilter>(EMPTY_PLUGIN_WORKSPACE_FILTER);
  const [sortKey, setSortKey] = useState<PluginWorkspaceSortKey>("workspace");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOverride | null>(null);
  const [bulkPlans, setBulkPlans] = useState<string[]>([]);

  const rows = useMemo(() => query.data?.workspaces ?? [], [query.data]);
  const plans = useMemo(() => planOptions(rows), [rows]);
  const visible = useMemo(
    () => sortPluginWorkspaceRows(filterPluginWorkspaceRows(rows, filter), sortKey, sortDirection),
    [rows, filter, sortKey, sortDirection],
  );
  const summary = useMemo(() => summarizePluginWorkspaceRows(rows), [rows]);
  const selectedVisible = visible.filter((row) => selected.has(row.workspaceId));
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;

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

  const toggleSort = (key: PluginWorkspaceSortKey) => {
    if (key === sortKey) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection(key === "workspace" || key === "plan" ? "asc" : "desc");
    }
  };

  const toggleRow = (workspaceId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });

  const submitOverride = async (reason: string) => {
    if (!pending) return;
    const request =
      pending.scope === "rows"
        ? buildOverrideRequest({ action: pending.action, reason, workspaceIds: pending.workspaceIds })
        : buildOverrideRequest({ action: pending.action, reason, planSlugs: bulkPlans });
    if (pending.scope === "plans" && !request.planSlugs) {
      throw new Error(t("bulk.choosePlan"));
    }
    const result = await applyMutation.mutateAsync(request);
    toast.success(t("toast.applied", { changed: result.changed, unchanged: result.unchanged }));
    setPending(null);
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col gap-5">
      <AvailabilityCard
        key={`${query.data.availability.default}-${(query.data.availability.allowedPlans ?? []).join(",")}`}
        pluginKey={pluginKey}
        availability={query.data.availability}
        knownPlans={plans}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{t("table.title")}</h2>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {t("table.summary", {
                total: summary.total,
                enabled: summary.enabled,
                disabled: summary.disabled,
                overridden: summary.overridden,
                inUse: summary.inUse,
              })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={plans.length === 0 || query.data.availability.default === "retired"}
            onClick={() => {
              setBulkPlans([]);
              setPending({ scope: "plans", action: "enable" });
            }}
          >
            {t("bulk.byPlan")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={filter.search}
            onChange={(event) => setFilter({ ...filter, search: event.target.value })}
            placeholder={t("filters.search")}
            aria-label={t("filters.search")}
            className={cn(CONTROL, "w-full max-w-xs px-2.5")}
          />
          <FilterChipGroup label={t("filters.stateLabel")}>
            {(["all", "enabled", "disabled"] as const).map((state) => (
              <FilterChip
                key={state}
                selected={filter.state === state}
                onClick={() => setFilter({ ...filter, state })}
              >
                {t(`filters.state.${state}`)}
              </FilterChip>
            ))}
          </FilterChipGroup>
          <select
            aria-label={t("filters.sourceLabel")}
            value={filter.source}
            onChange={(event) =>
              setFilter({ ...filter, source: event.target.value as PluginWorkspaceFilter["source"] })
            }
            className={CONTROL}
          >
            {(["all", "inherited", "overridden"] as const).map((source) => (
              <option key={source} value={source}>
                {t(`filters.source.${source}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t("filters.planLabel")}
            value={filter.plan}
            onChange={(event) => setFilter({ ...filter, plan: event.target.value })}
            className={CONTROL}
          >
            <option value="all">{t("filters.plan.all")}</option>
            <option value="none">{t("filters.plan.none")}</option>
            {plans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </div>

        {selectedVisible.length > 0 ? (
          <div
            data-testid="plugin-workspaces-bulk-bar"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[13px]"
          >
            <span className="mr-auto font-medium">{t("bulk.selected", { count: selectedVisible.length })}</span>
            {(["enable", "disable", "reset"] as const).map((action) => (
              <Button
                key={action}
                size="sm"
                variant={action === "disable" ? "destructive" : "outline"}
                onClick={() =>
                  setPending({
                    scope: "rows",
                    action,
                    workspaceIds: selectedVisible.map((row) => row.workspaceId),
                    target: t("bulk.target", { count: selectedVisible.length }),
                  })
                }
              >
                {t(`actions.${action}`)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("bulk.clear")}
            </Button>
          </div>
        ) : null}

        <AdminPanel>
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
              {rows.length === 0 ? t("table.noWorkspaces") : t("table.noMatches")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={t("table.selectAll")}
                        checked={allVisibleSelected}
                        onChange={() =>
                          setSelected(allVisibleSelected ? new Set() : new Set(visible.map((row) => row.workspaceId)))
                        }
                      />
                    </th>
                    <SortHeader label={t("columns.workspace")} sortKey="workspace" active={sortKey} direction={sortDirection} onSort={toggleSort} />
                    <SortHeader label={t("columns.plan")} sortKey="plan" active={sortKey} direction={sortDirection} onSort={toggleSort} />
                    <SortHeader label={t("columns.state")} sortKey="state" active={sortKey} direction={sortDirection} onSort={toggleSort} />
                    <th className="px-3 py-2">{t("columns.list")}</th>
                    <SortHeader label={t("columns.connected")} sortKey="connected" active={sortKey} direction={sortDirection} onSort={toggleSort} align="right" />
                    <SortHeader label={t("columns.usage")} sortKey="usage" active={sortKey} direction={sortDirection} onSort={toggleSort} align="right" />
                    <th className="px-3 py-2 text-right">{t("columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <WorkspaceRow
                      key={row.workspaceId}
                      row={row}
                      selected={selected.has(row.workspaceId)}
                      expanded={expanded === row.workspaceId}
                      onToggleSelected={() => toggleRow(row.workspaceId)}
                      onToggleExpanded={() => setExpanded(expanded === row.workspaceId ? null : row.workspaceId)}
                      onAction={(action) =>
                        setPending({ scope: "rows", action, workspaceIds: [row.workspaceId], target: row.workspaceName })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminPanel>
      </div>

      <PluginOverrideDialog
        action={pending?.action ?? null}
        target={pending?.scope === "rows" ? pending.target : t("bulk.planTarget")}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onSubmit={submitOverride}
        isSaving={applyMutation.isPending}
        extra={
          pending?.scope === "plans" ? (
            <PlanActionPicker
              plans={plans}
              chosen={bulkPlans}
              onChosen={setBulkPlans}
              action={pending.action}
              onAction={(action) => setPending({ scope: "plans", action })}
            />
          ) : undefined
        }
      />
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: PluginWorkspaceSortKey;
  active: PluginWorkspaceSortKey;
  direction: SortDirection;
  onSort: (key: PluginWorkspaceSortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th className={cn("px-3 py-2", align === "right" && "text-right")} aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 uppercase", isActive ? "text-ink" : "hover:text-ink")}
      >
        {label}
        {isActive ? direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : null}
      </button>
    </th>
  );
}

/** Enabled/Disabled, and why: inherited from the default or the plan rule, or an override. */
export function PluginStateCell({ row }: { row: AdminPluginWorkspaceRowDto }) {
  const t = useTranslations("adminPlugins.workspaceAccess");
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium",
          row.enabled
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-border bg-surface-2 text-ink-muted",
        )}
      >
        {row.enabled ? t("state.enabled") : t("state.disabled")}
      </span>
      <span className="text-[11px] text-ink-muted">
        {t(`source.${sourceKey(row)}`, { plans: (row.allowedPlans ?? []).join(", ") })}
        {isOverridden(row) && row.overrideReason ? ` — ${row.overrideReason}` : ""}
      </span>
    </div>
  );
}

function WorkspaceRow({
  row,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
  onAction,
}: {
  row: AdminPluginWorkspaceRowDto;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onAction: (action: PluginOverrideAction) => void;
}) {
  const t = useTranslations("adminPlugins.workspaceAccess");
  const locale = useLocale();
  const lastUsed = row.lastUsedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.lastUsedAt))
    : null;

  return (
    <>
      <tr className={cn("border-b border-hairline/60 align-top last:border-b-0", selected && "bg-primary/5")}>
        <td className="px-3 py-2.5">
          <input
            type="checkbox"
            aria-label={t("table.selectRow", { workspace: row.workspaceName })}
            checked={selected}
            onChange={onToggleSelected}
          />
        </td>
        <td className="px-3 py-2.5">
          <Link href={`/admin/workspaces/${row.workspaceSlug}`} className="font-medium text-ink hover:underline">
            {row.workspaceName}
          </Link>
          <p className="text-[11px] text-ink-muted">
            {row.workspaceSlug}
            {row.workspaceStatus !== "active" ? ` · ${t("workspaceStatus.suspended")}` : ""}
          </p>
        </td>
        <td className="px-3 py-2.5 text-ink-muted">{row.planSlug ?? t("noPlan")}</td>
        <td className="px-3 py-2.5">
          <PluginStateCell row={row} />
        </td>
        <td className="px-3 py-2.5 text-[12px] text-ink-muted">
          {row.onWorkspaceList ? t("list.added") : t("list.notAdded")}
        </td>
        <td className="px-3 py-2.5 text-right">
          {row.connectedUserIds.length > 0 ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 tabular-nums text-ink hover:underline"
            >
              {expanded ? <CaretDown size={11} /> : <CaretRight size={11} />}
              {t("connectedCount", { count: row.connectedUserIds.length })}
            </button>
          ) : (
            <span className="text-ink-muted">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          <span className="text-ink">{row.usageCount}</span>
          {lastUsed ? <p className="text-[11px] text-ink-muted">{t("lastUsed", { date: lastUsed })}</p> : null}
        </td>
        <td className="px-3 py-2.5">
          <RowActions row={row} onAction={onAction} />
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-hairline/60 bg-surface-2/40">
          <td />
          <td colSpan={7} className="px-3 py-2.5">
            <ConnectedMembers workspaceId={row.workspaceId} userIds={row.connectedUserIds} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function RowActions({
  row,
  onAction,
}: {
  row: AdminPluginWorkspaceRowDto;
  onAction: (action: PluginOverrideAction) => void;
}) {
  const t = useTranslations("adminPlugins.workspaceAccess");
  const actions = rowOverrideActions(row);
  if (actions.length === 0) {
    return <p className="text-right text-[11px] text-ink-muted">{t("actions.noneRetired")}</p>;
  }
  return (
    <div className="flex justify-end gap-1.5">
      {actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === "disable" ? "destructive" : "outline"}
          onClick={() => onAction(action)}
        >
          {t(`actions.${action}`)}
        </Button>
      ))}
    </div>
  );
}

/**
 * Who connected it, named from the admin workspace roster. Fetched only when a row is opened: one
 * roster per workspace, and nobody opens them all.
 */
export function ConnectedMembers({ workspaceId, userIds }: { workspaceId: string; userIds: readonly string[] }) {
  const t = useTranslations("adminPlugins.workspaceAccess");
  const membersQuery = useAdminWorkspaceMembers(workspaceId);
  const byId = new Map((membersQuery.data ?? []).map((member) => [member.userId, member]));

  if (membersQuery.isPending) return <p className="text-[12px] text-ink-muted">{t("connected.loading")}</p>;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">{t("connected.title")}</p>
      <p className="text-[11px] text-ink-muted">{t("connected.kept")}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {userIds.map((userId) => {
          const member = byId.get(userId);
          return (
            <li key={userId} className="text-ink">
              {member?.fullName ?? member?.email ?? <span className="font-mono text-ink-muted">{userId}</span>}
              {member?.email && member.fullName ? <span className="ml-1 text-ink-muted">{member.email}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlanActionPicker({
  plans,
  chosen,
  onChosen,
  action,
  onAction,
}: {
  plans: readonly string[];
  chosen: string[];
  onChosen: (plans: string[]) => void;
  action: PluginOverrideAction;
  onAction: (action: PluginOverrideAction) => void;
}) {
  const t = useTranslations("adminPlugins.workspaceAccess");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-ink">{t("bulk.actionLabel")}</span>
        <div className="flex gap-1.5">
          {(["enable", "disable", "reset"] as const).map((option) => (
            <FilterChip key={option} selected={action === option} onClick={() => onAction(option)}>
              {t(`actions.${option}`)}
            </FilterChip>
          ))}
        </div>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[12px] font-medium text-ink">{t("bulk.plansLabel")}</legend>
        <div className="flex flex-wrap gap-3">
          {plans.map((plan) => (
            <label key={plan} className="inline-flex items-center gap-1.5 text-[13px]">
              <input
                type="checkbox"
                checked={chosen.includes(plan)}
                onChange={() =>
                  onChosen(chosen.includes(plan) ? chosen.filter((value) => value !== plan) : [...chosen, plan])
                }
              />
              {plan}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-ink-muted">{t("bulk.plansHint")}</p>
      </fieldset>
    </div>
  );
}

/**
 * The default every workspace inherits, and the plan rule that narrows it. Saving writes one audit
 * record; overrides are untouched by it and keep winning.
 */
function AvailabilityCard({
  pluginKey,
  availability,
  knownPlans,
}: {
  pluginKey: string;
  availability: AdminPluginAvailabilityDto;
  knownPlans: readonly string[];
}) {
  const t = useTranslations("adminPlugins.workspaceAccess.availability");
  const mutation = useSetAdminPluginAvailability(pluginKey);
  const [choice, setChoice] = useState<AdminPluginWorkspaceDefault>(availability.default);
  const [restrict, setRestrict] = useState((availability.allowedPlans ?? []).length > 0);
  const [plans, setPlans] = useState<string[]>(availability.allowedPlans ?? []);
  const [newPlan, setNewPlan] = useState("");

  const planChoices = [...new Set([...knownPlans, ...plans])].sort();
  // The plan rule narrows "available" only. Choosing opt-in or retired keeps the stored rule as it
  // is, so switching back later brings it back rather than silently widening to every plan.
  const effectivePlans = choice === "available" ? (restrict ? plans : []) : (availability.allowedPlans ?? []);
  const dirty =
    choice !== availability.default
    || effectivePlans.slice().sort().join(",") !== (availability.allowedPlans ?? []).slice().sort().join(",");

  const save = async () => {
    try {
      await mutation.mutateAsync(availabilityRequest(choice, effectivePlans));
      toast.success(t("saved"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("saveFailed")));
    }
  };

  return (
    <AdminPanel>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{t("title")}</h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("body")}</p>
        </div>
        <div role="radiogroup" aria-label={t("title")} className="grid gap-2 md:grid-cols-3">
          {PLUGIN_WORKSPACE_DEFAULTS.map((value) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5",
                choice === value ? "border-primary/40 bg-primary/5" : "border-border hover:bg-surface-2",
              )}
            >
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink">
                <input
                  type="radio"
                  name={`availability-${pluginKey}`}
                  value={value}
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
                {t(`options.${value}.label`)}
              </span>
              <span className="text-[11px] text-ink-muted">{t(`options.${value}.hint`)}</span>
            </label>
          ))}
        </div>

        {choice === "available" ? (
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={restrict} onChange={() => setRestrict(!restrict)} />
              {t("restrictToPlans")}
            </label>
            {restrict ? (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                {planChoices.map((plan) => (
                  <FilterChip
                    key={plan}
                    selected={plans.includes(plan)}
                    onClick={() =>
                      setPlans(plans.includes(plan) ? plans.filter((value) => value !== plan) : [...plans, plan])
                    }
                  >
                    {plan}
                  </FilterChip>
                ))}
                <form
                  className="inline-flex items-center gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const slug = newPlan.trim().toLowerCase();
                    if (slug && !plans.includes(slug)) setPlans([...plans, slug]);
                    setNewPlan("");
                  }}
                >
                  <input
                    value={newPlan}
                    onChange={(event) => setNewPlan(event.target.value)}
                    placeholder={t("addPlanPlaceholder")}
                    aria-label={t("addPlanPlaceholder")}
                    className={cn(CONTROL, "w-36")}
                  />
                  <Button type="submit" size="sm" variant="outline">
                    {t("addPlan")}
                  </Button>
                </form>
                <p className="w-full text-[11px] text-ink-muted">{t("restrictHint")}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          {dirty ? <span className="text-[11px] text-ink-muted">{t("unsaved")}</span> : null}
          <Button size="sm" disabled={!dirty || mutation.isPending || (restrict && choice === "available" && plans.length === 0)} onClick={() => void save()}>
            {mutation.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </AdminPanel>
  );
}
