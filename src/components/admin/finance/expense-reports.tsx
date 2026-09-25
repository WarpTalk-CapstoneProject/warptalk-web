"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { BarList } from "@/components/admin/charts/bar-list";
import { ChartEmpty, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import { Tile } from "@/components/admin/finance/expense-list";
import { useAdminExpenseReport } from "@/hooks/use-admin-expenses";
import { categoryStacks } from "@/lib/admin/expenses";
import { formatMoney } from "@/lib/format/currency";

const vnd = (value: number) => formatMoney(Math.round(value), "VND");

/**
 * Monthly totals by category (stacked), the trend line with budget, the top vendors, and what is
 * committed for the next 90 days — planned rows plus the occurrences recurring series will write.
 */
export function ExpenseReports({ range }: { range: { from: string; to: string } }) {
  const t = useTranslations("adminFinance.reports");
  const report = useAdminExpenseReport(range);
  const data = report.data;
  const stacks = useMemo(() => (data ? categoryStacks(data, t("other")) : []), [data, t]);

  if (report.isPending) return <p className="text-[13px] text-ink-muted">{t("loading")}</p>;
  if (report.isError || !data) return <p className="text-[13px] text-destructive">{t("error")}</p>;

  const labels = data.months.map((month) => month.month);
  const hasBudget = data.months.some((month) => month.budgetVnd !== null);
  const commitmentsTotal = data.commitments.reduce((sum, row) => sum + (row.amountVnd ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t("total")} value={vnd(data.totalVnd)} />
        <Tile label={t("monthlyAverage")} value={vnd(data.monthlyAverageVnd)} />
        <Tile label={t("runRate")} value={vnd(data.recurringMonthlyRunRateVnd)} caption={t("runRateCaption")} />
        <Tile label={t("committed")} value={vnd(commitmentsTotal)} caption={t("committedCaption", { count: data.commitments.length })} />
      </div>
      {data.fxNote ? <p className="text-[12px] text-ink-muted">{data.fxNote}</p> : null}

      <AdminPanel className="p-4">
        <h3 className="mb-3 text-[13px] font-semibold text-ink">{t("byCategory")}</h3>
        {data.totalVnd > 0 ? (
          <TimeSeriesChart
            labels={labels}
            variant="bar"
            stacked
            series={stacks.map((stack) => ({ key: stack.key, label: stack.label, color: stack.color, values: stack.values }))}
            formatValue={vnd}
            tooltipFooter={(index) => t("monthTotal", { total: vnd(data.months[index]?.totalVnd ?? 0) })}
            ariaLabel={t("byCategory")}
            height={240}
          />
        ) : (
          <ChartEmpty height={200}>{t("empty")}</ChartEmpty>
        )}
      </AdminPanel>

      <AdminPanel className="p-4">
        <h3 className="mb-3 text-[13px] font-semibold text-ink">{t("trend")}</h3>
        <TimeSeriesChart
          labels={labels}
          variant="line"
          series={[
            { key: "spend", label: t("spend"), values: data.months.map((month) => month.totalVnd) },
            ...(hasBudget ? [{ key: "budget", label: t("budget"), values: data.months.map((month) => month.budgetVnd) }] : []),
          ]}
          formatValue={vnd}
          describeGap={() => t("noBudget")}
          ariaLabel={t("trend")}
          height={200}
        />
      </AdminPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel className="p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-ink">{t("topVendors")}</h3>
          {data.topVendors.length > 0 ? (
            <BarList
              rows={data.topVendors.map((vendor) => ({
                key: vendor.vendor,
                label: vendor.vendor,
                segments: [{ key: "amount", label: vendor.categoryName ?? vendor.vendor, value: vendor.amountVnd }],
                valueText: vnd(vendor.amountVnd),
              }))}
              formatValue={vnd}
              ariaLabel={t("topVendors")}
              showShare
            />
          ) : (
            <p className="text-[12px] text-ink-subtle">{t("empty")}</p>
          )}
        </AdminPanel>

        <AdminPanel className="p-4">
          <h3 className="mb-1 text-[13px] font-semibold text-ink">{t("commitments")}</h3>
          <p className="mb-3 text-[12px] text-ink-muted">{t("commitmentsHint")}</p>
          {data.commitments.length === 0 ? (
            <p className="text-[12px] text-ink-subtle">{t("noCommitments")}</p>
          ) : (
            <table className="w-full text-[12px]">
              <caption className="sr-only">{t("commitments")}</caption>
              <thead>
                <tr className="border-b border-hairline text-left text-ink-muted">
                  <th scope="col" className="py-1.5 font-medium">{t("due")}</th>
                  <th scope="col" className="py-1.5 font-medium">{t("vendor")}</th>
                  <th scope="col" className="py-1.5 text-right font-medium">{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.commitments.slice(0, 30).map((row, index) => (
                  <tr key={`${row.seriesId ?? row.expenseId}-${row.dueDate}-${index}`} className="border-b border-hairline last:border-0">
                    <td className="py-1.5 tabular-nums text-ink-muted">{row.dueDate}</td>
                    <td className="py-1.5 text-ink">
                      {row.vendor}
                      <span className="ml-1.5 text-ink-subtle">
                        · {row.categoryName}
                        {row.projected ? ` · ${t("projected")}` : ""}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ink">
                      {formatMoney(row.amount, row.currency)}
                      {row.currency !== "VND" && row.amountVnd !== null ? <span className="block text-[10px] text-ink-subtle">{vnd(row.amountVnd)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminPanel>
      </div>
    </div>
  );
}
