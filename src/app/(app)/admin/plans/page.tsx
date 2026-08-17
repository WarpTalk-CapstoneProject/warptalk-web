"use client";

import { useState } from "react";
import { ArrowsClockwise, PencilSimple, Plus, Tag, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import {
  PlanCreateDialog,
  PlanEditDialog,
  PricingConfigDialog,
  RateCardEditDialog,
} from "@/components/admin/pricing-editors";
import {
  useAdminPlans,
  useAdminPricingConfig,
  useAdminRateCards,
  useCreateAdminPlan,
  useUpdateAdminPlan,
  useUpdateAdminPricingConfig,
  useUpsertAdminRateCard,
} from "@/hooks/use-admin-pricing";
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
  { value: "configuration", label: "Configuration" },
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

function PlanRow({ plan, onEdit }: { plan: PlanDto; onEdit: (plan: PlanDto) => void }) {
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
            would break history — which is why the API has no delete and this has no button. The
            Active switch inside the editor is how a plan is retired. */}
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

      <div className="shrink-0 md:ml-3">
        <Button variant="outline" size="sm" onClick={() => onEdit(plan)}>
          <PencilSimple size={13} />
          Edit
        </Button>
      </div>
    </div>
  );
}

function RateCardRow({
  card,
  onEdit,
}: {
  card: UsageRateCardDto;
  onEdit: (card: UsageRateCardDto) => void;
}) {
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

      <div className="shrink-0 md:ml-3">
        <Button variant="outline" size="sm" onClick={() => onEdit(card)}>
          <PencilSimple size={13} />
          Edit
        </Button>
      </div>
    </div>
  );
}

/**
 * The platform-wide knobs, read straight down the page rather than into a table.
 *
 * Thirteen scalars with no shared unit — an FX rate beside a weight beside a day count — so a
 * table with one value column would be a table of unrelated things. The two the endpoint will not
 * take are shown last and labelled as derived, so their absence from the editor reads as a fact
 * about them rather than as an omission.
 */
function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline/60 px-4 py-2.5 last:border-b-0">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[13px] tabular-nums text-ink">{value}</span>
    </div>
  );
}

