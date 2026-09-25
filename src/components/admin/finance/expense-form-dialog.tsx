"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminExpenseActions } from "@/hooks/use-admin-expenses";
import { parseTags } from "@/lib/admin/expenses";
import { getErrorMessage } from "@/lib/api/errors";
import {
  EXPENSE_CURRENCIES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_RECURRENCES,
  EXPENSE_STATUSES,
  type ExpenseCategoryDto,
  type ExpenseCurrency,
  type ExpenseRecurrence,
  type ExpenseStatus,
  type OperatingExpenseDto,
} from "@/types/admin-expenses";

const SELECT = "h-9 w-full rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink";

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Record or edit one expense. A receipt is attached after saving (it needs the expense's id), from
 * the same dialog: the file picker appears once the expense exists.
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: OperatingExpenseDto | null;
  categories: readonly ExpenseCategoryDto[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-xl">
        {open ? <ExpenseForm expense={expense} categories={categories} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  expense,
  categories,
  onDone,
}: {
  expense: OperatingExpenseDto | null;
  categories: readonly ExpenseCategoryDto[];
  onDone: () => void;
}) {
  const t = useTranslations("adminFinance.form");
  const tf = useTranslations("adminFinance");
  const actions = useAdminExpenseActions();
  const selectable = categories.filter((category) => category.isActive || category.id === expense?.categoryId);

  const [date, setDate] = useState(expense?.expenseDate ?? today());
  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? selectable[0]?.id ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [currency, setCurrency] = useState<ExpenseCurrency>(expense?.currency ?? "VND");
  const [status, setStatus] = useState<ExpenseStatus>(expense?.status ?? "paid");
  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? "bank_transfer");
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? "");
  const [tags, setTags] = useState(expense?.tags.join(", ") ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>(expense?.recurrence ?? "none");
  const [endDate, setEndDate] = useState(expense?.recurrenceEndDate ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOccurrence = Boolean(expense?.recurringSourceId);
  const saving = actions.create.isPending || actions.update.isPending || actions.uploadReceipt.isPending;

  const submit = async () => {
    const value = Number(amount.replace(/,/g, ""));
    if (!vendor.trim()) return setError(t("errors.vendor"));
    if (!categoryId) return setError(t("errors.category"));
    if (!Number.isFinite(value) || value < 0) return setError(t("errors.amount"));
    if (currency === "VND" && !Number.isInteger(value)) return setError(t("errors.vndDecimals"));
    const request = {
      expenseDate: date,
      vendor: vendor.trim(),
      categoryId,
      description: description.trim() || null,
      amount: value,
      currency,
      paymentMethod: paymentMethod || null,
      status,
      paidBy: paidBy.trim() || null,
      tags: parseTags(tags),
      recurrence: isOccurrence ? "none" : recurrence,
      recurrenceEndDate: recurrence !== "none" && endDate ? endDate : null,
    } as const;
    try {
      setError(null);
      const saved = expense
        ? await actions.update.mutateAsync({ id: expense.id, request })
        : await actions.create.mutateAsync(request);
      if (file) await actions.uploadReceipt.mutateAsync({ id: saved.id, file });
      toast.success(expense ? t("updated") : t("created"));
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, t("errors.generic")));
    }
  };

  return (
    <>
      <DialogHeader className="pb-4">
        <DialogTitle>{expense ? t("editTitle") : t("createTitle")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("date")} htmlFor="expense-date">
          <Input id="expense-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label={t("vendor")} htmlFor="expense-vendor">
          <Input id="expense-vendor" value={vendor} maxLength={200} onChange={(event) => setVendor(event.target.value)} />
        </Field>
        <Field label={t("category")} htmlFor="expense-category">
          <select id="expense-category" className={SELECT} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {selectable.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Field label={t("amount")} htmlFor="expense-amount">
            <Input id="expense-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label={t("currency")} htmlFor="expense-currency">
            <select id="expense-currency" className={SELECT} value={currency} onChange={(event) => setCurrency(event.target.value as ExpenseCurrency)}>
              {EXPENSE_CURRENCIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("status")} htmlFor="expense-status">
          <select id="expense-status" className={SELECT} value={status} onChange={(event) => setStatus(event.target.value as ExpenseStatus)}>
            {EXPENSE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {tf(`statuses.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("paymentMethod")} htmlFor="expense-method">
          <select id="expense-method" className={SELECT} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            {EXPENSE_PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {tf(`paymentMethods.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("paidBy")} htmlFor="expense-paid-by">
          <Input id="expense-paid-by" value={paidBy} maxLength={200} onChange={(event) => setPaidBy(event.target.value)} />
        </Field>
        <Field label={t("tags")} htmlFor="expense-tags" hint={t("tagsHint")}>
          <Input id="expense-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
        </Field>
        {isOccurrence ? (
          <p className="text-[12px] text-ink-muted sm:col-span-2">{t("occurrenceNote")}</p>
        ) : (
          <>
            <Field label={t("recurrence")} htmlFor="expense-recurrence" hint={t("recurrenceHint")}>
              <select
                id="expense-recurrence"
                className={SELECT}
                value={recurrence}
                onChange={(event) => setRecurrence(event.target.value as ExpenseRecurrence)}
              >
                {EXPENSE_RECURRENCES.map((value) => (
                  <option key={value} value={value}>
                    {tf(`recurrences.${value}`)}
                  </option>
                ))}
              </select>
            </Field>
            {recurrence !== "none" ? (
              <Field label={t("recurrenceEnd")} htmlFor="expense-end">
                <Input id="expense-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </Field>
            ) : null}
          </>
        )}
        <Field label={t("notes")} htmlFor="expense-description" className="sm:col-span-2">
          <Textarea
            id="expense-description"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label={expense?.receipt ? t("replaceReceipt") : t("receipt")} htmlFor="expense-receipt" hint={t("receiptHint")} className="sm:col-span-2">
          <Input
            id="expense-receipt"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
      </div>

      {error ? <p role="alert" className="mt-3 text-[13px] text-destructive">{error}</p> : null}

      <DialogFooter className="pt-4">
        <Button variant="outline" onClick={onDone} disabled={saving}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={saving}>
          {expense ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-1 block text-[12px] text-ink-muted">
        {label}
      </Label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
