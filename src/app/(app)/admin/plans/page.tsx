"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowsClockwise,
  CalendarBlank,
  Coins,
  Cpu,
  CurrencyCircleDollar,
  Gauge,
  PencilSimple,
  Plus,
  Prohibit,
  Ruler,
  Stack,
  Tag,
  ToggleRight,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  useAdminActionIntent,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
  type AdminFilterOption,
} from "@/components/admin/list";
import {
  PlanCreateDialog,
  PlanEditDialog,
  PricingConfigDialog,
  RateCardDeactivateDialog,
  RateCardEditDialog,
} from "@/components/admin/pricing-editors";
import {
  useAdminPlans,
  useAdminPricingConfig,
  useAdminRateCards,
  useCreateAdminPlan,
  useDeactivateAdminRateCard,
  useSetAdminRateCardProviderCost,
  useUpdateAdminPlan,
  useUpdateAdminPricingConfig,
  useUpsertAdminRateCard,
} from "@/hooks/use-admin-pricing";
import {
  applyClientListState,
  type ClientListAccessors,
  type ListStateConfig,
} from "@/lib/admin/list-state";
import { matchesSearch } from "@/lib/admin/search-text";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import {
  marginLabel,
  marginTone,
  resolveRateCardMargin,
} from "@/lib/billing/rate-card-margin";
import { cn } from "@/lib/utils";
import type { UsageRateCardDto } from "@/types/admin-pricing";
import type { PlanDto } from "@/types/billing";

const TAB_VALUES = ["plans", "rate-cards", "configuration"] as const;

type Tab = (typeof TAB_VALUES)[number];

function isTab(value: string | null): value is Tab {
  return (TAB_VALUES as readonly string[]).includes(value ?? "");
}

const numberFormatter = new Intl.NumberFormat("en-US");

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(value));
}

/** Distinct values of one property across a whole catalogue, as filter options. */
function distinctOptions<T>(
  rows: readonly T[],
  valueOf: (row: T) => string | null | undefined,
  labelOf: (value: string) => string = (value) => value,
): AdminFilterOption[] {
  const values = Array.from(new Set(rows.map(valueOf).filter((value): value is string => Boolean(value))));
  return values
    .sort((a, b) => a.localeCompare(b))
    .map((value) => {
      const label = labelOf(value);
      return { value, label, hint: label === value ? undefined : value };
    });
}

// ── Plans ────────────────────────────────────────────────────────────────────

/**
 * The plan catalogue is small and fetched whole, so its view is filtered here, in the browser,
 * with `applyClientListState`. Tier, cycle and currency are open sets (whatever the catalogue
 * holds), so their options come from the rows and their defs carry no `values`.
 */
const PLAN_LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "tier", kind: "enum", multiple: true },
    { key: "cycle", kind: "enum", multiple: true },
    { key: "currency", kind: "enum", multiple: true },
    { key: "active", kind: "boolean" },
  ],
  sortFields: ["order", "name", "price", "credits"],
  defaultSort: { field: "order", direction: "asc" },
  columns: [
    { id: "plan" },
    { id: "tier" },
    { id: "cycle" },
    { id: "price" },
    { id: "credits" },
    { id: "status" },
    { id: "order", defaultHidden: true },
  ],
  groupings: ["tier", "cycle", "currency"],
};

const PLAN_ACCESSORS: ClientListAccessors<PlanDto> = {
  search: (plan) => [plan.name, plan.slug, plan.tier],
  filters: {
    tier: (plan) => plan.tier,
    cycle: (plan) => plan.billingCycle,
    currency: (plan) => plan.currency,
    active: (plan) => plan.isActive,
  },
  sort: {
    order: (plan) => plan.sortOrder,
    name: (plan) => plan.name,
    // Amounts, not a converted value: plans in different currencies do not order against each
    // other meaningfully, which is why Currency is offered as a filter and a grouping beside it.
    price: (plan) => plan.price,
    credits: (plan) => plan.creditsPerCycle,
  },
};

