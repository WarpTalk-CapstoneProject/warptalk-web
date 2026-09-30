/**
 * G12 operating costs and expenses — the billing service's contract
 * (WarpTalk.BillingService.Application.DTOs.OperatingExpenseDtos). camelCase on the wire.
 *
 * An expense keeps its own currency (VND or USD). Every `…Vnd` figure is converted by the server at
 * the USD→VND rate of the expense's own date (subscription.fx_rates, Stripe-sourced) and is null
 * when no rate exists — never a guessed 0. Months are "yyyy-MM", dates "yyyy-MM-dd".
 */

export const EXPENSE_CURRENCIES = ["VND", "USD"] as const;
export type ExpenseCurrency = (typeof EXPENSE_CURRENCIES)[number];

export const EXPENSE_STATUSES = ["planned", "paid"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_RECURRENCES = ["none", "monthly", "yearly"] as const;
export type ExpenseRecurrence = (typeof EXPENSE_RECURRENCES)[number];

/** What the form offers; the server also accepts free text up to 40 characters. */
export const EXPENSE_PAYMENT_METHODS = ["bank_transfer", "company_card", "personal_card", "cash", "paypal", "other"] as const;

export interface ExpenseCategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** A chart token name (blue, cyan, violet, amber, green, pink, gray), never a hex value. */
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  inUse: boolean;
}

export interface SaveExpenseCategoryRequest {
  name: string;
  slug?: string | null;
  description?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
}

export interface ExpenseReceiptDto {
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
}

export interface OperatingExpenseDto {
  id: string;
  expenseDate: string;
  vendor: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  categoryColor: string | null;
  description: string | null;
  amount: number;
  currency: ExpenseCurrency;
  amountVnd: number | null;
  fxRate: number | null;
  fxSource: string | null;
  fxRateDate: string | null;
  paymentMethod: string | null;
  status: ExpenseStatus;
  paidAt: string | null;
  paidBy: string | null;
  tags: string[];
  recurrence: ExpenseRecurrence;
  nextDueDate: string | null;
  recurrenceEndDate: string | null;
  recurringSourceId: string | null;
  receipt: ExpenseReceiptDto | null;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseTotalsDto {
  count: number;
  totalVnd: number;
  paidVnd: number;
  plannedVnd: number;
  /** USD rows with no rate: left out of the VND totals. */
  unconverted: number;
}

export interface OperatingExpenseListDto {
  from: string;
  to: string;
  items: OperatingExpenseDto[];
  totals: ExpenseTotalsDto;
  fxNote: string | null;
}

export interface SaveOperatingExpenseRequest {
  expenseDate: string;
  vendor: string;
  categoryId: string;
  description?: string | null;
  amount: number;
  currency: ExpenseCurrency;
  paymentMethod?: string | null;
  status?: ExpenseStatus | null;
  paidBy?: string | null;
  tags?: string[] | null;
  recurrence?: ExpenseRecurrence | null;
  recurrenceEndDate?: string | null;
}

export interface MarkExpensePaidRequest {
  paidAt?: string | null;
  paidBy?: string | null;
  paymentMethod?: string | null;
}

export interface ExpenseBudgetDto {
  categoryId: string;
  month: string;
  amountVnd: number;
  note: string | null;
}

export interface ExpenseBudgetInput {
  categoryId: string;
  month: string;
  /** null removes the budget of that (category, month). */
  amountVnd: number | null;
  note?: string | null;
}

export interface ExpenseMonthCategoryDto {
  categoryId: string;
  amountVnd: number;
  budgetVnd: number | null;
  overBudget: boolean;
}

export interface ExpenseReportMonthDto {
  month: string;
  totalVnd: number;
  paidVnd: number;
  plannedVnd: number;
  budgetVnd: number | null;
  categories: ExpenseMonthCategoryDto[];
}

export interface ExpenseCategoryTotalDto {
  categoryId: string;
  slug: string;
  name: string;
  color: string | null;
  amountVnd: number;
  count: number;
  budgetVnd: number | null;
}

export interface ExpenseVendorTotalDto {
  vendor: string;
  amountVnd: number;
  count: number;
  categoryName: string | null;
}

export interface ExpenseCommitmentDto {
  expenseId: string | null;
  seriesId: string | null;
  dueDate: string;
  vendor: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  currency: ExpenseCurrency;
  amountVnd: number | null;
  /** none | occurrence | monthly | yearly */
  recurrence: string;
  /** true: an occurrence of a series not written yet (the worker writes it a week ahead). */
  projected: boolean;
}

export interface ExpenseBudgetAlertDto {
  categoryId: string;
  categoryName: string;
  month: string;
  budgetVnd: number;
  actualVnd: number;
  percent: number;
  over: boolean;
}

export interface ExpenseReportDto {
  from: string;
  to: string;
  generatedAt: string;
  categories: ExpenseCategoryDto[];
  months: ExpenseReportMonthDto[];
  categoryTotals: ExpenseCategoryTotalDto[];
  topVendors: ExpenseVendorTotalDto[];
  commitments: ExpenseCommitmentDto[];
  budgetAlerts: ExpenseBudgetAlertDto[];
  totalVnd: number;
  paidVnd: number;
  plannedVnd: number;
  monthlyAverageVnd: number;
  recurringMonthlyRunRateVnd: number;
  unconverted: number;
  fxNote: string | null;
}

export interface FinancePnlMonthDto {
  /** "yyyy-MM", or "total" for the whole range. */
  month: string;
  revenue: number | null;
  aiCost: number | null;
  grossMargin: number | null;
  grossMarginPercent: number | null;
  operatingExpenses: number;
  netResult: number | null;
  netMarginPercent: number | null;
  expensesByCategory: ExpenseMonthCategoryDto[];
  costCoveragePercent: number;
}

export interface FinancePnlDto {
  from: string;
  to: string;
  generatedAt: string;
  months: FinancePnlMonthDto[];
  total: FinancePnlMonthDto;
  categories: ExpenseCategoryDto[];
  costNote: string | null;
  fxNote: string | null;
  expenseFxNote: string | null;
}

export interface ExpenseImportRowDto {
  line: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  expenseDate: string | null;
  vendor: string | null;
  categoryId: string | null;
  categoryName: string | null;
  amount: number | null;
  currency: string | null;
  amountVnd: number | null;
  status: string | null;
  paymentMethod: string | null;
  paidBy: string | null;
  tags: string[];
  description: string | null;
  recurrence: string;
}

export interface ExpenseImportPreviewDto {
  columns: string[];
  unknownColumns: string[];
  rows: ExpenseImportRowDto[];
  validCount: number;
  invalidCount: number;
  totalVnd: number;
}

export interface ExpenseImportResultDto {
  batchId: string;
  imported: number;
  skipped: number;
}
