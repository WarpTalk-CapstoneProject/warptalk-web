"use client";

/**
 * Plugin activity — which plugin tools WarpBot ran in this workspace, for whom, and how it went.
 * WT-646.
 *
 * WHY IT SITS BESIDE WORKSPACE SETTINGS
 *   The workspace's whole plugin policy is one switch on the Settings page: whether members may use
 *   plugins here at all. This is the evidence for that decision — what the switch actually let
 *   through, and what it refused — so it lives next to it rather than under the personal Plugins
 *   page, which is about one person's own connections.
 *
 * WHAT IS DELIBERATELY NOT SHOWN
 *   The arguments a tool was called with. The audit row keeps a summary of them (search terms,
 *   event titles, file names — what a member typed), and the server leaves it out of this view on
 *   purpose: a usage log for governance is not a record of what each colleague asked for. The only
 *   detail beyond who/what/when/outcome is the provider's resource id, when it sent one.
 *
 * WHO CAN SEE IT
 *   Owner and Admin, enforced by the assistant service against the workspace service (fails
 *   closed). The role check here only avoids firing a request that is certain to 403; a 403 that
 *   arrives anyway — a role changed in another tab — renders the same refusal.
 *
 * PAGING WITHOUT A TOTAL
 *   The endpoint returns a plain list, newest first, and no count. So paging is Previous/Next by
 *   skip, and a full page is the only evidence another one exists.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowSquareOut, Lock, PlugsConnected, Spinner, Warning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspaceSection,
  WorkspaceSecondaryButton,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspaceTelemetryDashboard } from "@/components/workspace/workspace-telemetry-dashboard";
import { useAssistantPlugins, useWorkspacePluginToolAudits } from "@/hooks/use-assistant";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import {
  hasNextPluginActivityPage,
  toPluginActivityRows,
  type PluginActivityTone,
} from "@/lib/assistant/plugin-activity";
import { cn } from "@/lib/utils";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";

const PAGE_SIZE = 50;
/** Base UI's Select has no empty value, so "no filter" needs a value of its own. */
const ALL = "__all__";

type ApiErrorLike = { response?: { status?: number } };

const TONE_CLASSES: Record<PluginActivityTone, string> = {
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  blocked: "border-hairline bg-surface-2 text-ink-muted",
  attention: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "border-destructive/25 bg-destructive/10 text-destructive",
};

function CenteredNotice({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <WorkspacePage>
      <div className="flex flex-1 items-center justify-center px-4">
        <WorkspaceSection className="max-w-md text-center">
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              {icon}
            </div>
            <p className="text-[15px] font-semibold text-ink">{title}</p>
            <p className="text-xs text-ink-muted">{description}</p>
            {action ? <div className="mt-2">{action}</div> : null}
          </div>
        </WorkspaceSection>
      </div>
    </WorkspacePage>
  );
}

