"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminExpenseActions, useAdminExpenseCategories } from "@/hooks/use-admin-expenses";
import { getErrorMessage } from "@/lib/api/errors";
import type { ExpenseCategoryDto } from "@/types/admin-expenses";

/**
 * The managed category list. A category is retired, never deleted: past expenses keep it, and a
 * retired one is no longer offered for new expenses or budgets. The slug is set once — CSV imports
 * refer to it — so only the name, order and active flag are edited.
 */
export function ExpenseCategories({ canManage }: { canManage: boolean }) {
  const t = useTranslations("adminFinance.categories");
  const categories = useAdminExpenseCategories();
  const actions = useAdminExpenseActions();
  const [name, setName] = useState("");

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(getErrorMessage(error, t("failed")));
    }
  };

  const rename = (category: ExpenseCategoryDto) => {
    const next = window.prompt(t("renamePrompt"), category.name)?.trim();
    if (!next || next === category.name) return;
    void run(
      () => actions.updateCategory.mutateAsync({ id: category.id, request: { name: next, description: category.description, color: category.color } }),
      t("saved"),
    );
  };

  const toggle = (category: ExpenseCategoryDto) =>
    void run(
      () =>
        actions.updateCategory.mutateAsync({
          id: category.id,
          request: { name: category.name, description: category.description, color: category.color, isActive: !category.isActive },
        }),
      category.isActive ? t("retired") : t("restored"),
    );

  return (
    <AdminPanel className="p-4">
      <h3 className="mb-1 text-[13px] font-semibold text-ink">{t("title")}</h3>
      <p className="mb-3 text-[12px] text-ink-muted">{t("description")}</p>
      <ul className="divide-y divide-hairline">
        {(categories.data ?? []).map((category) => (
          <li key={category.id} className="flex items-center gap-3 py-2 text-[13px]">
            <span className={category.isActive ? "text-ink" : "text-ink-subtle line-through"}>{category.name}</span>
            <code className="text-[11px] text-ink-subtle">{category.slug}</code>
            {category.inUse ? <span className="text-[11px] text-ink-subtle">{t("inUse")}</span> : null}
            {canManage ? (
              <span className="ml-auto flex gap-2">
                <button type="button" className="text-[12px] text-ink-muted hover:text-ink" onClick={() => rename(category)}>
                  {t("rename")}
                </button>
                <button type="button" className="text-[12px] text-ink-muted hover:text-ink" onClick={() => toggle(category)}>
                  {category.isActive ? t("retire") : t("restore")}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            void run(() => actions.createCategory.mutateAsync({ name: trimmed }), t("created")).then(() => setName(""));
          }}
        >
          <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={t("newPlaceholder")} className="h-8 max-w-xs" />
          <Button size="sm" type="submit" disabled={!name.trim() || actions.createCategory.isPending}>
            <Plus size={14} />
            {t("add")}
          </Button>
        </form>
      ) : null}
    </AdminPanel>
  );
}
