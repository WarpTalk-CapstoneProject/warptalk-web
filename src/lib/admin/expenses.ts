/**
 * G12 operating costs — pure view helpers for /admin/finance/expenses. Relative imports only: the
 * node-run contract test (scripts/test-admin-internal-mgmt.mjs) imports this without a bundler.
 */

import type {
  ExpenseCategoryDto,
  ExpenseReportDto,
  FinancePnlDto,
  OperatingExpenseDto,
} from "../../types/admin-expenses.ts";

/** Category colour names (stored in the DB) to chart tokens. Never a hex value: both themes read the tokens. */
export const EXPENSE_COLOR_TOKENS: Readonly<Record<string, string>> = {
  blue: "var(--viz-1)",
  cyan: "var(--viz-2)",
  amber: "var(--viz-5)",
  violet: "var(--viz-4)",
  green: "var(--viz-2)",
  pink: "var(--viz-4)",
  orange: "var(--viz-3)",
  gray: "var(--muted-foreground)",
};

const SLOT_TOKENS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"] as const;
export const OTHER_TOKEN = "var(--muted-foreground)";

/** The chart shows the five largest categories and folds the rest into one muted "other" stack. */
export const STACKED_CATEGORY_LIMIT = 5;

export interface CategoryStack {
  key: string;
  categoryId: string | null;
  label: string;
  color: string;
  values: (number | null)[];
}

/**
 * One series per category for the stacked monthly bars: the `limit` largest over the range, each on
 * its own chart slot, then everything else as "other". A month with no spend in a category is 0 —
 * it was counted — while a month with no data at all does not exist in the report.
 */
export function categoryStacks(report: ExpenseReportDto, otherLabel: string, limit = STACKED_CATEGORY_LIMIT): CategoryStack[] {
  const names = new Map(report.categories.map((category) => [category.id, category.name]));
  const ranked = report.categoryTotals.filter((total) => total.amountVnd > 0).map((total) => total.categoryId);
  const shown = ranked.slice(0, limit);
  const folded = new Set(ranked.slice(limit));

  const stacks: CategoryStack[] = shown.map((categoryId, index) => ({
    key: categoryId,
    categoryId,
    label: names.get(categoryId) ?? categoryId,
    color: SLOT_TOKENS[index % SLOT_TOKENS.length],
    values: report.months.map((month) => month.categories.find((cell) => cell.categoryId === categoryId)?.amountVnd ?? 0),
  }));

  if (folded.size > 0) {
    stacks.push({
      key: "other",
      categoryId: null,
      label: otherLabel,
      color: OTHER_TOKEN,
      values: report.months.map((month) =>
        month.categories.filter((cell) => folded.has(cell.categoryId)).reduce((sum, cell) => sum + cell.amountVnd, 0),
      ),
    });
  }

  return stacks;
}

export type BudgetState = "none" | "ok" | "warn" | "over";

/** From 80% of a budget the cell warns; above 100% it is over. The server's alert uses the same threshold. */
export const BUDGET_WARN_PERCENT = 80;

export function budgetUsage(actual: number, budget: number | null | undefined): { percent: number | null; state: BudgetState } {
  if (budget === null || budget === undefined) return { percent: null, state: "none" };
  if (budget <= 0) return { percent: null, state: actual > 0 ? "over" : "ok" };
  const percent = Math.round((actual * 1000) / budget) / 10;
  return { percent, state: percent > 100 ? "over" : percent >= BUDGET_WARN_PERCENT ? "warn" : "ok" };
}

// ── Months ──────────────────────────────────────────────────────────────────────────────────

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The `count` months ending with the month of `now`, as yyyy-MM. */
export function lastMonths(count: number, now: Date = new Date()): { from: string; to: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(end.getFullYear(), end.getMonth() - (count - 1), 1);
  return { from: monthKey(start), to: monthKey(end) };
}