function PlansList({
  plans,
  isPending,
  isError,
  isFetching,
  onRetry,
  onEdit,
}: {
  plans: readonly PlanDto[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onEdit: (plan: PlanDto) => void;
}) {
  const t = useTranslations("adminPlansSettings.plans");
  const list = useAdminListState(PLAN_LIST_CONFIG);
  const { state } = list;

  const rows = useMemo(
    () => applyClientListState(plans, state, PLAN_ACCESSORS, matchesSearch),
    [plans, state],
  );

  const cycleLabel = (value: string) =>
    value === "monthly" ? t("list.cycles.monthly") : value === "yearly" || value === "year" ? t("list.cycles.yearly") : value;

  const filterFields: AdminFilterField[] = [
    {
      key: "tier",
      label: t("list.plans.filters.tier"),
      icon: <Stack size={13} />,
      kind: "enum",
      multiple: true,
      options: distinctOptions(plans, (plan) => plan.tier),
    },
    {
      key: "cycle",
      label: t("list.plans.filters.cycle"),
      icon: <CalendarBlank size={13} />,
      kind: "enum",
      multiple: true,
      options: distinctOptions(plans, (plan) => plan.billingCycle, cycleLabel),
    },
    {
      key: "currency",
      label: t("list.plans.filters.currency"),
      icon: <CurrencyCircleDollar size={13} />,
      kind: "enum",
      multiple: true,
      options: distinctOptions(plans, (plan) => plan.currency),
    },
    {
      key: "active",
      label: t("list.plans.filters.active"),
      icon: <ToggleRight size={13} />,
      kind: "boolean",
      trueLabel: t("planRow.active"),
      falseLabel: t("planRow.hidden"),
    },
  ];

  const columns: AdminColumn<PlanDto>[] = [
    {
      id: "plan",
      header: t("list.plans.columns.plan"),
      primary: true,
      sortField: "name",
      cell: (plan) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{plan.name}</p>
          <p className="truncate font-mono text-[11px] font-normal text-ink-subtle">{plan.slug}</p>
        </div>
      ),
    },
    {
      id: "tier",
      header: t("list.plans.columns.tier"),
      className: "w-[110px]",
      cell: (plan) => <span className="text-[12px] text-ink-muted">{plan.tier}</span>,
    },
    {
      id: "cycle",
      header: t("list.plans.columns.cycle"),
      className: "w-[110px]",
      cell: (plan) => <span className="text-[12px] text-ink-muted">{cycleLabel(plan.billingCycle)}</span>,
    },
    {
      id: "price",
      header: t("list.plans.columns.price"),
      align: "right",
      className: "w-[140px]",
      sortField: "price",
      defaultDirection: "desc",
      cell: (plan) => formatAdminMoney({ amount: plan.price, currency: plan.currency }),
    },
    {
      id: "credits",
      header: t("list.plans.columns.credits"),
      align: "right",
      className: "w-[130px]",
      sortField: "credits",
      defaultDirection: "desc",
      cell: (plan) => <span className="text-ink-muted">{numberFormatter.format(plan.creditsPerCycle)}</span>,
    },
    {
      id: "status",
      header: t("list.plans.columns.status"),
      className: "w-[100px]",
      // Hidden, not deleted. A deactivated plan still appears on old invoices, so removing it would
      // break history — which is why the API has no delete and this has no button. The Active
      // switch inside the editor is how a plan is retired.
      cell: (plan) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            plan.isActive
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-border bg-surface-2 text-ink-muted",
          )}
        >
          {plan.isActive ? t("planRow.active") : t("planRow.hidden")}
        </span>
      ),
    },
    {
      id: "order",
      header: t("list.plans.columns.order"),
      align: "right",
      className: "w-[80px]",
      sortField: "order",
      cell: (plan) => <span className="text-ink-muted">{plan.sortOrder}</span>,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      className: "w-[90px]",
      cell: (plan) => (
        <Button variant="outline" size="sm" onClick={() => onEdit(plan)}>
          <PencilSimple size={13} />
          {t("planRow.edit")}
        </Button>
      ),
    },
  ];

  return (
    <>
      <AdminListToolbar
        list={list}
        searchPlaceholder={t("list.plans.searchPlaceholder")}
        filters={filterFields}
        count={isPending ? null : rows.length}
        countLabel={
          list.narrowed
            ? t("list.visibleOfTotal", { visible: rows.length, total: plans.length })
            : t("planCount", { count: plans.length })
        }
        isFetching={isFetching && !isPending}
        display={{
          sortOptions: [
            { field: "order", label: t("list.plans.sortFields.order") },
            { field: "name", label: t("list.plans.sortFields.name") },
            { field: "price", label: t("list.plans.sortFields.price") },
            { field: "credits", label: t("list.plans.sortFields.credits") },
          ],
          groupOptions: [
            { key: "tier", label: t("list.plans.filters.tier") },
            { key: "cycle", label: t("list.plans.filters.cycle") },
            { key: "currency", label: t("list.plans.filters.currency") },
          ],
          columns: columns
            .filter((column) => !column.primary && column.id !== "actions")
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />
      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={rows}
          rowKey={(plan) => plan.id}
          isPending={isPending}
          isError={isError}
          onRetry={onRetry}
          empty={{ title: t("plansEmpty"), icon: <Tag size={20} weight="duotone" /> }}
          groupings={{
            tier: { keyOf: (plan) => plan.tier, label: (key) => key },
            cycle: { keyOf: (plan) => plan.billingCycle, label: cycleLabel },
            currency: { keyOf: (plan) => plan.currency, label: (key) => key },
          }}
          caption={t("tabs.plans")}
          minWidth={820}
        />
      </AdminPanel>
    </>
  );
}

// ── Rate cards ───────────────────────────────────────────────────────────────

const MARGIN_BANDS = ["loss", "thin", "healthy", "unknown"] as const;

const RATE_CARD_LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "chargeType", kind: "enum", multiple: true },
    { key: "provider", kind: "enum", multiple: true },
    { key: "unit", kind: "enum", multiple: true },
    { key: "currency", kind: "enum", multiple: true },
    { key: "margin", kind: "enum", multiple: true, values: MARGIN_BANDS },
    { key: "active", kind: "boolean" },
  ],
  sortFields: ["chargeType", "provider", "price", "margin", "effective"],
  defaultSort: { field: "chargeType", direction: "asc" },
  columns: [
    { id: "rateCard" },
    { id: "unit" },
    { id: "price" },
    { id: "providerCost" },
    { id: "margin" },
    { id: "effective" },
  ],
  groupings: ["chargeType", "provider", "unit"],
};

