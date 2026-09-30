"use client";

import { useMemo, useState } from "react";
import { DownloadSimple, Plus, Receipt, Stack, Tag, Wallet } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { ExpenseFormDialog } from "@/components/admin/finance/expense-form-dialog";
import {
  AdminDataTable,
  AdminListToolbar,
  useAdminActionIntent,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { Button } from "@/components/ui/button";
import { useAdminExpenseActions, useAdminExpenseCategories, useAdminExpenses } from "@/hooks/use-admin-expenses";
import { expenseCsvRows, monthRangeDates, toCsv } from "@/lib/admin/expenses";
import { applyClientListState, type ListStateConfig } from "@/lib/admin/list-state";
import { matchesSearch } from "@/lib/admin/search-text";
import { getErrorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format/currency";
import { downloadBlob } from "@/lib/ui/download-blob";
import { cn } from "@/lib/utils";
import { adminExpensesService } from "@/services/admin-expenses.service";
import { EXPENSE_CURRENCIES, EXPENSE_RECURRENCES, EXPENSE_STATUSES, type OperatingExpenseDto } from "@/types/admin-expenses";

/**
 * The expense list. The server bounds it by the period (at most 24 months of rows); search, filters,
 * sort and grouping then run in the browser over that window, which is small by construction.
 */
const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "category", kind: "enum", multiple: true },
    { key: "status", kind: "enum", multiple: true, values: EXPENSE_STATUSES },
    { key: "currency", kind: "enum", multiple: true, values: EXPENSE_CURRENCIES },
    { key: "recurrence", kind: "enum", multiple: true, values: EXPENSE_RECURRENCES },
    { key: "tag", kind: "enum", multiple: true },
    { key: "date", kind: "dateRange" },
  ],
  sortFields: ["date", "amount", "vendor"],
  defaultSort: { field: "date", direction: "desc" },
  columns: [
    { id: "expense" },
    { id: "category" },
    { id: "date" },
    { id: "amount" },
    { id: "status" },
    { id: "paidBy", defaultHidden: true },
    { id: "receipt" },
  ],
  groupings: ["category", "status", "month"],
};

const ACCESSORS = {
  search: (row: OperatingExpenseDto) => [row.vendor, row.description, row.categoryName, row.paidBy, ...row.tags],
  filters: {
    category: (row: OperatingExpenseDto) => row.categoryId,
    status: (row: OperatingExpenseDto) => row.status,
    currency: (row: OperatingExpenseDto) => row.currency,
    recurrence: (row: OperatingExpenseDto) => (row.recurringSourceId ? "monthly" : row.recurrence),
    tag: (row: OperatingExpenseDto) => row.tags,
    date: (row: OperatingExpenseDto) => row.expenseDate,
  },
  sort: {
    date: (row: OperatingExpenseDto) => row.expenseDate,
    amount: (row: OperatingExpenseDto) => row.amountVnd,
    vendor: (row: OperatingExpenseDto) => row.vendor.toLowerCase(),
  },
};

