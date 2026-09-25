"use client";

import { useMemo } from "react";
import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import { Tile } from "@/components/admin/finance/expense-list";
import { Button } from "@/components/ui/button";
import { useAdminFinancePnl } from "@/hooks/use-admin-expenses";
import { clampMonths, PNL_MAX_MONTHS, pnlCsvRows, toCsv } from "@/lib/admin/expenses";
import { formatMoney } from "@/lib/format/currency";
import { downloadBlob } from "@/lib/ui/download-blob";
import { cn } from "@/lib/utils";
import type { FinancePnlMonthDto } from "@/types/admin-expenses";

const vnd = (value: number | null) => (value === null ? "—" : formatMoney(Math.round(value), "VND"));
const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

/**
 * The full P&L: revenue and AI provider cost come from Insights' P&L (the same numbers the landing
 * page shows), operating expenses from this page; gross margin and the net result per month. A term
 * that is unknown stays "—" and so does everything computed from it, never a guessed 0.
 */
export function FinancePnl({ range }: { range: { from: string; to: string } }) {
  const t = useTranslations("adminFinance.pnl");
  const clamped = useMemo(() => clampMonths(range, PNL_MAX_MONTHS), [range]);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const query = useMemo(() => ({ ...clamped, tz }), [clamped, tz]);
  const pnl = useAdminFinancePnl(query);
  const data = pnl.data;

  if (pnl.isPending) return <p className="text-[13px] text-ink-muted">{t("loading")}</p>;
  if (pnl.isError || !data) return <p className="text-[13px] text-destructive">{t("error")}</p>;

  const total = data.total;
  const exportCsv = () =>
    void downloadBlob(
      () => new Blob(["﻿", toCsv(pnlCsvRows(data))], { type: "text/csv;charset=utf-8" }),
      `warptalk-pnl-${data.from}-${data.to}.csv`,
    );

  return (
    <div className="space-y-4">
      {clamped.from !== range.from ? <p className="text-[12px] text-ink-muted">{t("clamped", { months: PNL_MAX_MONTHS })}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label={t("revenue")} value={vnd(total.revenue)} />
        <Tile label={t("aiCost")} value={vnd(total.aiCost)} />
        <Tile label={t("grossMargin")} value={vnd(total.grossMargin)} caption={pct(total.grossMarginPercent)} />
        <Tile label={t("operatingExpenses")} value={vnd(total.operatingExpenses)} />
        <Tile
          label={t("netResult")}
          value={vnd(total.netResult)}
          caption={pct(total.netMarginPercent)}
          tone={total.netResult === null ? undefined : total.netResult < 0 ? "danger" : "good"}
        />
      </div>

      <AdminPanel className="p-4">
        <h3 className="mb-3 text-[13px] font-semibold text-ink">{t("chart")}</h3>
        <TimeSeriesChart
          labels={data.months.map((month) => month.month)}
          variant="bar"
          series={[
            { key: "revenue", label: t("revenue"), values: data.months.map((month) => month.revenue) },
            {
              key: "costs",
              label: t("totalCosts"),
              values: data.months.map((month) => (month.aiCost === null ? null : month.aiCost + month.operatingExpenses)),
            },
          ]}
          formatValue={(value) => vnd(value)}
          tooltipFooter={(index) => t("netLine", { net: vnd(data.months[index]?.netResult ?? null) })}
          ariaLabel={t("chart")}
          height={220}
        />
      </AdminPanel>

      <AdminPanel className="overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-3">
          <h3 className="text-[13px] font-semibold text-ink">{t("table")}</h3>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <DownloadSimple size={14} />
            {t("export")}
          </Button>
        </div>
        <table className="mt-2 w-full min-w-[760px] text-[12px]">
          <caption className="sr-only">{t("table")}</caption>
          <thead>
            <tr className="border-b border-hairline text-right text-ink-muted">
              <th scope="col" className="px-4 py-2 text-left font-medium">{t("month")}</th>
              <th scope="col" className="px-2 py-2 font-medium">{t("revenue")}</th>
              <th scope="col" className="px-2 py-2 font-medium">{t("aiCost")}</th>
              <th scope="col" className="px-2 py-2 font-medium">{t("grossMargin")}</th>
              <th scope="col" className="px-2 py-2 font-medium">{t("operatingExpenses")}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t("netResult")}</th>
            </tr>
          </thead>
          <tbody>
            {[...data.months].reverse().map((month) => (
              <Row key={month.month} row={month} label={month.month} />
            ))}
            <Row row={total} label={t("total")} strong />
          </tbody>
        </table>
      </AdminPanel>

      <div className="space-y-1 text-[12px] text-ink-muted">
        {data.costNote ? <p>{t("costNote", { note: data.costNote })}</p> : null}
        {data.fxNote ? <p>{t("fxNote", { note: data.fxNote })}</p> : null}
        {data.expenseFxNote ? <p>{t("expenseFxNote", { note: data.expenseFxNote })}</p> : null}
      </div>
    </div>
  );
}

function Row({ row, label, strong = false }: { row: FinancePnlMonthDto; label: string; strong?: boolean }) {
  return (
    <tr className={cn("border-b border-hairline text-right tabular-nums last:border-0", strong && "bg-surface-2 font-semibold")}>
      <th scope="row" className="px-4 py-2 text-left font-medium text-ink">{label}</th>
      <td className="px-2 py-2 text-ink">{vnd(row.revenue)}</td>
      <td className="px-2 py-2 text-ink-muted">
        {vnd(row.aiCost)}
        {row.costCoveragePercent < 100 ? <span className="block text-[10px] text-ink-subtle">{row.costCoveragePercent}%</span> : null}
      </td>
      <td className="px-2 py-2 text-ink">
        {vnd(row.grossMargin)}
        <span className="block text-[10px] text-ink-subtle">{pct(row.grossMarginPercent)}</span>
      </td>
      <td className="px-2 py-2 text-ink-muted">{vnd(row.operatingExpenses)}</td>
      <td className={cn("px-4 py-2", row.netResult !== null && row.netResult < 0 ? "text-destructive" : "text-ink")}>
        {vnd(row.netResult)}
        <span className="block text-[10px] text-ink-subtle">{pct(row.netMarginPercent)}</span>
      </td>
    </tr>
  );
}