const RATE_CARD_ACCESSORS: ClientListAccessors<UsageRateCardDto> = {
  search: (card) => [
    card.chargeType,
    card.provider,
    card.model,
    card.unit,
    card.sourceLanguageCode,
    card.targetLanguageCode,
  ],
  filters: {
    chargeType: (card) => card.chargeType,
    provider: (card) => card.provider,
    unit: (card) => card.unit,
    currency: (card) => card.currency,
    margin: (card) => marginTone(resolveRateCardMargin(card)),
    active: (card) => card.isActive,
  },
  sort: {
    chargeType: (card) => card.chargeType,
    provider: (card) => card.provider,
    price: (card) => card.unitPrice,
    // The same number the Margin column shows; a card with no sound margin sorts last either way.
    margin: (card) => resolveRateCardMargin(card).value,
    effective: (card) => new Date(card.effectiveFrom),
  },
};

function RateCardMargin({ card }: { card: UsageRateCardDto }) {
  const t = useTranslations("adminPlansSettings.plans.rateCardRow");
  const margin = resolveRateCardMargin(card);
  const tone = marginTone(margin);
  // The column this page exists for. It is the STORED multiplier where there is one, and a named
  // refusal where price and cost are in different currencies — never price ÷ cost across VND and
  // USD, which produces a plausible number that is off by the exchange rate.
  return (
    <Tooltip
      content={
        margin.source === "derived"
          ? t("marginDerivedTooltip")
          : margin.source === "recorded"
            ? t("marginRecordedTooltip")
            : null
      }
    >
      <span
        className={cn(
          "tabular-nums",
          tone === "loss" && "font-semibold text-destructive",
          tone === "thin" && "font-semibold text-amber-600 dark:text-amber-400",
          tone === "healthy" && "font-semibold text-emerald-600 dark:text-emerald-400",
          tone === "unknown" && "text-[11px] italic text-ink-subtle",
        )}
      >
        {marginLabel(margin)}
      </span>
    </Tooltip>
  );
}

