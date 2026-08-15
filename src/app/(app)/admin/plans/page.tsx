"use client";

import { useState } from "react";
import { ArrowsClockwise, Tag, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { useAdminPlans, useAdminRateCards } from "@/hooks/use-admin-pricing";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import {
  marginLabel,
  marginTone,
  resolveRateCardMargin,
} from "@/lib/billing/rate-card-margin";
import { cn } from "@/lib/utils";
import type { UsageRateCardDto } from "@/types/admin-pricing";
import type { PlanDto } from "@/types/billing";

const TABS = [
  { value: "plans", label: "Plans" },
  { value: "rate-cards", label: "Rate cards" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const numberFormatter = new Intl.NumberFormat("en-US");

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(value));
}

function PanelState({
  isError,
  isPending,
  isEmpty,
  errorText,
  emptyText,
  onRetry,
  children,
}: {
  isError: boolean;
  isPending: boolean;
  isEmpty: boolean;
  errorText: string;
  emptyText: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (isError) {
    return (
      <div className="flex items-start gap-3 px-4 py-10 text-sm">
        <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">{errorText}</p>
          <p className="mt-1 text-ink-muted">
            Check the billing service and that your session still holds the platform admin role.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <ul>
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
            <div className="h-3 w-48 animate-pulse rounded bg-surface-2" />
          </li>
        ))}
      </ul>
    );
  }

  if (isEmpty) {
    return (
      <div className="grid place-items-center px-4 py-14 text-center text-sm text-ink-muted">
        {emptyText}
      </div>
    );
  }

  return <>{children}</>;
}

function PlanRow({ plan }: { plan: PlanDto }) {
  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{plan.name}</p>
        <p className="truncate font-mono text-[11px] text-ink-subtle">{plan.slug}</p>
      </div>
      <div className="w-[110px] shrink-0 text-[12px] text-ink-muted">{plan.tier}</div>
      <div className="w-[100px] shrink-0 text-[12px] text-ink-muted">{plan.billingCycle}</div>
      <div className="w-[140px] shrink-0 text-[13px] tabular-nums text-ink md:text-right">
        {formatAdminMoney({ amount: plan.price, currency: plan.currency })}
      </div>
      <div className="w-[130px] shrink-0 text-[13px] tabular-nums text-ink-muted md:text-right">
        {numberFormatter.format(plan.creditsPerCycle)}
      </div>
      <div className="w-[90px] shrink-0 md:text-right">
        {/* Hidden, not deleted. A deactivated plan still appears on old invoices, so removing it
            would break history — which is why the API has no delete and this has no button. */}
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            plan.isActive
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-border bg-surface-2 text-ink-muted",
          )}
        >
          {plan.isActive ? "Active" : "Hidden"}
        </span>
      </div>
    </div>
  );
}

function RateCardRow({ card }: { card: UsageRateCardDto }) {
  const margin = resolveRateCardMargin(card);
  const tone = marginTone(margin);

  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{card.chargeType}</p>
        <p className="truncate text-[11px] text-ink-subtle">
          {card.provider}
          {card.model ? ` · ${card.model}` : ""}
          {card.sourceLanguageCode || card.targetLanguageCode
            ? ` · ${card.sourceLanguageCode ?? "*"}→${card.targetLanguageCode ?? "*"}`
            : ""}
        </p>
      </div>

      <div className="w-[80px] shrink-0 text-[12px] text-ink-muted">{card.unit}</div>

      <div className="w-[130px] shrink-0 text-[13px] tabular-nums text-ink md:text-right">
        {formatAdminMoney({ amount: card.unitPrice, currency: card.currency })}
      </div>

      <div className="w-[130px] shrink-0 text-[13px] tabular-nums text-ink-muted md:text-right">
        {card.providerUnitCostUsd == null
          ? "—"
          : formatAdminMoney({ amount: card.providerUnitCostUsd, currency: "USD" })}
      </div>

      {/* The column this page exists for. It is the STORED multiplier where there is one, and a
          named refusal where price and cost are in different currencies — never price ÷ cost
          across VND and USD, which produces a plausible number that is off by the exchange rate. */}
      <div
        className={cn(
          "w-[140px] shrink-0 text-[13px] tabular-nums md:text-right",
          tone === "loss" && "font-semibold text-destructive",
          tone === "thin" && "font-semibold text-amber-600 dark:text-amber-400",
          tone === "healthy" && "font-semibold text-emerald-600 dark:text-emerald-400",
          tone === "unknown" && "text-[11px] italic text-ink-subtle",
        )}
        title={
          margin.source === "derived"
            ? "Computed from price and cost — both in USD"
            : margin.source === "recorded"
              ? "As recorded on the rate card"
              : undefined
        }
      >
        {marginLabel(margin)}
      </div>

      <div className="w-[150px] shrink-0 text-[12px] text-ink-muted md:text-right">
        from {formatDate(card.effectiveFrom)}
      </div>
    </div>
  );
}

