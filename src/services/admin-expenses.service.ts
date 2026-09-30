import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  ExpenseBudgetDto,
  ExpenseBudgetInput,
  ExpenseCategoryDto,
  ExpenseImportPreviewDto,
  ExpenseImportResultDto,
  ExpenseReportDto,
  FinancePnlDto,
  MarkExpensePaidRequest,
  OperatingExpenseDto,
  OperatingExpenseListDto,
  SaveExpenseCategoryRequest,
  SaveOperatingExpenseRequest,
} from "@/types/admin-expenses";

/** G12 operating expenses (billing). */
export const adminExpensesService = {
  list: async (range: { from?: string; to?: string }): Promise<OperatingExpenseListDto> => {
    const { data } = await apiClient.get<OperatingExpenseListDto>(API.adminExpenses.base, { params: range });
    return data;
  },
  create: async (request: SaveOperatingExpenseRequest): Promise<OperatingExpenseDto> => {
    const { data } = await apiClient.post<OperatingExpenseDto>(API.adminExpenses.base, request);
    return data;
  },
  update: async (id: string, request: SaveOperatingExpenseRequest): Promise<OperatingExpenseDto> => {
    const { data } = await apiClient.put<OperatingExpenseDto>(API.adminExpenses.detail(id), request);
    return data;
  },
  markPaid: async (id: string, request: MarkExpensePaidRequest): Promise<OperatingExpenseDto> => {
    const { data } = await apiClient.post<OperatingExpenseDto>(API.adminExpenses.markPaid(id), request);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(API.adminExpenses.detail(id));
  },
  uploadReceipt: async (id: string, file: File): Promise<OperatingExpenseDto> => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await apiClient.postForm<OperatingExpenseDto>(API.adminExpenses.receipt(id), form);
    return data;
  },
  downloadReceipt: async (id: string): Promise<Blob> => {
    const { data } = await apiClient.get<Blob>(API.adminExpenses.receipt(id), { responseType: "blob" });
    return data;
  },
  removeReceipt: async (id: string): Promise<OperatingExpenseDto> => {
    const { data } = await apiClient.delete<OperatingExpenseDto>(API.adminExpenses.receipt(id));
    return data;
  },
  categories: async (): Promise<ExpenseCategoryDto[]> => {
    const { data } = await apiClient.get<ExpenseCategoryDto[]>(API.adminExpenses.categories);
    return data;
  },
  createCategory: async (request: SaveExpenseCategoryRequest): Promise<ExpenseCategoryDto> => {
    const { data } = await apiClient.post<ExpenseCategoryDto>(API.adminExpenses.categories, request);
    return data;
  },
  updateCategory: async (id: string, request: SaveExpenseCategoryRequest): Promise<ExpenseCategoryDto> => {
    const { data } = await apiClient.put<ExpenseCategoryDto>(API.adminExpenses.category(id), request);
    return data;
  },
  budgets: async (range: { from?: string; to?: string }): Promise<ExpenseBudgetDto[]> => {
    const { data } = await apiClient.get<ExpenseBudgetDto[]>(API.adminExpenses.budgets, { params: range });
    return data;
  },
  saveBudgets: async (items: ExpenseBudgetInput[]): Promise<ExpenseBudgetDto[]> => {
    const { data } = await apiClient.put<ExpenseBudgetDto[]>(API.adminExpenses.budgets, { items });
    return data;
  },
  report: async (range: { from?: string; to?: string }): Promise<ExpenseReportDto> => {
    const { data } = await apiClient.get<ExpenseReportDto>(API.adminExpenses.report, { params: range });
    return data;
  },
  pnl: async (range: { from?: string; to?: string; tz?: string }): Promise<FinancePnlDto> => {
    const { data } = await apiClient.get<FinancePnlDto>(API.adminExpenses.pnl, { params: range });
    return data;
  },
  previewImport: async (csv: string): Promise<ExpenseImportPreviewDto> => {
    const { data } = await apiClient.post<ExpenseImportPreviewDto>(API.adminExpenses.importPreview, { csv });
    return data;
  },
  import: async (csv: string, skipInvalid: boolean): Promise<ExpenseImportResultDto> => {
    const { data } = await apiClient.post<ExpenseImportResultDto>(API.adminExpenses.import, { csv, skipInvalid });
    return data;
  },
};
