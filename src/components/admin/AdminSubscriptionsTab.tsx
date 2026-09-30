"use client";

import { ArrowRight, CreditCard } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { buttonVariants } from "@/components/ui/button";

/**
 * The Billing page's Subscriptions tab is a pointer to /admin/subscriptions, not a second list.
 *
 * It used to be one: `getGlobalSubscriptions(1, 200)` filtered in memory, so past 200
 * subscriptions it silently stopped being every subscription, and its "Force cancel" hit the same
 * DELETE /subscriptions/workspace/{id} the directory's Cancel does — with a hardcoded reason
 * instead of the one the directory requires. The directory is the server-side list, with revenue
 * totals and both lifecycle actions (cancel, reactivate), so a second copy here could only fall
 * behind it.
 */
export function AdminSubscriptionsTab() {
  const t = useTranslations("adminBillingLedger.lists.subscriptions");
  return (
    <AdminPanel className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
        <CreditCard size={20} weight="duotone" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-medium text-ink">{t("title")}</h2>
        <p className="mt-1 max-w-xl text-xs text-ink-muted">{t("description")}</p>
      </div>
      <Link href="/admin/subscriptions" className={buttonVariants({ variant: "outline", size: "sm" })}>
        {t("open")}
        <ArrowRight size={13} aria-hidden />
      </Link>
    </AdminPanel>
  );
}