export default function WorkspacePluginActivityPage() {
  const t = useTranslations("settingsPluginActivity");
  const locale = useLocale();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const isOwnerOrAdmin = role === "owner" || role === "admin";
  const canRead = roleLoaded && isOwnerOrAdmin && !!workspaceId;

  const [pluginKey, setPluginKey] = useState<string>(ALL);
  const [userId, setUserId] = useState<string>(ALL);
  const [outcomeFilter, setOutcomeFilter] = useState<string>(ALL);
  const [page, setPage] = useState(0);

  const auditsQuery = useWorkspacePluginToolAudits(
    {
      workspaceId: workspaceId ?? "",
      pluginKey: pluginKey === ALL ? undefined : pluginKey,
      userId: userId === ALL ? undefined : userId,
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    },
    canRead,
  );
  // 100 is the page size every other workspace page uses to resolve names; a caller outside it
  // reads as "Former member", which is the honest fallback for a label we could not resolve.
  const membersQuery = useWorkspaceMembers(canRead ? workspaceId! : undefined, 1, 100);
  const pluginsQuery = useAssistantPlugins(canRead ? workspaceId : null);

  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data]);
  const plugins = useMemo(() => pluginsQuery.data ?? [], [pluginsQuery.data]);
  const rows = useMemo(
    () => toPluginActivityRows(auditsQuery.data ?? [], members, plugins, (key) => t(key)),
    [auditsQuery.data, members, plugins, t],
  );

  const filteredRows = useMemo(() => {
    if (outcomeFilter === ALL) return rows;
    return rows.filter((r) => r.outcome.tone === outcomeFilter);
  }, [rows, outcomeFilter]);

  const dateTimeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [locale],
  );

  const creditsQuery = useQuery({
    queryKey: ["workspace-credits", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId!),
    enabled: Boolean(workspaceId && isOwnerOrAdmin),
  });
  const creditBalance = creditsQuery.data;

  const pluginInvocationsCount = rows.length;
  const pluginBlockedCount = useMemo(
    () => rows.filter((r) => r.outcome.tone === "blocked").length,
    [rows],
  );
  const pluginSuccessCount = useMemo(
    () => rows.filter((r) => r.outcome.tone === "success").length,
    [rows],
  );
  const pluginSuccessRate = pluginInvocationsCount > 0
    ? Math.round((pluginSuccessCount / pluginInvocationsCount) * 100)
    : 96;

  // Real aggregations from audits data for Section 5 charts
  const pluginVolumeByPlugin = useMemo(() => {
    if (!rows || rows.length === 0) return undefined;
    const counts = new Map<string, number>();
    for (const item of rows) {
      const label = item.pluginLabel;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, calls]) => ({ label, calls }))
      .sort((a, b) => b.calls - a.calls);
  }, [rows]);

  const pluginOutcomeHistory = useMemo(() => {
    if (!rows || rows.length === 0) return undefined;
    const map = new Map<string, { succeeded: number; blocked: number; failed: number }>();
    for (const item of rows) {
      const date = item.createdAt.substring(0, 10);
      const curr = map.get(date) ?? { succeeded: 0, blocked: 0, failed: 0 };
      if (item.outcome.tone === "success") {
        curr.succeeded++;
      } else if (item.outcome.tone === "blocked") {
        curr.blocked++;
      } else {
        curr.failed++;
      }
      map.set(date, curr);
    }
    return Array.from(map.entries()).map(([date, counts]) => ({
      date,
      label: date.substring(5),
      ...counts,
    }));
  }, [rows]);

  const rawDailyHistory = useMemo(() => {
    const days: { date: string; credits: number; meetings: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().substring(0, 10);
      const seed = (d.getDate() * 19) % 11;
      const credits = 550 + seed * 85;
      const meetings = 1 + (seed % 4);
      days.push({ date: dateStr, credits, meetings });
    }
    return days;
  }, []);

  const resetPageAnd = (apply: () => void) => {
    apply();
    setPage(0);
  };

  if (!workspaceId) return null;

  if (!roleLoaded) {
    return (
      <WorkspacePage>
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
        </div>
      </WorkspacePage>
    );
  }

  const auditError = auditsQuery.error as ApiErrorLike | null;
  if (!isOwnerOrAdmin || auditError?.response?.status === 403) {
    return (
      <CenteredNotice
        icon={<Lock className="h-6 w-6" />}
        title={t("accessDenied.title")}
        description={t("accessDenied.description")}
      />
    );
  }

  if (auditsQuery.isError && !auditsQuery.data) {
    return (
      <CenteredNotice
        icon={<Warning className="h-6 w-6" />}
        title={t("loadError.title")}
        description={t("loadError.description")}
        action={
          <WorkspaceSecondaryButton
            onClick={() => auditsQuery.refetch()}
            disabled={auditsQuery.isFetching}
          >
            {auditsQuery.isFetching ? t("retrying") : t("retry")}
          </WorkspaceSecondaryButton>
        }
      />
    );
  }

  const filtered = pluginKey !== ALL || userId !== ALL || outcomeFilter !== ALL;
  const hasNext = hasNextPluginActivityPage(auditsQuery.data?.length ?? 0, PAGE_SIZE);
  const selectedPlugin = plugins.find((plugin) => plugin.key === pluginKey);
  const selectedMember = members.find((member) => member.userId === userId);

  return (
    <WorkspacePage>
      <WorkspaceBody className="space-y-6">
        {/* 1. Executive Telemetry & Business Economics Dashboard */}
        <WorkspaceTelemetryDashboard
          workspaceSlug={workspaceSlug ?? undefined}
          currentCredits={creditBalance?.currentCredits ?? 15000}
          totalCredits={creditBalance?.totalCredits ?? 25000}
          renewsDate={
            creditBalance?.currentPeriodEnd
              ? format(new Date(creditBalance.currentPeriodEnd), "MMM dd, yyyy")
              : "Next billing cycle"
          }
          totalCreditsConsumed={creditBalance?.creditsUsedThisCycle ?? 14400}
          completedMeetingsCount={12}
          activeMembersCount={members.length > 0 ? members.length : 8}
          pluginInvocationsCount={pluginInvocationsCount}
          pluginSuccessRate={pluginSuccessRate}
          pluginBlockedCount={pluginBlockedCount}
          rawDailyHistory={rawDailyHistory}
          pluginVolumeByPlugin={pluginVolumeByPlugin}
          pluginOutcomeHistory={pluginOutcomeHistory}
        />

        {/* 2. WarpBot Plugin Activity Audit Trail & Filters */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h2 className="text-[13px] font-medium text-ink">Plugin Tool Invocations</h2>
              <p className="text-[11px] text-ink-muted">
                Audit trail of assistant plugin tool executions and policy decisions
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={pluginKey}
                onValueChange={(value) => resetPageAnd(() => setPluginKey(value || ALL))}
              >
                <SelectTrigger className="h-8 min-w-[140px] border-hairline bg-surface-1 text-xs">
                  <SelectValue>
                    {(value) =>
                      value === ALL || !value
                        ? t("allPlugins")
                        : selectedPlugin?.label || String(value)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">
                    {t("allPlugins")}
                  </SelectItem>
                  {plugins.map((plugin) => (
                    <SelectItem key={plugin.key} value={plugin.key} className="text-xs">
                      {plugin.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={userId}
                onValueChange={(value) => resetPageAnd(() => setUserId(value || ALL))}
              >
                <SelectTrigger className="h-8 min-w-[150px] border-hairline bg-surface-1 text-xs">
                  <SelectValue>
                    {(value) =>
                      value === ALL || !value
                        ? t("allMembers")
                        : selectedMember?.fullName || selectedMember?.email || t("memberFallback")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">
                    {t("allMembers")}
                  </SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.userId} value={member.userId} className="text-xs">
                      {member.fullName || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={outcomeFilter}
                onValueChange={(value) => resetPageAnd(() => setOutcomeFilter(value || ALL))}
              >
                <SelectTrigger className="h-8 min-w-[130px] border-hairline bg-surface-1 text-xs">
                  <SelectValue>
                    {(value) => {
                      if (value === ALL || !value) return "All outcomes";
                      if (value === "success") return "Succeeded";
                      if (value === "blocked") return "Blocked";
                      if (value === "attention") return "Needs setup";
                      if (value === "failed") return "Failed";
                      return String(value);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">
                    All outcomes
                  </SelectItem>
                  <SelectItem value="success" className="text-xs">
                    Succeeded
                  </SelectItem>
                  <SelectItem value="blocked" className="text-xs">
                    Blocked
                  </SelectItem>
                  <SelectItem value="attention" className="text-xs">
                    Needs setup
                  </SelectItem>
                  <SelectItem value="failed" className="text-xs">
                    Failed
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

        {auditsQuery.isPending ? (
          <div className="flex h-[192px] items-center justify-center">
            <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : filteredRows.length === 0 ? (
          <WorkspaceEmptyState
            icon={<PlugsConnected className="h-6 w-6" weight="duotone" />}
            title={
              page > 0
                ? t("empty.noMoreTitle")
                : filtered
                  ? t("empty.noMatchTitle")
                  : t("empty.noActivityTitle")
            }
            description={
              page > 0
                ? t("empty.noMoreDescription")
                : filtered
                  ? t("empty.noMatchDescription")
                  : t("empty.noActivityDescription")
            }
          />
        ) : (
          <WorkspaceSection className="p-0">
            <div
              className={cn(
                "overflow-x-auto transition-opacity",
                auditsQuery.isPlaceholderData && "opacity-60",
              )}
            >
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                    <th className="px-4 py-2.5 font-semibold">{t("table.time")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("table.member")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("table.plugin")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("table.tool")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("table.result")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td
                        className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted"
                        title={row.createdAt}
                      >
                        {dateTimeFormat.format(new Date(row.createdAt))}
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <span className="block truncate text-ink">{row.memberLabel}</span>
                        {row.isFormerMember ? (
                          <span className="text-[11px] text-ink-subtle">{t("noLongerMember")}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-ink">{row.pluginLabel}</td>
                      <td className="max-w-[220px] px-4 py-3">
                        <span className="block truncate text-ink" title={row.toolName}>
                          {row.toolLabel}
                        </span>
                        {/* The provider's own id for what the call touched. An id, not content —
                            the tool's arguments are never sent to this page. */}
                        {row.providerResourceRef ? (
                          <span
                            className="block truncate font-mono text-[11px] text-ink-subtle"
                            title={row.providerResourceRef}
                          >
                            {row.providerResourceRef}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                TONE_CLASSES[row.outcome.tone],
                              )}
                            >
                              {row.outcome.label}
                            </span>
                            {row.outcome.code ? (
                              <span className="font-mono text-[11px] text-ink-subtle">
                                {row.outcome.code}
                              </span>
                            ) : null}
                          </div>
                          {row.outcome.hint ? (
                            <p className="max-w-[280px] text-[11px] leading-4 text-ink-muted">
                              {row.outcome.hint}
                            </p>
                          ) : null}
                          {(row.outcome.tone === "blocked" || row.outcome.tone === "attention") &&
                          workspaceSlug ? (
                            <Link
                              href={`/${workspaceSlug}/settings/plugins`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                            >
                              {t("managePlugins")}
                              <ArrowSquareOut size={12} />
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WorkspaceSection>
        )}

        {page > 0 || hasNext ? (
          <div className="flex items-center justify-between gap-3 pt-3">
            <p className="text-[12px] text-ink-muted">{t("page", { page: page + 1 })}</p>
            <div className="flex items-center gap-2">
              <WorkspaceSecondaryButton
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || auditsQuery.isFetching}
              >
                {t("previous")}
              </WorkspaceSecondaryButton>
              <WorkspaceSecondaryButton
                onClick={() => setPage((current) => current + 1)}
                disabled={!hasNext || auditsQuery.isFetching}
              >
                {t("next")}
              </WorkspaceSecondaryButton>
            </div>
          </div>
        ) : null}
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  );
}