export function ExpenseList({ range, canManage }: { range: { from: string; to: string }; canManage: boolean }) {
  const t = useTranslations("adminFinance");
  const list = useAdminListState(LIST_CONFIG);
  const dates = useMemo(() => monthRangeDates(range.from, range.to), [range.from, range.to]);
  const expenses = useAdminExpenses(dates);
  const categories = useAdminExpenseCategories();
  const actions = useAdminExpenseActions();
  const [editing, setEditing] = useState<OperatingExpenseDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useAdminActionIntent({
    "record-expense": () => {
      if (!canManage) return;
      setEditing(null);
      setFormOpen(true);
    },
  });

  const items = useMemo(() => expenses.data?.items ?? [], [expenses.data]);
  const rows = useMemo(() => applyClientListState(items, list.state, ACCESSORS, matchesSearch), [items, list.state]);
  const tags = useMemo(() => Array.from(new Set(items.flatMap((item) => item.tags))).sort(), [items]);
  const totals = expenses.data?.totals;
  const shownVnd = rows.reduce((sum, row) => sum + (row.amountVnd ?? 0), 0);

  const filters: AdminFilterField[] = [
    {
      key: "category",
      label: t("list.category"),
      icon: <Stack size={13} />,
      kind: "enum",
      multiple: true,
      options: (categories.data ?? []).map((category) => ({ value: category.id, label: category.name })),
    },
    {
      key: "status",
      label: t("list.status"),
      icon: <Wallet size={13} />,
      kind: "enum",
      multiple: true,
      options: EXPENSE_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) })),
    },
    {
      key: "currency",
      label: t("list.currency"),
      kind: "enum",
      multiple: true,
      options: EXPENSE_CURRENCIES.map((value) => ({ value, label: value })),
    },
    {
      key: "recurrence",
      label: t("list.recurrence"),
      kind: "enum",
      multiple: true,
      options: EXPENSE_RECURRENCES.map((value) => ({ value, label: t(`recurrences.${value}`) })),
    },
    { key: "tag", label: t("list.tags"), icon: <Tag size={13} />, kind: "enum", multiple: true, options: tags.map((value) => ({ value, label: value })) },
    { key: "date", label: t("list.date"), kind: "dateRange" },
  ];

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(getErrorMessage(error, t("list.actionFailed")));
    }
  };

  const exportCsv = () =>
    void downloadBlob(
      () => Promise.resolve(new Blob(["﻿", toCsv(expenseCsvRows(rows))], { type: "text/csv;charset=utf-8" })),
      `warptalk-expenses-${range.from}-${range.to}.csv`,
    );

  const downloadReceipt = (row: OperatingExpenseDto) =>
    void downloadBlob(() => adminExpensesService.downloadReceipt(row.id), row.receipt?.fileName ?? "receipt").catch((error) =>
      toast.error(getErrorMessage(error, t("list.actionFailed"))),
    );

  const columns: AdminColumn<OperatingExpenseDto>[] = [
    {
      id: "expense",
      header: t("list.vendor"),
      primary: true,
      sortField: "vendor",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{row.vendor}</p>
          {row.description ? <p className="truncate text-[12px] text-ink-muted">{row.description}</p> : null}
          <div className="mt-1 flex flex-wrap gap-1">
            {row.recurrence !== "none" ? <Chip>{t(`recurrences.${row.recurrence}`)}</Chip> : null}
            {row.recurringSourceId ? <Chip>{t("list.occurrence")}</Chip> : null}
            {row.tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        </div>
      ),
    },
    { id: "category", header: t("list.category"), className: "w-[170px]", cell: (row) => <span className="text-[12px] text-ink">{row.categoryName}</span> },
    {
      id: "date",
      header: t("list.date"),
      sortField: "date",
      defaultDirection: "desc",
      className: "w-[110px]",
      cell: (row) => <span className="text-[12px] tabular-nums text-ink-muted">{row.expenseDate}</span>,
    },
    {
      id: "amount",
      header: t("list.amount"),
      sortField: "amount",
      defaultDirection: "desc",
      align: "right",
      className: "w-[170px]",
      cell: (row) => (
        <div className="text-right tabular-nums">
          <p className="text-[13px] text-ink">{formatMoney(row.amount, row.currency)}</p>
          {row.currency !== "VND" ? (
            <p className="text-[11px] text-ink-subtle" title={row.fxRate ? t("list.fxTitle", { rate: row.fxRate, date: row.fxRateDate ?? "" }) : undefined}>
              {row.amountVnd === null ? t("list.noRate") : formatMoney(row.amountVnd, "VND")}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "status",
      header: t("list.status"),
      className: "w-[130px]",
      cell: (row) =>
        row.status === "paid" ? (
          <span className="text-[12px] text-ink-muted">{t("statuses.paid")}</span>
        ) : canManage ? (
          <Button size="sm" variant="outline" onClick={() => void run(() => actions.markPaid.mutateAsync({ id: row.id, request: {} }), t("list.markedPaid"))}>
            {t("list.markPaid")}
          </Button>
        ) : (
          <span className="text-[12px] font-medium text-warning">{t("statuses.planned")}</span>
        ),
    },
    { id: "paidBy", header: t("list.paidBy"), className: "w-[130px]", cell: (row) => <span className="text-[12px] text-ink-muted">{row.paidBy ?? "—"}</span> },
    {
      id: "receipt",
      header: t("list.receipt"),
      className: "w-[150px]",
      cell: (row) => (
        <div className="flex items-center gap-1">
          {row.receipt ? (
            <button type="button" onClick={() => downloadReceipt(row)} className="truncate text-[12px] text-primary hover:underline" title={row.receipt.fileName}>
              <Receipt size={12} className="mr-1 inline" />
              {row.receipt.fileName}
            </button>
          ) : (
            <span className="text-[12px] text-ink-subtle">—</span>
          )}
          {canManage ? (
            <>
              <button
                type="button"
                data-row-action
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
                className="ml-auto text-[12px] text-ink-muted hover:text-ink"
              >
                {t("list.edit")}
              </button>
              <button
                type="button"
                data-row-action
                onClick={() => {
                  if (window.confirm(t("list.deleteConfirm", { vendor: row.vendor }))) {
                    void run(() => actions.remove.mutateAsync(row.id), t("list.deleted"));
                  }
                }}
                className="text-[12px] text-destructive hover:underline"
              >
                {t("list.delete")}
              </button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  const categoryName = (id: string) => categories.data?.find((category) => category.id === id)?.name ?? id;

  return (
    <>
      {totals ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={t("tiles.total")} value={formatMoney(totals.totalVnd, "VND")} />
          <Tile label={t("tiles.paid")} value={formatMoney(totals.paidVnd, "VND")} />
          <Tile label={t("tiles.planned")} value={formatMoney(totals.plannedVnd, "VND")} tone={totals.plannedVnd > 0 ? "warn" : undefined} />
          <Tile label={t("tiles.shown")} value={formatMoney(shownVnd, "VND")} caption={t("tiles.shownCaption", { count: rows.length })} />
        </div>
      ) : null}
      {expenses.data?.fxNote ? <p className="mb-2 text-[12px] text-ink-muted">{expenses.data.fxNote}</p> : null}
      {totals && totals.unconverted > 0 ? <p className="mb-2 text-[12px] text-warning">{t("list.unconverted", { count: totals.unconverted })}</p> : null}

      <AdminListToolbar
        list={list}
        searchPlaceholder={t("list.search")}
        filters={filters}
        count={expenses.isPending ? null : rows.length}
        countLabel={t("list.count", { count: rows.length })}
        isFetching={expenses.isFetching && !expenses.isPending}
        display={{
          sortOptions: [
            { field: "date", label: t("list.date") },
            { field: "amount", label: t("list.amount") },
            { field: "vendor", label: t("list.vendor") },
          ],
          groupOptions: [
            { key: "category", label: t("list.category") },
            { key: "status", label: t("list.status") },
            { key: "month", label: t("list.month") },
          ],
          columns: columns.filter((column) => !column.primary).map((column) => ({ id: column.id, label: column.header })),
        }}
        trailing={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <DownloadSimple size={14} />
              {t("list.export")}
            </Button>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={14} />
                {t("list.record")}
              </Button>
            ) : null}
          </div>
        }
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          isPending={expenses.isPending}
          isError={expenses.isError}
          onRetry={() => void expenses.refetch()}
          empty={{ title: t("list.emptyTitle"), description: t("list.emptyDescription"), icon: <Receipt size={20} weight="duotone" /> }}
          groupings={{
            category: { keyOf: (row) => row.categoryId, label: categoryName },
            status: { keyOf: (row) => row.status, label: (key) => t(`statuses.${key}`), order: EXPENSE_STATUSES },
            month: { keyOf: (row) => row.expenseDate.slice(0, 7), label: (key) => key },
          }}
          caption={t("tabs.expenses")}
          minWidth={900}
        />
      </AdminPanel>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editing} categories={categories.data ?? []} />
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-hairline bg-surface-2 px-1.5 py-px text-[10px] text-ink-muted">{children}</span>;
}

export function Tile({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: "warn" | "danger" | "good" }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "warn" ? "text-warning" : tone === "danger" ? "text-destructive" : tone === "good" ? "text-success" : "text-ink",
        )}
      >
        {value}
      </p>
      {caption ? <p className="text-[11px] text-ink-subtle">{caption}</p> : null}
    </div>
  );
}