/** Every yyyy-MM from `from` through `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const months: string[] = [];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? ((m = 1), y++) : m++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (months.length > 120) break;
  }
  return months;
}

/** First and last day of a month range, for the list endpoint's yyyy-MM-dd window. */
export function monthRangeDates(from: string, to: string): { from: string; to: string } {
  const [ty, tm] = to.split("-").map(Number);
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return { from: `${from}-01`, to: `${to}-${String(last).padStart(2, "0")}` };
}

// ── CSV ─────────────────────────────────────────────────────────────────────────────────────

/** The import format's columns, in order. An export of the list imports back unchanged. */
export const EXPENSE_CSV_COLUMNS = [
  "date",
  "vendor",
  "category",
  "amount",
  "currency",
  "description",
  "payment_method",
  "status",
  "paid_by",
  "tags",
  "recurrence",
] as const;

/** Header + rows; `amount_vnd` is appended for reading and ignored by the import. */
export function expenseCsvRows(items: readonly OperatingExpenseDto[]): (string | number)[][] {
  return [
    [...EXPENSE_CSV_COLUMNS, "amount_vnd"],
    ...items.map((item) => [
      item.expenseDate,
      item.vendor,
      item.categorySlug,
      item.amount,
      item.currency,
      item.description ?? "",
      item.paymentMethod ?? "",
      item.status,
      item.paidBy ?? "",
      item.tags.join(";"),
      item.recurrence,
      item.amountVnd ?? "",
    ]),
  ];
}

/** A template with one example row per currency. */
export function expenseCsvTemplate(categories: readonly ExpenseCategoryDto[]): (string | number)[][] {
  const first = categories.find((c) => c.isActive)?.slug ?? "other";
  return [
    [...EXPENSE_CSV_COLUMNS],
    ["2026-09-01", "Vietnix", first, 1500000, "VND", "VPS app-1", "bank_transfer", "paid", "", "infra", "monthly"],
    ["2026-09-03", "GitHub", first, 21, "USD", "Team plan", "company_card", "paid", "", "saas", "none"],
  ];
}

export function pnlCsvRows(pnl: FinancePnlDto): (string | number)[][] {
  const cell = (value: number | null) => (value === null ? "" : value);
  return [
    ["month", "revenue_vnd", "ai_cost_vnd", "gross_margin_vnd", "gross_margin_pct", "operating_expenses_vnd", "net_result_vnd", "net_margin_pct"],
    ...[...pnl.months, pnl.total].map((row) => [
      row.month,
      cell(row.revenue),
      cell(row.aiCost),
      cell(row.grossMargin),
      cell(row.grossMarginPercent),
      row.operatingExpenses,
      cell(row.netResult),
      cell(row.netMarginPercent),
    ]),
  ];
}

/** Same rules as the ledger export (RFC 4180, formula-injection guarded). */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  const cell = (value: string | number) => {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Tags typed as "infra, saas; prod" → ["infra", "saas", "prod"], lower-cased and unique. */
export function parseTags(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[,;|]/)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

// ── Period ──────────────────────────────────────────────────────────────────────────────────

export const FINANCE_PERIODS = ["3m", "6m", "12m", "ytd", "24m"] as const;
export type FinancePeriod = (typeof FINANCE_PERIODS)[number];

/** A period as months (yyyy-MM), ending with the current month. */
export function resolvePeriod(period: FinancePeriod, now: Date = new Date()): { from: string; to: string } {
  switch (period) {
    case "3m":
      return lastMonths(3, now);
    case "6m":
      return lastMonths(6, now);
    case "ytd":
      return { from: `${now.getFullYear()}-01`, to: monthKey(now) };
    case "24m":
      return lastMonths(24, now);
    default:
      return lastMonths(12, now);
  }
}

/** The P&L reuses Insights, which spans at most 12 months: a longer range keeps its last 12. */
export const PNL_MAX_MONTHS = 12;

export function clampMonths(range: { from: string; to: string }, max: number): { from: string; to: string } {
  const months = monthsBetween(range.from, range.to);
  return months.length <= max ? range : { from: months[months.length - max], to: range.to };
}
