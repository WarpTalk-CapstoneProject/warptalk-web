"use client";

import { useMemo, useState } from "react";
import { Warning } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { ExpenseCategories } from "@/components/admin/finance/expense-categories";
import { Button } from "@/components/ui/button";
import {
  useAdminExpenseActions,
  useAdminExpenseBudgets,
  useAdminExpenseCategories,
  useAdminExpenseReport,
} from "@/hooks/use-admin-expenses";
import { budgetUsage, monthsBetween } from "@/lib/admin/expenses";
import { getErrorMessage } from "@/lib/api/errors";
import { formatAmount } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import type { ExpenseBudgetInput } from "@/types/admin-expenses";

/**
 * Budgets per category per month (VND), as a grid: categories down, months across, each cell the
 * budget with what was spent beneath it. Typed cells turn amber until saved; a month over budget
 * turns red, from 80% it warns.
 */
export function ExpenseBudgets({ range, canManage }: { range: { from: string; to: string }; canManage: boolean }) {
  const t = useTranslations("adminFinance.budgets");
  const categories = useAdminExpenseCategories();
  const budgets = useAdminExpenseBudgets(range);
  const report = useAdminExpenseReport(range);
  const actions = useAdminExpenseActions();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const months = useMemo(() => monthsBetween(range.from, range.to), [range.from, range.to]);
  const active = (categories.data ?? []).filter((category) => category.isActive);
  const budgetOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const budget of budgets.data ?? []) map.set(`${budget.categoryId}|${budget.month}`, budget.amountVnd);
    return map;
  }, [budgets.data]);
  const actualOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const month of report.data?.months ?? []) {
      for (const cell of month.categories) map.set(`${cell.categoryId}|${month.month}`, cell.amountVnd);
    }
    return map;
  }, [report.data]);

  const dirty = Object.keys(draft);

  const save = async () => {
    const items: ExpenseBudgetInput[] = [];
    for (const key of dirty) {
      const [categoryId, month] = key.split("|");
      const text = draft[key].replace(/[,\s]/g, "");
      if (text === "") items.push({ categoryId, month, amountVnd: null });
      else {
        const value = Number(text);
        if (!Number.isFinite(value) || value < 0) {
          toast.error(t("invalid", { month }));
          return;
        }
        items.push({ categoryId, month, amountVnd: Math.round(value) });
      }
    }
    try {
      await actions.saveBudgets.mutateAsync(items);
      setDraft({});
      toast.success(t("saved", { count: items.length }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("saveFailed")));
    }
  };

  const copyPrevious = (month: string) => {
    const index = months.indexOf(month);
    if (index <= 0) return;
    const previous = months[index - 1];
    const next = { ...draft };
    for (const category of active) {
      const key = `${category.id}|${month}`;
      if (budgetOf.has(key) || draft[key] !== undefined) continue; // never overwrite what is there
      const source = draft[`${category.id}|${previous}`] ?? budgetOf.get(`${category.id}|${previous}`);
      if (source !== undefined && source !== "") next[key] = String(source);
    }
    setDraft(next);
  };

  const alerts = report.data?.budgetAlerts ?? [];

  return (
    <div className="space-y-4">
      {alerts.length > 0 ? (
        <div className="space-y-1.5">
          {alerts.slice(0, 6).map((alert) => (
            <p
              key={`${alert.categoryId}-${alert.month}`}
              role="status"
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]",
                alert.over ? "border-destructive/40 bg-destructive/10 text-ink" : "border-warning/40 bg-warning/10 text-ink",
              )}
            >
              <Warning size={14} className={alert.over ? "text-destructive" : "text-warning"} />
              {t(alert.over ? "alertOver" : "alertNear", {
                category: alert.categoryName,
                month: alert.month,
                percent: alert.percent,
                actual: formatAmount(alert.actualVnd),
                budget: formatAmount(alert.budgetVnd),
              })}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-muted">{t("hint")}</p>
        {canManage ? (
          <div className="flex items-center gap-2">
            {dirty.length > 0 ? <span className="text-[12px] text-warning">{t("unsaved", { count: dirty.length })}</span> : null}
            <Button size="sm" variant="outline" disabled={dirty.length === 0} onClick={() => setDraft({})}>
              {t("discard")}
            </Button>
            <Button size="sm" disabled={dirty.length === 0 || actions.saveBudgets.isPending} onClick={() => void save()}>
              {t("save")}
            </Button>
          </div>
        ) : null}
      </div>

      <AdminPanel className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="sticky left-0 z-10 bg-surface-1 px-3 py-2 text-left font-medium text-ink-muted">
                {t("category")}
              </th>
              {months.map((month) => (
                <th key={month} scope="col" className="px-2 py-2 text-right font-medium text-ink-muted">
                  <span className="block">{month}</span>
                  {canManage && months.indexOf(month) > 0 ? (
                    <button type="button" onClick={() => copyPrevious(month)} className="text-[10px] font-normal text-ink-subtle hover:text-ink">
                      {t("copyPrevious")}
                    </button>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((category) => (
              <tr key={category.id} className="border-b border-hairline last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-surface-1 px-3 py-2 text-left font-medium text-ink">
                  {category.name}
                </th>
                {months.map((month) => {
                  const key = `${category.id}|${month}`;
                  const saved = budgetOf.get(key);
                  const actual = actualOf.get(key) ?? 0;
                  const shown = draft[key] ?? (saved !== undefined ? String(saved) : "");
                  const usage = budgetUsage(actual, draft[key] !== undefined ? Number(draft[key] || NaN) || null : saved);
                  return (
                    <td key={month} className="px-2 py-1.5 text-right align-top">
                      {canManage ? (
                        <input
                          aria-label={t("cellAria", { category: category.name, month })}
                          inputMode="numeric"
                          value={shown}
                          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                          className={cn(
                            "h-7 w-24 rounded-md border bg-surface-1 px-1.5 text-right tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                            draft[key] !== undefined ? "border-warning bg-warning/5" : "border-border",
                          )}
                        />
                      ) : (
                        <span className="tabular-nums text-ink">{saved !== undefined ? formatAmount(saved) : "—"}</span>
                      )}
                      <span
                        className={cn(
                          "mt-0.5 block text-[10px] tabular-nums",
                          usage.state === "over" ? "font-medium text-destructive" : usage.state === "warn" ? "text-warning" : "text-ink-subtle",
                        )}
                      >
                        {actual > 0 ? formatAmount(actual) : ""}
                        {usage.percent !== null ? ` · ${usage.percent}%` : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </AdminPanel>

      <ExpenseCategories canManage={canManage} />
    </div>
  );
}