export default function AdminPlansPage() {
  const [tab, setTab] = useState<Tab>("plans");
  const plansQuery = useAdminPlans();
  const rateCardsQuery = useAdminRateCards();
  const configQuery = useAdminPricingConfig();

  const updatePlan = useUpdateAdminPlan();
  const createPlan = useCreateAdminPlan();
  const upsertRateCard = useUpsertAdminRateCard();
  const updateConfig = useUpdateAdminPricingConfig();

  /**
   * The row being edited, held as the row itself rather than as an id.
   *
   * The dialog seeds its draft from the WHOLE record so the columns it does not show survive the
   * save. Holding an id and looking it up again would work until a refetch swapped the array
   * underneath an open dialog, which is exactly when the two would disagree.
   */
  const [editingPlan, setEditingPlan] = useState<PlanDto | null>(null);
  const [editingCard, setEditingCard] = useState<UsageRateCardDto | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  const plans = plansQuery.data ?? [];
  const rateCards = rateCardsQuery.data ?? [];
  const config = configQuery.data ?? null;

  const active =
    tab === "plans" ? plansQuery : tab === "rate-cards" ? rateCardsQuery : configQuery;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Revenue"
        eyebrowIcon={<Tag size={14} weight="fill" />}
        title="Plans & pricing"
        description="What the platform sells, and what each unit of it costs to serve."
        actions={
          <>
            {tab === "plans" ? (
              <Button size="sm" onClick={() => setIsCreatingPlan(true)}>
                <Plus size={14} />
                New plan
              </Button>
            ) : null}
            {tab === "configuration" ? (
              <Button size="sm" onClick={() => setIsConfigOpen(true)} disabled={config === null}>
                <PencilSimple size={14} />
                Edit configuration
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void active.refetch()}
              disabled={active.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(active.isFetching && "animate-spin")} />
              Refresh
            </Button>
          </>
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
            : tab === "rate-cards"
              ? rateCardsQuery.isPending
                ? "Loading…"
                : `${rateCards.length} rate card${rateCards.length === 1 ? "" : "s"}`
              : configQuery.isPending
                ? "Loading…"
                : "Platform-wide"
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
                  <PlanRow plan={plan} onEdit={setEditingPlan} />
                </li>
              ))}
            </ul>
          </PanelState>
        ) : tab === "rate-cards" ? (
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
                  <RateCardRow card={card} onEdit={setEditingCard} />
                </li>
              ))}
            </ul>
          </PanelState>
        ) : (
          <PanelState
            isError={configQuery.isError}
            isPending={configQuery.isPending}
            isEmpty={config === null}
            errorText="Pricing configuration could not be loaded."
            emptyText="No pricing configuration is stored."
            onRetry={() => void configQuery.refetch()}
          >
            {config ? (
              <div>
                <ConfigRow
                  label="FX rate USD→VND"
                  value={numberFormatter.format(config.fxRateUsdVnd)}
                />
                <ConfigRow
                  label="Credit value (VND)"
                  value={numberFormatter.format(config.creditValueVnd)}
                />
                <ConfigRow
                  label="Minimum price per credit (VND)"
                  value={numberFormatter.format(config.minimumPricePerCreditVnd)}
                />
                <ConfigRow
                  label="Minimum contract price"
                  value={`${formatAdminMoney({ amount: config.minimumContractPriceVnd, currency: "VND" })} · ${formatAdminMoney({ amount: config.minimumContractPriceUsd, currency: "USD" })}`}
                />
                <ConfigRow label="Sales weight · usage" value={config.salesUsageWeight} />
                <ConfigRow label="Sales weight · members" value={config.salesMembersWeight} />
                <ConfigRow label="Sales weight · languages" value={config.salesLanguagesWeight} />
                <ConfigRow
                  label="Sales weight · AI services"
                  value={config.salesAiServicesWeight}
                />
                <ConfigRow
                  label="Default overage cap ratio"
                  value={config.defaultOverageCapRatio}
                />
                <ConfigRow
                  label="Default invoice terms"
                  value={`${config.defaultInvoiceTermsDays} days`}
                />
                <ConfigRow
                  label="Default invoice grace"
                  value={`${config.defaultInvoiceGraceHours} hours`}
                />
                {/* The two the write endpoint does not take. Shown so their absence from the
                    editor reads as a property of the field, not as a gap in the form. */}
                <ConfigRow
                  label="Formula (derived)"
                  value={<span className="font-mono text-[11px]">{config.formula}</span>}
                />
                <ConfigRow
                  label="Resolver key (derived)"
                  value={<span className="font-mono text-[11px]">{config.resolverKey}</span>}
                />
              </div>
            ) : null}
          </PanelState>
        )}
      </AdminPanel>

      <p className="mt-4 text-[12px] text-ink-muted">
        Editable, within what the API allows. There is no create and no delete on this screen
        because there is none on the API: a plan is named on every invoice ever raised against it,
        so it is retired with its Active switch rather than removed. A new rate-card identity
        still arrives with the migration that registers it.
      </p>

      <PlanCreateDialog
        open={isCreatingPlan}
        onOpenChange={setIsCreatingPlan}
        onSubmit={(request) => createPlan.mutateAsync(request)}
        isSaving={createPlan.isPending}
      />

      <PlanEditDialog
        plan={editingPlan}
        open={editingPlan !== null}
        onOpenChange={(open) => {
          if (!open) setEditingPlan(null);
        }}
        onSubmit={(request) => {
          // The dialog only submits while a plan is open, but the id is read here rather than
          // asserted: a closed dialog resolving is a no-op, not a crash.
          if (!editingPlan) return Promise.resolve();
          return updatePlan.mutateAsync({ id: editingPlan.id, request });
        }}
        isSaving={updatePlan.isPending}
      />

      <RateCardEditDialog
        card={editingCard}
        open={editingCard !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCard(null);
        }}
        onSubmit={(request) => upsertRateCard.mutateAsync(request)}
        isSaving={upsertRateCard.isPending}
      />

      <PricingConfigDialog
        config={isConfigOpen ? config : null}
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        onSubmit={(request) => updateConfig.mutateAsync(request)}
        isSaving={updateConfig.isPending}
      />
    </AdminPage>
  );
}