export default function AdminPlansPage() {
  const [tab, setTab] = useState<Tab>("plans");
  const plansQuery = useAdminPlans();
  const rateCardsQuery = useAdminRateCards();

  const plans = plansQuery.data ?? [];
  const rateCards = rateCardsQuery.data ?? [];

  const active = tab === "plans" ? plansQuery : rateCardsQuery;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Revenue"
        eyebrowIcon={<Tag size={14} weight="fill" />}
        title="Plans & pricing"
        description="What the platform sells, and what each unit of it costs to serve."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void active.refetch()}
            disabled={active.isFetching}
          >
            <ArrowsClockwise size={14} className={cn(active.isFetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <AdminFilterTabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        label="Pricing view"
        trailing={
          tab === "plans"
            ? plansQuery.isPending
              ? "Loading…"
              : `${plans.length} plan${plans.length === 1 ? "" : "s"}`
            : rateCardsQuery.isPending
              ? "Loading…"
              : `${rateCards.length} rate card${rateCards.length === 1 ? "" : "s"}`
        }
      />

      {tab === "rate-cards" ? (
        <p className="mt-4 text-[12px] text-ink-muted">
          Margins are read from the rate card&rsquo;s recorded multiplier. Where a price is in one
          currency and the provider cost in another, no margin is shown — dividing them would
          produce a number off by the exchange rate.
        </p>
      ) : null}

      <AdminPanel className="mt-3">
        {tab === "plans" ? (
          <PanelState
            isError={plansQuery.isError}
            isPending={plansQuery.isPending}
            isEmpty={plans.length === 0}
            errorText="Plans could not be loaded."
            emptyText="No plans in the catalogue."
            onRetry={() => void plansQuery.refetch()}
          >
            <ul>
              {plans.map((plan) => (
                <li key={plan.id}>
                  <PlanRow plan={plan} />
                </li>
              ))}
            </ul>
          </PanelState>
        ) : (
          <PanelState
            isError={rateCardsQuery.isError}
            isPending={rateCardsQuery.isPending}
            isEmpty={rateCards.length === 0}
            errorText="Rate cards could not be loaded."
            emptyText="No rate cards configured."
            onRetry={() => void rateCardsQuery.refetch()}
          >
            <ul>
              {rateCards.map((card) => (
                <li key={card.id}>
                  <RateCardRow card={card} />
                </li>
              ))}
            </ul>
          </PanelState>
        )}
      </AdminPanel>

      <p className="mt-4 text-[12px] text-ink-muted">
        Read-only. The write endpoints exist — <code className="font-mono">PUT /plans/{"{id}"}</code>{" "}
        and <code className="font-mono">PUT /usages/rate-card</code> — and editing money is worth
        its own release rather than arriving as a side effect of building a table.
      </p>
    </AdminPage>
  );
}
