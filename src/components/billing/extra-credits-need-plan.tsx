"use client";

/**
 * backend#467: what a purchase entry point shows instead of itself when the workspace has no live
 * plan. Extra credits are sold only on top of a plan, so the one useful thing to say is which
 * step comes first, with the link that takes it.
 */

import { Wallet } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function ExtraCreditsNeedPlan({
  plansHref,
  className,
}: {
  /** Where the plans are. Omitted for a reader who cannot buy one (a member): no link, same sentence. */
  plansHref?: string | null;
  className?: string;
}) {
  const t = useTranslations("settingsBilling");
  return (
    <div
      role="note"
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{t("purchaseGate.title")}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{t("purchaseGate.description")}</p>
      </div>
      {plansHref ? (
        <Link
          href={plansHref}
          className="inline-flex h-[28px] shrink-0 items-center gap-1.5 self-start rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background transition hover:opacity-90 sm:self-auto"
        >
          <Wallet className="h-3.5 w-3.5" />
          {t("purchaseGate.cta")}
        </Link>
      ) : null}
    </div>
  );
}
