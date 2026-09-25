"use client";

import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Receipt } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { AdminFilterTabs, AdminPage, AdminPageHeader } from "@/components/admin/admin-page-chrome";
import { ExpenseBudgets } from "@/components/admin/finance/expense-budgets";
import { ExpenseImport } from "@/components/admin/finance/expense-import";
import { ExpenseList } from "@/components/admin/finance/expense-list";
import { ExpenseReports } from "@/components/admin/finance/expense-reports";
import { FinancePnl } from "@/components/admin/finance/finance-pnl";
import { useCan } from "@/hooks/use-staff-access";
import { resolvePeriod, FINANCE_PERIODS, type FinancePeriod } from "@/lib/admin/expenses";
import { ADMIN_PERMISSIONS } from "@/lib/admin/staff-permissions";

const TABS = ["expenses", "budgets", "reports", "pnl", "import"] as const;
type FinanceTab = (typeof TABS)[number];

/**
 * Operating costs (G12): what it costs to run WarpTalk beyond the per-usage provider cost Insights
 * already knows. One page, five views, each in the URL: `tab` and `period` here, the expense list's
 * own filters through the list toolkit.
 */
function OperatingCostsPage() {
  const t = useTranslations("adminFinance");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canManage = useCan(ADMIN_PERMISSIONS.financeManage);

  const tabParam = searchParams.get("tab") as FinanceTab | null;
  const tab: FinanceTab = tabParam && TABS.includes(tabParam) && (tabParam !== "import" || canManage) ? tabParam : "expenses";
  const periodParam = searchParams.get("period") as FinancePeriod | null;
  const period: FinancePeriod = periodParam && FINANCE_PERIODS.includes(periodParam) ? periodParam : "12m";
  const range = useMemo(() => resolvePeriod(period), [period]);

  const setParam = (key: string, value: string | null, fallback: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === fallback) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const tabs = TABS.filter((value) => value !== "import" || canManage).map((value) => ({ value, label: t(`tabs.${value}`) }));

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Receipt size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          tab === "import" ? null : (
            <select
              aria-label={t("period.aria")}
              value={period}
              onChange={(event) => setParam("period", event.target.value, "12m")}
              className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink"
            >
              {FINANCE_PERIODS.map((value) => (
                <option key={value} value={value}>
                  {t(`period.${value}`)}
                </option>
              ))}
            </select>
          )
        }
      />

      <AdminFilterTabs tabs={tabs} value={tab} onChange={(value) => setParam("tab", value, "expenses")} label={t("tabs.aria")} />

      <div className="pt-4">
        {tab === "expenses" ? <ExpenseList range={range} canManage={canManage} /> : null}
        {tab === "budgets" ? <ExpenseBudgets range={range} canManage={canManage} /> : null}
        {tab === "reports" ? <ExpenseReports range={range} /> : null}
        {tab === "pnl" ? <FinancePnl range={range} /> : null}
        {tab === "import" && canManage ? <ExpenseImport onDone={() => setParam("tab", "expenses", "expenses")} /> : null}
      </div>
    </AdminPage>
  );
}

export default function AdminOperatingCostsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <OperatingCostsPage />
    </Suspense>
  );
}
