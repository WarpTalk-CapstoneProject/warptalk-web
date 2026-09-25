"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminExpensesService } from "@/services/admin-expenses.service";
import type {
  ExpenseBudgetInput,
  MarkExpensePaidRequest,
  SaveExpenseCategoryRequest,
  SaveOperatingExpenseRequest,
} from "@/types/admin-expenses";

export const ADMIN_EXPENSE_KEYS = {
  all: ["admin", "expenses"] as const,
  list: (range: { from?: string; to?: string }) => ["admin", "expenses", "list", range] as const,
  categories: ["admin", "expenses", "categories"] as const,
  budgets: (range: { from?: string; to?: string }) => ["admin", "expenses", "budgets", range] as const,
  report: (range: { from?: string; to?: string }) => ["admin", "expenses", "report", range] as const,
  pnl: (range: { from?: string; to?: string; tz?: string }) => ["admin", "expenses", "pnl", range] as const,
};

/** An expense changes the list, the report, the P&L, the budgets' actuals and the inbox's "expense due". */
function useInvalidateFinance() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_EXPENSE_KEYS.all });
    void queryClient.invalidateQueries({ queryKey: ["admin", "inbox"] });
  };
}

export function useAdminExpenses(range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ADMIN_EXPENSE_KEYS.list(range),
    queryFn: () => adminExpensesService.list(range),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export function useAdminExpenseCategories() {
  return useQuery({
    queryKey: ADMIN_EXPENSE_KEYS.categories,
    queryFn: () => adminExpensesService.categories(),
    staleTime: 5 * 60_000,
  });
}

export function useAdminExpenseBudgets(range: { from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: ADMIN_EXPENSE_KEYS.budgets(range),
    queryFn: () => adminExpensesService.budgets(range),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useAdminExpenseReport(range: { from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: ADMIN_EXPENSE_KEYS.report(range),
    queryFn: () => adminExpensesService.report(range),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    enabled,
  });
}

export function useAdminFinancePnl(range: { from?: string; to?: string; tz?: string }, enabled = true) {
  return useQuery({
    queryKey: ADMIN_EXPENSE_KEYS.pnl(range),
    queryFn: () => adminExpensesService.pnl(range),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    enabled,
  });
}

export function useAdminExpenseActions() {
  const invalidate = useInvalidateFinance();
  const onSuccess = () => invalidate();
  return {
    create: useMutation({ mutationFn: (request: SaveOperatingExpenseRequest) => adminExpensesService.create(request), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, request }: { id: string; request: SaveOperatingExpenseRequest }) => adminExpensesService.update(id, request),
      onSuccess,
    }),
    markPaid: useMutation({
      mutationFn: ({ id, request }: { id: string; request: MarkExpensePaidRequest }) => adminExpensesService.markPaid(id, request),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => adminExpensesService.remove(id), onSuccess }),
    uploadReceipt: useMutation({
      mutationFn: ({ id, file }: { id: string; file: File }) => adminExpensesService.uploadReceipt(id, file),
      onSuccess,
    }),
    removeReceipt: useMutation({ mutationFn: (id: string) => adminExpensesService.removeReceipt(id), onSuccess }),
    createCategory: useMutation({
      mutationFn: (request: SaveExpenseCategoryRequest) => adminExpensesService.createCategory(request),
      onSuccess,
    }),
    updateCategory: useMutation({
      mutationFn: ({ id, request }: { id: string; request: SaveExpenseCategoryRequest }) => adminExpensesService.updateCategory(id, request),
      onSuccess,
    }),
    saveBudgets: useMutation({ mutationFn: (items: ExpenseBudgetInput[]) => adminExpensesService.saveBudgets(items), onSuccess }),
    previewImport: useMutation({ mutationFn: (csv: string) => adminExpensesService.previewImport(csv) }),
    commitImport: useMutation({
      mutationFn: ({ csv, skipInvalid }: { csv: string; skipInvalid: boolean }) => adminExpensesService.import(csv, skipInvalid),
      onSuccess,
    }),
  };
}