function RateCardsList({
  cards,
  isPending,
  isError,
  isFetching,
  onRetry,
  onEdit,
  onDeactivate,
}: {
  cards: readonly UsageRateCardDto[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onEdit: (card: UsageRateCardDto) => void;
  onDeactivate: (card: UsageRateCardDto) => void;
}) {
  const t = useTranslations("adminPlansSettings.plans");
  const list = useAdminListState(RATE_CARD_LIST_CONFIG);
  const { state } = list;

  const rows = useMemo(
    () => applyClientListState(cards, state, RATE_CARD_ACCESSORS, matchesSearch),
    [cards, state],
  );

  const filterFields: AdminFilterField[] = [
    {
      key: "chargeType",
      label: t("list.rateCards.filters.chargeType"),
      icon: <Gauge size={13} />,
      kind: "enum",
      multiple: true,
      options: distinctOptions(cards, (card) => card.chargeType),
    },
    {
      key: "provider",
      label: t("list.rateCards.filters.provider"),
      icon: <Cpu size={13} />,
      kind: "enum",
      multiple: true,
      options: distinctOptions(cards, (card) => card.provider),
    },
    {
      key: "unit",
      label: t("list.rateCards.filters.unit"),
      icon: <Ruler size={13} />,
      kind: "enum",
      multiple: true,
      options: distinctOptions(cards, (card) => card.unit),
    },
    {
      key: "currency",
      label: t("list.rateCards.filters.currency"),
      icon: <CurrencyCircleDollar size={13} />,
      kind: "enum",
      multiple: true,
      options: distinctOptions(cards, (card) => card.currency),
    },
    {
      key: "margin",
      label: t("list.rateCards.filters.margin"),
      icon: <Coins size={13} />,
      kind: "enum",
      multiple: true,
      options: MARGIN_BANDS.map((band) => ({ value: band, label: t(`list.rateCards.marginBands.${band}`) })),
    },
    {
      key: "active",
      label: t("list.rateCards.filters.active"),
      icon: <ToggleRight size={13} />,
      kind: "boolean",
      trueLabel: t("list.rateCards.inForce"),
      falseLabel: t("list.rateCards.deactivated"),
    },
  ];

  const columns: AdminColumn<UsageRateCardDto>[] = [
    {
      id: "rateCard",
      header: t("list.rateCards.columns.rateCard"),
      primary: true,
      sortField: "chargeType",
      cell: (card) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{card.chargeType}</p>
          <p className="truncate text-[11px] font-normal text-ink-subtle">
            {card.provider}
            {card.model ? ` · ${card.model}` : ""}
            {card.sourceLanguageCode || card.targetLanguageCode
              ? ` · ${card.sourceLanguageCode ?? "*"}→${card.targetLanguageCode ?? "*"}`
              : ""}
          </p>
        </div>
      ),
    },
    {
      id: "unit",
      header: t("list.rateCards.columns.unit"),
      className: "w-[90px]",
      cell: (card) => <span className="text-[12px] text-ink-muted">{card.unit}</span>,
    },
    {
      id: "price",
      header: t("list.rateCards.columns.price"),
      align: "right",
      className: "w-[130px]",
      sortField: "price",
      defaultDirection: "desc",
      cell: (card) => formatAdminMoney({ amount: card.unitPrice, currency: card.currency }),
    },
    {
      id: "providerCost",
      header: t("list.rateCards.columns.providerCost"),
      align: "right",
      className: "w-[130px]",
      cell: (card) => (
        <span className="text-ink-muted">
          {card.providerUnitCostUsd == null
            ? "—"
            : formatAdminMoney({ amount: card.providerUnitCostUsd, currency: "USD" })}
        </span>
      ),
    },
    {
      id: "margin",
      header: t("list.rateCards.columns.margin"),
      align: "right",
      className: "w-[130px]",
      sortField: "margin",
      cell: (card) => <RateCardMargin card={card} />,
    },
    {
      id: "effective",
      header: t("list.rateCards.columns.effective"),
      align: "right",
      className: "w-[140px]",
      sortField: "effective",
      defaultDirection: "desc",
      cell: (card) => (
        <span className="text-[12px] text-ink-muted">{t("rateCardRow.from", { date: formatDate(card.effectiveFrom) })}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      className: "w-[200px]",
      cell: (card) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onEdit(card)}>
            <PencilSimple size={13} />
            {t("rateCardRow.edit")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDeactivate(card)}>
            <Prohibit size={13} />
            {t("rateCardRow.deactivate")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <AdminListToolbar
        list={list}
        searchPlaceholder={t("list.rateCards.searchPlaceholder")}
        filters={filterFields}
        count={isPending ? null : rows.length}
        countLabel={
          list.narrowed
            ? t("list.visibleOfTotal", { visible: rows.length, total: cards.length })
            : t("rateCardCount", { count: cards.length })
        }
        isFetching={isFetching && !isPending}
        display={{
          sortOptions: [
            { field: "chargeType", label: t("list.rateCards.sortFields.chargeType") },
            { field: "provider", label: t("list.rateCards.sortFields.provider") },
            { field: "price", label: t("list.rateCards.sortFields.price") },
            { field: "margin", label: t("list.rateCards.sortFields.margin") },
            { field: "effective", label: t("list.rateCards.sortFields.effective") },
          ],
          groupOptions: [
            { key: "chargeType", label: t("list.rateCards.filters.chargeType") },
            { key: "provider", label: t("list.rateCards.filters.provider") },
            { key: "unit", label: t("list.rateCards.filters.unit") },
          ],
          columns: columns
            .filter((column) => !column.primary && column.id !== "actions")
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />
      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={rows}
          rowKey={(card) => card.id}
          isPending={isPending}
          isError={isError}
          onRetry={onRetry}
          empty={{ title: t("rateCardsEmpty"), icon: <Tag size={20} weight="duotone" /> }}
          groupings={{
            chargeType: { keyOf: (card) => card.chargeType, label: (key) => key },
            provider: { keyOf: (card) => card.provider, label: (key) => key },
            unit: { keyOf: (card) => card.unit, label: (key) => key },
          }}
          caption={t("tabs.rateCards")}
          minWidth={980}
        />
      </AdminPanel>
    </>
  );
}

// ── Configuration ────────────────────────────────────────────────────────────

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
  const t = useTranslations("adminPlansSettings.plans");
  if (isError) {
    return (
      <div className="flex items-start gap-3 px-4 py-10 text-sm">
        <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">{errorText}</p>
          <p className="mt-1 text-ink-muted">{t("errorHint")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            {t("tryAgain")}
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


function PlansAndPricing() {
  const t = useTranslations("adminPlansSettings.plans");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const TAB_LABEL_KEYS: Record<Tab, string> = {
    plans: "tabs.plans",
    "rate-cards": "tabs.rateCards",
    configuration: "tabs.configuration",
  };
  const TABS = TAB_VALUES.map((value) => ({ value, label: t(TAB_LABEL_KEYS[value]) }));

  // The tab is in the URL (`?tab=rate-cards`), so a link lands on it. Plans is the default and is
  // never written, which keeps the palette's `/admin/plans?q=<slug>` on the Plans tab.
  const tabParam = searchParams.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "plans";
  /** A new tab starts clean: the other tab's search, filters and order mean nothing here. */
  const setTab = (next: Tab) => {
    router.replace(next === "plans" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  };

  const plansQuery = useAdminPlans();
  const rateCardsQuery = useAdminRateCards();
  const configQuery = useAdminPricingConfig();

  const updatePlan = useUpdateAdminPlan();
  const createPlan = useCreateAdminPlan();
  const upsertRateCard = useUpsertAdminRateCard();
  const deactivateRateCard = useDeactivateAdminRateCard();
  const setRateCardProviderCost = useSetAdminRateCardProviderCost();
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
  const [retiringCard, setRetiringCard] = useState<UsageRateCardDto | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  // The palette's "Create plan" action.
  useAdminActionIntent({ "create-plan": () => setIsCreatingPlan(true) });

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const rateCards = useMemo(() => rateCardsQuery.data ?? [], [rateCardsQuery.data]);
  const config = configQuery.data ?? null;

  const active =
    tab === "plans" ? plansQuery : tab === "rate-cards" ? rateCardsQuery : configQuery;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Tag size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {tab === "plans" ? (
              <Button size="sm" onClick={() => setIsCreatingPlan(true)}>
                <Plus size={14} />
                {t("newPlan")}
              </Button>
            ) : null}
            {tab === "configuration" ? (
              <Button size="sm" onClick={() => setIsConfigOpen(true)} disabled={config === null}>
                <PencilSimple size={14} />
                {t("editConfiguration")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void active.refetch()}
              disabled={active.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(active.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
          </>
        }
      />

      <AdminFilterTabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        label={t("filterLabel")}
        trailing={
          tab === "configuration"
            ? configQuery.isPending
              ? t("loading")
              : t("platformWide")
            : undefined
        }
      />

      {tab === "rate-cards" ? (
        <p className="mt-4 text-[12px] text-ink-muted">{t("rateCardsNote")}</p>
      ) : null}

      {tab === "plans" ? (
        <PlansList
          plans={plans}
          isPending={plansQuery.isPending}
          isError={plansQuery.isError}
          isFetching={plansQuery.isFetching}
          onRetry={() => void plansQuery.refetch()}
          onEdit={setEditingPlan}
        />
      ) : tab === "rate-cards" ? (
        <RateCardsList
          cards={rateCards}
          isPending={rateCardsQuery.isPending}
          isError={rateCardsQuery.isError}
          isFetching={rateCardsQuery.isFetching}
          onRetry={() => void rateCardsQuery.refetch()}
          onEdit={setEditingCard}
          onDeactivate={setRetiringCard}
        />
      ) : (
        <AdminPanel className="mt-3">
          <PanelState
            isError={configQuery.isError}
            isPending={configQuery.isPending}
            isEmpty={config === null}
            errorText={t("configError")}
            emptyText={t("configEmpty")}
            onRetry={() => void configQuery.refetch()}
          >
            {config ? (
              <div>
                <ConfigRow
                  label={t("configRows.fxRate")}
                  value={numberFormatter.format(config.fxRateUsdVnd)}
                />
                <ConfigRow
                  label={t("configRows.minimumContractPrice")}
                  value={`${formatAdminMoney({ amount: config.minimumContractPriceVnd, currency: "VND" })} · ${formatAdminMoney({ amount: config.minimumContractPriceUsd, currency: "USD" })}`}
                />
                <ConfigRow label={t("configRows.salesWeightUsage")} value={config.salesUsageWeight} />
                <ConfigRow
                  label={t("configRows.salesWeightMembers")}
                  value={config.salesMembersWeight}
                />
                <ConfigRow
                  label={t("configRows.salesWeightLanguages")}
                  value={config.salesLanguagesWeight}
                />
                <ConfigRow
                  label={t("configRows.salesWeightAiServices")}
                  value={config.salesAiServicesWeight}
                />
                <ConfigRow
                  label={t("configRows.defaultOverageCapRatio")}
                  value={config.defaultOverageCapRatio}
                />
                <ConfigRow
                  label={t("configRows.defaultInvoiceTerms")}
                  value={t("configRows.defaultInvoiceTermsValue", { days: config.defaultInvoiceTermsDays })}
                />
                <ConfigRow
                  label={t("configRows.defaultInvoiceGrace")}
                  value={t("configRows.defaultInvoiceGraceValue", { hours: config.defaultInvoiceGraceHours })}
                />
                {/* The two the write endpoint does not take. Shown so their absence from the
                    editor reads as a property of the field, not as a gap in the form. */}
                <ConfigRow
                  label={t("configRows.formula")}
                  value={<span className="font-mono text-[11px]">{config.formula}</span>}
                />
                <ConfigRow
                  label={t("configRows.resolverKey")}
                  value={<span className="font-mono text-[11px]">{config.resolverKey}</span>}
                />
              </div>
            ) : null}
          </PanelState>
        </AdminPanel>
      )}

      <p className="mt-4 text-[12px] text-ink-muted">{t("footerNote")}</p>

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
        onSetProviderCost={(id, providerUnitCostUsd) =>
          setRateCardProviderCost.mutateAsync({ id, request: { providerUnitCostUsd } })
        }
        isSaving={upsertRateCard.isPending || setRateCardProviderCost.isPending}
      />

      <RateCardDeactivateDialog
        card={retiringCard}
        onOpenChange={(open) => {
          if (!open) setRetiringCard(null);
        }}
        onConfirm={async (card) => {
          await deactivateRateCard.mutateAsync(card.id);
          toast.success(t("deactivateToast", { chargeType: card.chargeType }));
        }}
        isSaving={deactivateRateCard.isPending}
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

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <PlansAndPricing />
    </Suspense>
  );
}
