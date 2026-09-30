"use client";

import { Pulse, ShieldWarning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Building2,
  Check,
  Copy,
  Shield,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { buttonVariants } from "@/components/ui/button";
import { applyClientListState, paginateRows, type ListStateConfig } from "@/lib/admin/list-state";
import { matchesSearch } from "@/lib/admin/search-text";
import { billingService } from "@/services/billing.service";
import type { UsageAlertDto } from "@/types/billing";

const PAGE_SIZE = 20;

/**
 * Alerts are grouped by subscription server-side, and a workspace whose name lookup failed comes
 * back as the empty GUID — so neither the workspace id nor the name is unique. The arrival index is.
 */
type AlertRow = UsageAlertDto & { rowId: string };

/**
 * Usage alerts are computed, not stored: one row per workspace that consumed more than 50,000
 * credits in the last 24 hours (BillingAnalyticsService.GetUsageAlertsAsync). That list is small
 * and arrives whole, so it is filtered, ordered and paged here with `applyClientListState`.
 *
 * The DTO carries no alert type or severity — `reason` is one template filled with the same
 * number as `consumedCreditsIn24h` — so the only property worth filtering is the consumption.
 */
const ALERT_LIST_CONFIG: ListStateConfig = {
  filters: [{ key: "consumption", kind: "numberRange" }],
  sortFields: ["consumption", "workspace"],
  defaultSort: { field: "consumption", direction: "desc" },
  columns: [{ id: "workspace" }, { id: "id" }, { id: "reason" }, { id: "consumption" }, { id: "actions" }],
};

function IdBadge({
  id,
  type,
  name,
}: {
  id: string;
  type: "workspace" | "user" | "system" | "admin";
  name?: string | null;
}) {
  const t = useTranslations("adminBillingLedger");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortId = id.substring(0, 8);
  const displayName = name && name.trim() !== "" ? name : shortId;

  return (
    <div className="flex items-center gap-1.5 min-w-[120px]">
      <div className="p-1 rounded bg-surface-1/50 border border-border-dim border-b-border">
        {type === "workspace" && (
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {type === "user" && (
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {type === "admin" && <Shield className="w-3.5 h-3.5 text-primary" />}
        {type === "system" && <Bot className="w-3.5 h-3.5 text-blue-400" />}
      </div>
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-1 border border-border-dim border-b-border cursor-pointer hover:bg-surface-2 hover:border-border transition-colors group relative"
        onClick={handleCopy}
        title={t("idBadge.copyTooltip", { id })}
      >
        <span
          className={`text-xs font-mono font-medium ${type === "system" ? "text-blue-400" : type === "admin" ? "text-primary" : "text-foreground-muted"}`}
        >
          {displayName}
        </span>
        {copied ? (
          <Check className="w-3 h-3 text-semantic-success" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
}

export function AdminAlertsTab() {
  const t = useTranslations("adminBillingLedger.lists.alerts");
  const tLists = useTranslations("adminBillingLedger.lists");
  const list = useAdminListState(ALERT_LIST_CONFIG);
  const { state } = list;

  const alertsQuery = useQuery({
    queryKey: ["global-usage-alerts"],
    queryFn: () => billingService.getUsageAlerts(),
  });

  const rows = useMemo<AlertRow[]>(
    () => (alertsQuery.data ?? []).map((alert, index) => ({ ...alert, rowId: `${index}:${alert.workspaceId}` })),
    [alertsQuery.data],
  );
  const filtered = useMemo(
    () =>
      applyClientListState(
        rows,
        state,
        {
          search: (alert: AlertRow) => [alert.workspaceName, alert.workspaceId],
          filters: { consumption: (alert) => alert.consumedCreditsIn24h },
          sort: {
            consumption: (alert) => alert.consumedCreditsIn24h,
            workspace: (alert) => alert.workspaceName,
          },
        },
        matchesSearch,
      ),
    [rows, state],
  );
  const page = paginateRows(filtered, state.page, PAGE_SIZE);

  const filterFields: AdminFilterField[] = [
    {
      key: "consumption",
      label: t("filters.consumption"),
      icon: <Pulse size={13} />,
      kind: "numberRange",
      unit: tLists("creditsUnit"),
      step: 1,
      presets: [
        { label: t("consumptionPresets.over100k"), min: 100_000 },
        { label: t("consumptionPresets.over500k"), min: 500_000 },
        { label: t("consumptionPresets.over1m"), min: 1_000_000 },
      ],
    },
  ];

  const columns: AdminColumn<AlertRow>[] = [
    {
      id: "workspace",
      header: t("columns.workspace"),
      primary: true,
      sortField: "workspace",
      cell: (alert) => <span className="text-sm font-medium text-ink">{alert.workspaceName}</span>,
    },
    {
      id: "id",
      header: t("columns.id"),
      className: "w-[200px]",
      cell: (alert) => (
        <Link
          href={`/billing/workspace/${alert.workspaceId}`}
          className="block hover:opacity-80 transition-opacity"
        >
          <IdBadge id={alert.workspaceId} type="workspace" />
        </Link>
      ),
    },
    {
      id: "reason",
      header: t("columns.reason"),
      cell: (alert) => (
        <div className="flex items-center gap-1.5 text-rose-500 font-medium">
          <WarningCircle size={16} aria-hidden />
          {/* The server's `reason` is one English template around this same number. */}
          <span className="text-sm">{t("reason", { credits: alert.consumedCreditsIn24h.toLocaleString() })}</span>
        </div>
      ),
    },
    {
      id: "consumption",
      header: t("columns.consumption"),
      align: "right",
      sortField: "consumption",
      defaultDirection: "desc",
      className: "w-[170px]",
      cell: (alert) => (
        <span className="font-semibold font-mono text-rose-500">
          {alert.consumedCreditsIn24h.toLocaleString()} cr
        </span>
      ),
    },
    {
      id: "actions",
      header: t("columns.actions"),
      align: "right",
      className: "w-[130px]",
      cell: (alert) => (
        <Link
          href={`/billing/workspace/${alert.workspaceId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("investigate")}
        </Link>
      ),
    },
  ];

  return (
    <>
      <div className="flex items-start gap-2 pt-4">
        <ShieldWarning size={18} weight="duotone" className="mt-0.5 shrink-0 text-rose-500" aria-hidden />
        <div>
          <h2 className="text-[13px] font-semibold text-ink">{t("title")}</h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("description")}</p>
        </div>
      </div>

      <AdminListToolbar
        list={list}
        searchPlaceholder={t("searchPlaceholder")}
        filters={filterFields}
        count={alertsQuery.isPending ? null : filtered.length}
        countLabel={t("count", { count: filtered.length })}
        display={{
          sortOptions: [
            { field: "consumption", label: t("sort.consumption") },
            { field: "workspace", label: t("sort.workspace") },
          ],
          columns: columns
            .filter((column) => !column.primary && column.id !== "actions")
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={page.rows}
          rowKey={(alert) => alert.rowId}
          isPending={alertsQuery.isPending}
          isError={alertsQuery.isError}
          onRetry={() => void alertsQuery.refetch()}
          empty={{
            title: t("emptyTitle"),
            description: t("emptyDescription"),
            icon: <ShieldWarning size={20} weight="duotone" />,
          }}
          pagination={{ page: page.page, pageCount: page.pageCount, total: page.total, pageSize: PAGE_SIZE }}
          caption={t("title")}
        />
      </AdminPanel>
    </>
  );
}
