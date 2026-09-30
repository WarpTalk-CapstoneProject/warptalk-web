"use client";

import { useState } from "react";
import { CheckCircle, DownloadSimple, UploadSimple, Warning, XCircle } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminExpenseActions, useAdminExpenseCategories } from "@/hooks/use-admin-expenses";
import { EXPENSE_CSV_COLUMNS, expenseCsvTemplate, toCsv } from "@/lib/admin/expenses";
import { getErrorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format/currency";
import { downloadBlob } from "@/lib/ui/download-blob";
import { cn } from "@/lib/utils";
import type { ExpenseImportPreviewDto } from "@/types/admin-expenses";

const MAX_BYTES = 2_000_000;

/**
 * CSV import in three steps: choose a file, read the server's validation of every row (errors block
 * a row, warnings — a likely duplicate, a USD day with no rate — do not), then commit. Nothing is
 * written until "Import"; with errors present the only commit on offer is "import the valid rows".
 */
export function ExpenseImport({ onDone }: { onDone: () => void }) {
  const t = useTranslations("adminFinance.import");
  const categories = useAdminExpenseCategories();
  const actions = useAdminExpenseActions();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExpenseImportPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    setPreview(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t("tooLarge"));
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    try {
      setPreview(await actions.previewImport.mutateAsync(text));
    } catch (err) {
      setError(getErrorMessage(err, t("previewFailed")));
    }
  };

  const commit = async (skipInvalid: boolean) => {
    if (!csv) return;
    try {
      const result = await actions.commitImport.mutateAsync({ csv, skipInvalid });
      toast.success(t("imported", { count: result.imported, skipped: result.skipped }));
      setCsv(null);
      setPreview(null);
      setFileName(null);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, t("importFailed")));
    }
  };

  const template = () =>
    void downloadBlob(
      () => new Blob(["﻿", toCsv(expenseCsvTemplate(categories.data ?? []))], { type: "text/csv;charset=utf-8" }),
      "warptalk-expenses-template.csv",
    );

  return (
    <div className="space-y-4">
      <AdminPanel className="space-y-3 p-4">
        <ol className="grid gap-2 text-[12px] text-ink-muted sm:grid-cols-3">
          <li className={cn(!csv && "font-medium text-ink")}>1. {t("step1")}</li>
          <li className={cn(csv && !preview && "font-medium text-ink")}>2. {t("step2")}</li>
          <li className={cn(preview && "font-medium text-ink")}>3. {t("step3")}</li>
        </ol>
        <p className="text-[12px] text-ink-muted">
          {t("columns", { required: "date, vendor, category, amount", optional: EXPENSE_CSV_COLUMNS.slice(4).join(", ") })}
        </p>
        <p className="text-[12px] text-ink-subtle">
          {t("categoriesHint", { slugs: (categories.data ?? []).filter((c) => c.isActive).map((c) => c.slug).join(", ") })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={template}>
            <DownloadSimple size={14} />
            {t("template")}
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <UploadSimple size={14} className="text-ink-muted" />
            <Input
              type="file"
              accept=".csv,text/csv"
              className="h-8 max-w-[280px] text-[12px]"
              onChange={(event) => void choose(event.target.files?.[0])}
              aria-label={t("choose")}
            />
          </label>
          {fileName ? <span className="text-[12px] text-ink-muted">{fileName}</span> : null}
          {actions.previewImport.isPending ? <span className="text-[12px] text-ink-muted">{t("validating")}</span> : null}
        </div>
        {error ? <p role="alert" className="text-[13px] text-destructive">{error}</p> : null}
      </AdminPanel>

      {preview ? (
        <AdminPanel className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="inline-flex items-center gap-1 text-ink">
              <CheckCircle size={14} className="text-success" />
              {t("validRows", { count: preview.validCount })}
            </span>
            {preview.invalidCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                <XCircle size={14} />
                {t("invalidRows", { count: preview.invalidCount })}
              </span>
            ) : null}
            <span className="text-ink-muted">{t("totalVnd", { total: formatMoney(Math.round(preview.totalVnd), "VND") })}</span>
            {preview.unknownColumns.length > 0 ? (
              <span className="text-warning">{t("unknownColumns", { columns: preview.unknownColumns.join(", ") })}</span>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreview(null);
                  setCsv(null);
                  setFileName(null);
                }}
              >
                {t("cancel")}
              </Button>
              {preview.invalidCount === 0 ? (
                <Button size="sm" disabled={actions.commitImport.isPending} onClick={() => void commit(false)}>
                  {t("importAll", { count: preview.validCount })}
                </Button>
              ) : (
                <Button size="sm" disabled={preview.validCount === 0 || actions.commitImport.isPending} onClick={() => void commit(true)}>
                  {t("importValid", { count: preview.validCount })}
                </Button>
              )}
            </div>
          </div>

          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[820px] text-[12px]">
              <caption className="sr-only">{t("previewCaption")}</caption>
              <thead className="sticky top-0 bg-surface-1">
                <tr className="border-b border-hairline text-left text-ink-muted">
                  <th scope="col" className="py-1.5 pr-2 font-medium">{t("line")}</th>
                  <th scope="col" className="py-1.5 pr-2 font-medium">{t("date")}</th>
                  <th scope="col" className="py-1.5 pr-2 font-medium">{t("vendor")}</th>
                  <th scope="col" className="py-1.5 pr-2 font-medium">{t("category")}</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t("amount")}</th>
                  <th scope="col" className="py-1.5 pl-3 font-medium">{t("result")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className={cn("border-b border-hairline align-top last:border-0", !row.valid && "bg-destructive/5")}>
                    <td className="py-1.5 pr-2 tabular-nums text-ink-subtle">{row.line}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-ink">{row.expenseDate ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-ink">{row.vendor ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-ink">{row.categoryName ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-ink">
                      {row.amount !== null && row.currency ? formatMoney(row.amount, row.currency) : "—"}
                    </td>
                    <td className="py-1.5 pl-3">
                      {row.errors.map((message) => (
                        <p key={message} className="flex items-start gap-1 text-destructive">
                          <XCircle size={12} className="mt-0.5 shrink-0" />
                          {message}
                        </p>
                      ))}
                      {row.warnings.map((message) => (
                        <p key={message} className="flex items-start gap-1 text-warning">
                          <Warning size={12} className="mt-0.5 shrink-0" />
                          {message}
                        </p>
                      ))}
                      {row.valid && row.warnings.length === 0 ? <span className="text-ink-subtle">{t("ok")}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>
      ) : null}
    </div>
  );
}
