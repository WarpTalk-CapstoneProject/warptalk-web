"use client";

/**
 * G11 — /admin/packages: everything sold besides a base plan.
 *
 *   Credit packs  one-off bundles of credits (+ bonus), per-currency prices, visibility, limits,
 *                 an active window and an optional validity.
 *   Add-ons       recurring extras on a plan; each unit raises ONE entitlement the product
 *                 enforces (participants, languages, active rooms, voice clone, AI, glossary).
 *   Coupons       percent / fixed discounts on plans, packs and add-ons, by code or as an
 *                 auto-apply campaign. One coupon per checkout.
 *
 * Each item maps to Stripe (Product + Prices, or Coupon + Promotion code), pushed from here and
 * compared against Stripe on demand. Stripe prices are immutable: a price edit creates a new
 * Price at the next sync and archives the old one. Nothing is deleted anywhere — an item is
 * archived, and unarchiving brings it back as a draft.
 *
 * The catalog is small and fetched whole, so each tab filters it in the browser with the shared
 * list toolkit. Sales figures come from the purchase / add-on / redemption rows the payment path
 * writes with each paid checkout.
 */

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowsClockwise,
  CloudArrowUp,
  Copy,
  CurrencyCircleDollar,
  DotsThree,
  Eye,
  Package,
  PencilSimple,
  Plus,
  Stack,
  Tag,
  Ticket,
  ToggleRight,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

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
} from "@/components/admin/list";
import {
  AddonEditorDialog,
  ArchiveDialog,
  CouponEditorDialog,
  CreditPackEditorDialog,
  StripePanelDialog,
  StripeSyncBadge,
  formatRevenue,
  type CouponTargetOption,
} from "@/components/admin/packages/package-editors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminPlans } from "@/hooks/use-admin-pricing";
import { useAdminPackageMutations, useAdminPackageOptions, useAdminPackages } from "@/hooks/use-admin-packages";
import { useCan } from "@/hooks/use-staff-access";
import { ADMIN_PERMISSIONS } from "@/lib/admin/staff-permissions";
import { applyClientListState, type ClientListAccessors, type ListStateConfig } from "@/lib/admin/list-state";
import { matchesSearch } from "@/lib/admin/search-text";
import { getErrorMessage } from "@/lib/api/errors";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import { describeDiscount, isNumericEntitlement } from "@/lib/billing/package-request";
import { cn } from "@/lib/utils";
import type { PackageKind } from "@/services/admin-packages.service";
import type { AddonDto, CouponDto, CreditPackDto, PackageStatus, StripeSyncStatusDto } from "@/types/admin-packages";

const TAB_VALUES = ["credit-packs", "addons", "coupons"] as const;
type Tab = (typeof TAB_VALUES)[number];

function isTab(value: string | null): value is Tab {
  return (TAB_VALUES as readonly string[]).includes(value ?? "");
}

const STATUSES = ["draft", "active", "archived"] as const;
const SYNC_STATES = ["not_synced", "synced", "outdated", "error"] as const;
const CURRENCIES = ["vnd", "usd"] as const;
const numberFormatter = new Intl.NumberFormat("en-US");

/** Revenue in several currencies does not order meaningfully; units sold does. */
function totalUnits(row: { unitsSold: number }) {
  return row.unitsSold;
}

function StatusPill({ status }: { status: PackageStatus }) {
  const t = useTranslations("adminPackages.statuses");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        status === "active" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        status === "draft" && "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        status === "archived" && "border-border bg-surface-2 text-ink-muted",
      )}
    >
      {t(status)}
    </span>
  );
}

interface RowMenuProps {
  name: string;
  archived: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onStripe: () => void;
}

function RowMenu({ name, archived, canManage, onEdit, onDuplicate, onArchive, onStripe }: RowMenuProps) {
  const t = useTranslations("adminPackages.menu");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("open", { name })}
        className="inline-grid size-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <DotsThree size={16} weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onClick={onEdit}>
          {canManage && !archived ? <PencilSimple size={14} /> : <Eye size={14} />}
          {canManage && !archived ? t("edit") : t("view")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStripe}>
          <CloudArrowUp size={14} />
          {t("stripe")}
        </DropdownMenuItem>
        {canManage ? (
          <>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy size={14} />
              {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant={archived ? "default" : "destructive"} onClick={onArchive}>
              {archived ? <ArrowCounterClockwise size={14} /> : <Archive size={14} />}
              {archived ? t("unarchive") : t("archive")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ListProps<T> {
  rows: readonly T[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  canManage: boolean;
  onEdit: (row: T) => void;
  onDuplicate: (row: T) => void;
  onArchive: (row: T) => void;
  onStripe: (row: T) => void;
}

function useCommonFilters() {
  const t = useTranslations("adminPackages");
  const status: AdminFilterField = {
    key: "status",
    label: t("filters.status"),
    icon: <ToggleRight size={13} />,
    kind: "enum",
    multiple: true,
    options: STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) })),
  };
  const sync: AdminFilterField = {
    key: "sync",
    label: t("filters.sync"),
    icon: <CloudArrowUp size={13} />,
    kind: "enum",
    multiple: true,
    options: SYNC_STATES.map((value) => ({ value, label: t(`stripe.states.${value}`) })),
  };
  const currency: AdminFilterField = {
    key: "currency",
    label: t("filters.currency"),
    icon: <CurrencyCircleDollar size={13} />,
    kind: "enum",
    multiple: true,
    options: CURRENCIES.map((value) => ({ value, label: value.toUpperCase() })),
  };
  return { status, sync, currency };
}

// ── Credit packs ─────────────────────────────────────────────────────────────

const PACK_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", multiple: true, values: STATUSES },
    { key: "currency", kind: "enum", multiple: true, values: CURRENCIES },
    { key: "visibility", kind: "enum", multiple: true, values: ["public", "plans", "workspaces"] },
    { key: "sync", kind: "enum", multiple: true, values: SYNC_STATES },
  ],
  sortFields: ["order", "name", "credits", "priceVnd", "sold"],
  defaultSort: { field: "order", direction: "asc" },
  columns: [{ id: "pack" }, { id: "credits" }, { id: "price" }, { id: "visibility" }, { id: "sold" }, { id: "revenue" }, { id: "stripe" }, { id: "status" }],
  groupings: ["status", "visibility"],
};

const PACK_ACCESSORS: ClientListAccessors<CreditPackDto> = {
  search: (pack) => [pack.name, pack.slug, pack.description],
  filters: {
    status: (pack) => pack.status,
    currency: (pack) => [pack.priceVnd !== null ? "vnd" : null, pack.priceUsd !== null ? "usd" : null].filter((c): c is string => c !== null),
    visibility: (pack) => pack.visibility,
    sync: (pack) => pack.stripe.state,
  },
  sort: {
    order: (pack) => pack.sortOrder,
    name: (pack) => pack.name,
    credits: (pack) => pack.credits + pack.bonusCredits,
    priceVnd: (pack) => pack.priceVnd,
    sold: totalUnits,
  },
};

function CreditPacksList(props: ListProps<CreditPackDto>) {
  const t = useTranslations("adminPackages");
  const list = useAdminListState(PACK_CONFIG);
  const filters = useCommonFilters();
  const rows = useMemo(() => applyClientListState(props.rows, list.state, PACK_ACCESSORS, matchesSearch), [props.rows, list.state]);

  const filterFields: AdminFilterField[] = [
    filters.status,
    filters.currency,
    {
      key: "visibility",
      label: t("filters.visibility"),
      icon: <Eye size={13} />,
      kind: "enum",
      multiple: true,
      options: (["public", "plans", "workspaces"] as const).map((value) => ({ value, label: t(`editor.visibility.${value}`) })),
    },
    filters.sync,
  ];

  const columns: AdminColumn<CreditPackDto>[] = [
    {
      id: "pack",
      header: t("columns.pack"),
      primary: true,
      sortField: "name",
      cell: (pack) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{pack.name}</p>
          <p className="truncate font-mono text-[11px] text-ink-subtle">{pack.slug}</p>
        </div>
      ),
    },
    {
      id: "credits",
      header: t("columns.credits"),
      align: "right",
      className: "w-[140px]",
      sortField: "credits",
      defaultDirection: "desc",
      cell: (pack) => (
        <span className="tabular-nums">
          {numberFormatter.format(pack.credits)}
          {pack.bonusCredits > 0 ? <span className="ml-1 text-[11px] text-emerald-600">+{numberFormatter.format(pack.bonusCredits)}</span> : null}
        </span>
      ),
    },
    {
      id: "price",
      header: t("columns.price"),
      align: "right",
      className: "w-[170px]",
      sortField: "priceVnd",
      cell: (pack) => (
        <div className="text-right text-[12px] tabular-nums">
          {pack.priceVnd !== null ? <p>{formatAdminMoney({ amount: pack.priceVnd, currency: "VND" })}</p> : null}
          {pack.priceUsd !== null ? <p className="text-ink-muted">{formatAdminMoney({ amount: pack.priceUsd, currency: "USD" })}</p> : null}
        </div>
      ),
    },
    {
      id: "visibility",
      header: t("columns.visibility"),
      className: "w-[130px]",
      cell: (pack) => (
        <span className="text-[12px] text-ink-muted">
          {t(`editor.visibility.${pack.visibility}`)}
          {pack.visibility === "plans" ? ` (${pack.eligiblePlanIds.length})` : pack.visibility === "workspaces" ? ` (${pack.eligibleWorkspaceIds.length})` : ""}
        </span>
      ),
    },
    {
      id: "sold",
      header: t("columns.sold"),
      align: "right",
      className: "w-[90px]",
      sortField: "sold",
      defaultDirection: "desc",
      cell: (pack) => <span className="tabular-nums">{numberFormatter.format(pack.unitsSold)}{pack.maxTotal ? <span className="text-ink-subtle"> / {numberFormatter.format(pack.maxTotal)}</span> : null}</span>,
    },
    { id: "revenue", header: t("columns.revenue"), align: "right", className: "w-[170px]", cell: (pack) => <span className="text-[12px] tabular-nums">{formatRevenue(pack.revenue)}</span> },
    { id: "stripe", header: t("columns.stripe"), className: "w-[110px]", cell: (pack) => <StripeSyncBadge status={pack.stripe} /> },
    { id: "status", header: t("columns.status"), className: "w-[100px]", cell: (pack) => <StatusPill status={pack.status} /> },
    {
      id: "actions",
      header: "",
      align: "right",
      className: "w-[56px]",
      cell: (pack) => (
        <RowMenu
          name={pack.name}
          archived={pack.status === "archived"}
          canManage={props.canManage}
          onEdit={() => props.onEdit(pack)}
          onDuplicate={() => props.onDuplicate(pack)}
          onArchive={() => props.onArchive(pack)}
          onStripe={() => props.onStripe(pack)}
        />
      ),
    },
  ];

  return (
    <ListFrame
      list={list}
      rows={rows}
      all={props.rows}
      filters={filterFields}
      columns={columns}
      props={props}
      sortOptions={[
        { field: "order", label: t("sort.order") },
        { field: "name", label: t("sort.name") },
        { field: "credits", label: t("sort.credits") },
        { field: "priceVnd", label: t("sort.priceVnd") },
        { field: "sold", label: t("sort.sold") },
      ]}
      groupings={{
        status: { keyOf: (pack) => pack.status, label: (key) => t(`statuses.${key as PackageStatus}`) },
        visibility: { keyOf: (pack) => pack.visibility, label: (key) => t(`editor.visibility.${key as "public"}`) },
      }}
      groupOptions={[
        { key: "status", label: t("filters.status") },
        { key: "visibility", label: t("filters.visibility") },
      ]}
      empty={t("empty.packs")}
      icon={<Package size={20} weight="duotone" />}
      caption={t("tabs.creditPacks")}
    />
  );
}

// ── Add-ons ──────────────────────────────────────────────────────────────────

const ADDON_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", multiple: true, values: STATUSES },
    { key: "entitlement", kind: "enum", multiple: true },
    { key: "currency", kind: "enum", multiple: true, values: CURRENCIES },
    { key: "sync", kind: "enum", multiple: true, values: SYNC_STATES },
  ],
  sortFields: ["order", "name", "subscribers", "sold"],
  defaultSort: { field: "order", direction: "asc" },
  columns: [{ id: "addon" }, { id: "grant" }, { id: "price" }, { id: "subscribers" }, { id: "revenue" }, { id: "stripe" }, { id: "status" }],
  groupings: ["status", "entitlement"],
};

const ADDON_ACCESSORS: ClientListAccessors<AddonDto> = {
  search: (addon) => [addon.name, addon.slug, addon.unitLabel, addon.entitlementKey],
  filters: {
    status: (addon) => addon.status,
    entitlement: (addon) => addon.entitlementKey,
    currency: (addon) =>
      [addon.priceMonthlyVnd ?? addon.priceYearlyVnd, addon.priceMonthlyUsd ?? addon.priceYearlyUsd]
        .map((price, index) => (price !== null ? CURRENCIES[index] : null))
        .filter((c): c is "vnd" | "usd" => c !== null),
    sync: (addon) => addon.stripe.state,
  },
  sort: {
    order: (addon) => addon.sortOrder,
    name: (addon) => addon.name,
    subscribers: (addon) => addon.activeSubscribers,
    sold: totalUnits,
  },
};

function AddonsList(props: ListProps<AddonDto>) {
  const t = useTranslations("adminPackages");
  const tc = useTranslations("settingsBillingCatalog.cards");
  const list = useAdminListState(ADDON_CONFIG);
  const filters = useCommonFilters();
  const rows = useMemo(() => applyClientListState(props.rows, list.state, ADDON_ACCESSORS, matchesSearch), [props.rows, list.state]);
  const entitlementLabel = (key: string) => tc(`entitlements.${key}` as "entitlements.max_participants");

  const filterFields: AdminFilterField[] = [
    filters.status,
    {
      key: "entitlement",
      label: t("filters.entitlement"),
      icon: <Stack size={13} />,
      kind: "enum",
      multiple: true,
      options: Array.from(new Set(props.rows.map((row) => row.entitlementKey))).map((value) => ({ value, label: entitlementLabel(value), hint: value })),
    },
    filters.currency,
    filters.sync,
  ];

  const columns: AdminColumn<AddonDto>[] = [
    {
      id: "addon",
      header: t("columns.addon"),
      primary: true,
      sortField: "name",
      cell: (addon) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{addon.name}</p>
          <p className="truncate font-mono text-[11px] text-ink-subtle">{addon.slug}</p>
        </div>
      ),
    },
    {
      id: "grant",
      header: t("columns.grant"),
      className: "w-[200px]",
      cell: (addon) => (
        <div className="min-w-0 text-[12px]">
          <p className="truncate text-ink">{entitlementLabel(addon.entitlementKey)}</p>
          <p className="truncate text-ink-subtle">
            {isNumericEntitlement(addon.entitlementKey)
              ? t("grantDetail", { units: addon.unitsPerQuantity, unit: addon.unitLabel, min: addon.minQuantity, max: addon.maxQuantity })
              : t("grantSwitch")}
          </p>
        </div>
      ),
    },
    {
      id: "price",
      header: t("columns.priceMonthYear"),
      align: "right",
      className: "w-[190px]",
      cell: (addon) => (
        <div className="text-right text-[12px] tabular-nums">
          {addon.priceMonthlyVnd !== null || addon.priceYearlyVnd !== null ? (
            <p>
              {addon.priceMonthlyVnd !== null ? formatAdminMoney({ amount: addon.priceMonthlyVnd, currency: "VND" }) : "—"} /{" "}
              {addon.priceYearlyVnd !== null ? formatAdminMoney({ amount: addon.priceYearlyVnd, currency: "VND" }) : "—"}
            </p>
          ) : null}
          {addon.priceMonthlyUsd !== null || addon.priceYearlyUsd !== null ? (
            <p className="text-ink-muted">
              {addon.priceMonthlyUsd !== null ? formatAdminMoney({ amount: addon.priceMonthlyUsd, currency: "USD" }) : "—"} /{" "}
              {addon.priceYearlyUsd !== null ? formatAdminMoney({ amount: addon.priceYearlyUsd, currency: "USD" }) : "—"}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "subscribers",
      header: t("columns.subscribers"),
      align: "right",
      className: "w-[130px]",
      sortField: "subscribers",
      defaultDirection: "desc",
      cell: (addon) => (
        <span className="tabular-nums">
          {numberFormatter.format(addon.activeSubscribers)}
          {isNumericEntitlement(addon.entitlementKey) ? <span className="text-ink-subtle"> · {t("units", { count: addon.activeQuantity })}</span> : null}
        </span>
      ),
    },
    { id: "revenue", header: t("columns.revenue"), align: "right", className: "w-[170px]", cell: (addon) => <span className="text-[12px] tabular-nums">{formatRevenue(addon.revenue)}</span> },
    { id: "stripe", header: t("columns.stripe"), className: "w-[110px]", cell: (addon) => <StripeSyncBadge status={addon.stripe} /> },
    { id: "status", header: t("columns.status"), className: "w-[100px]", cell: (addon) => <StatusPill status={addon.status} /> },
    {
      id: "actions",
      header: "",
      align: "right",
      className: "w-[56px]",
      cell: (addon) => (
        <RowMenu
          name={addon.name}
          archived={addon.status === "archived"}
          canManage={props.canManage}
          onEdit={() => props.onEdit(addon)}
          onDuplicate={() => props.onDuplicate(addon)}
          onArchive={() => props.onArchive(addon)}
          onStripe={() => props.onStripe(addon)}
        />
      ),
    },
  ];

  return (
    <ListFrame
      list={list}
      rows={rows}
      all={props.rows}
      filters={filterFields}
      columns={columns}
      props={props}
      sortOptions={[
        { field: "order", label: t("sort.order") },
        { field: "name", label: t("sort.name") },
        { field: "subscribers", label: t("sort.subscribers") },
        { field: "sold", label: t("sort.sold") },
      ]}
      groupings={{
        status: { keyOf: (addon) => addon.status, label: (key) => t(`statuses.${key as PackageStatus}`) },
        entitlement: { keyOf: (addon) => addon.entitlementKey, label: entitlementLabel },
      }}
      groupOptions={[
        { key: "status", label: t("filters.status") },
        { key: "entitlement", label: t("filters.entitlement") },
      ]}
      empty={t("empty.addons")}
      icon={<Stack size={20} weight="duotone" />}
      caption={t("tabs.addons")}
    />
  );
}

// ── Coupons ──────────────────────────────────────────────────────────────────

const COUPON_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", multiple: true, values: STATUSES },
    { key: "type", kind: "enum", multiple: true, values: ["percent", "fixed"] },
    { key: "appliesTo", kind: "enum", multiple: true, values: ["plan", "credit_pack", "addon"] },
    { key: "autoApply", kind: "boolean" },
    { key: "sync", kind: "enum", multiple: true, values: SYNC_STATES },
  ],
  sortFields: ["created", "name", "redemptions", "validUntil"],
  defaultSort: { field: "created", direction: "desc" },
  columns: [{ id: "coupon" }, { id: "discount" }, { id: "appliesTo" }, { id: "redemptions" }, { id: "given" }, { id: "validity" }, { id: "stripe" }, { id: "status" }],
  groupings: ["status", "type"],
};

const COUPON_ACCESSORS: ClientListAccessors<CouponDto> = {
  search: (coupon) => [coupon.code, coupon.name],
  filters: {
    status: (coupon) => coupon.status,
    type: (coupon) => coupon.discountType,
    appliesTo: (coupon) => coupon.appliesToTypes,
    autoApply: (coupon) => coupon.autoApply,
    sync: (coupon) => coupon.stripe.state,
  },
  sort: {
    created: (coupon) => new Date(coupon.createdAt),
    name: (coupon) => coupon.code ?? coupon.name,
    redemptions: (coupon) => coupon.redemptions,
    validUntil: (coupon) => (coupon.validUntil ? new Date(coupon.validUntil) : null),
  },
};

function CouponsList(props: ListProps<CouponDto>) {
  const t = useTranslations("adminPackages");
  const te = useTranslations("adminPackages.editor");
  const list = useAdminListState(COUPON_CONFIG);
  const filters = useCommonFilters();
  const rows = useMemo(() => applyClientListState(props.rows, list.state, COUPON_ACCESSORS, matchesSearch), [props.rows, list.state]);

  const filterFields: AdminFilterField[] = [
    filters.status,
    {
      key: "type",
      label: t("filters.discountType"),
      icon: <Tag size={13} />,
      kind: "enum",
      multiple: true,
      options: (["percent", "fixed"] as const).map((value) => ({ value, label: te(`discountTypes.${value}`) })),
    },
    {
      key: "appliesTo",
      label: t("filters.appliesTo"),
      icon: <Stack size={13} />,
      kind: "enum",
      multiple: true,
      options: (["plan", "credit_pack", "addon"] as const).map((value) => ({ value, label: te(`itemTypes.${value}`) })),
    },
    {
      key: "autoApply",
      label: t("filters.autoApply"),
      icon: <ToggleRight size={13} />,
      kind: "boolean",
      trueLabel: t("autoApply"),
      falseLabel: t("byCode"),
    },
    filters.sync,
  ];

  const columns: AdminColumn<CouponDto>[] = [
    {
      id: "coupon",
      header: t("columns.coupon"),
      primary: true,
      sortField: "name",
      cell: (coupon) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-[13px] font-medium text-ink">{coupon.code ?? t("autoApply")}</p>
          <p className="truncate text-[11px] text-ink-subtle">{coupon.name}</p>
        </div>
      ),
    },
    {
      id: "discount",
      header: t("columns.discount"),
      className: "w-[150px]",
      cell: (coupon) => (
        <div className="text-[12px]">
          <p className="font-medium text-ink">{describeDiscount(coupon)}</p>
          <p className="text-ink-subtle">
            {coupon.duration === "repeating" ? te("durationMonths", { months: coupon.durationInMonths ?? 0 }) : te(`durations.${coupon.duration}`)}
          </p>
        </div>
      ),
    },
    {
      id: "appliesTo",
      header: t("columns.appliesTo"),
      className: "w-[170px]",
      cell: (coupon) => (
        <span className="text-[12px] text-ink-muted">
          {coupon.appliesToTypes.map((type) => te(`itemTypes.${type}`)).join(", ")}
          {coupon.appliesToIds.length > 0 ? ` (${coupon.appliesToIds.length})` : ""}
        </span>
      ),
    },
    {
      id: "redemptions",
      header: t("columns.redemptions"),
      align: "right",
      className: "w-[110px]",
      sortField: "redemptions",
      defaultDirection: "desc",
      cell: (coupon) => (
        <span className="tabular-nums">
          {numberFormatter.format(coupon.redemptions)}
          {coupon.maxRedemptions ? <span className="text-ink-subtle"> / {numberFormatter.format(coupon.maxRedemptions)}</span> : null}
        </span>
      ),
    },
    { id: "given", header: t("columns.discountGiven"), align: "right", className: "w-[160px]", cell: (coupon) => <span className="text-[12px] tabular-nums">{formatRevenue(coupon.discountGiven)}</span> },
    {
      id: "validity",
      header: t("columns.validity"),
      className: "w-[150px]",
      sortField: "validUntil",
      cell: (coupon) => (
        <span className="text-[12px] text-ink-muted">
          {coupon.validUntil ? t("until", { date: new Date(coupon.validUntil).toLocaleDateString() }) : t("noEnd")}
        </span>
      ),
    },
    { id: "stripe", header: t("columns.stripe"), className: "w-[110px]", cell: (coupon) => <StripeSyncBadge status={coupon.stripe} /> },
    { id: "status", header: t("columns.status"), className: "w-[100px]", cell: (coupon) => <StatusPill status={coupon.status} /> },
    {
      id: "actions",
      header: "",
      align: "right",
      className: "w-[56px]",
      cell: (coupon) => (
        <RowMenu
          name={coupon.code ?? coupon.name}
          archived={coupon.status === "archived"}
          canManage={props.canManage}
          onEdit={() => props.onEdit(coupon)}
          onDuplicate={() => props.onDuplicate(coupon)}
          onArchive={() => props.onArchive(coupon)}
          onStripe={() => props.onStripe(coupon)}
        />
      ),
    },
  ];

  return (
    <ListFrame
      list={list}
      rows={rows}
      all={props.rows}
      filters={filterFields}
      columns={columns}
      props={props}
      sortOptions={[
        { field: "created", label: t("sort.created") },
        { field: "name", label: t("sort.code") },
        { field: "redemptions", label: t("sort.redemptions") },
        { field: "validUntil", label: t("sort.validUntil") },
      ]}
      groupings={{
        status: { keyOf: (coupon) => coupon.status, label: (key) => t(`statuses.${key as PackageStatus}`) },
        type: { keyOf: (coupon) => coupon.discountType, label: (key) => te(`discountTypes.${key as "percent"}`) },
      }}
      groupOptions={[
        { key: "status", label: t("filters.status") },
        { key: "type", label: t("filters.discountType") },
      ]}
      empty={t("empty.coupons")}
      icon={<Ticket size={20} weight="duotone" />}
      caption={t("tabs.coupons")}
    />
  );
}

// ── Shared list frame ────────────────────────────────────────────────────────

function ListFrame<T extends { id: string }>({
  list,
  rows,
  all,
  filters,
  columns,
  props,
  sortOptions,
  groupings,
  groupOptions,
  empty,
  icon,
  caption,
}: {
  list: ReturnType<typeof useAdminListState>;
  rows: readonly T[];
  all: readonly T[];
  filters: AdminFilterField[];
  columns: AdminColumn<T>[];
  props: ListProps<T>;
  sortOptions: { field: string; label: string }[];
  groupings: Record<string, { keyOf: (row: T) => string; label: (key: string) => string }>;
  groupOptions: { key: string; label: string }[];
  empty: string;
  icon: React.ReactNode;
  caption: string;
}) {
  const t = useTranslations("adminPackages");
  return (
    <>
      <AdminListToolbar
        list={list}
        searchPlaceholder={t("searchPlaceholder")}
        filters={filters}
        count={props.isPending ? null : rows.length}
        countLabel={list.narrowed ? t("visibleOfTotal", { visible: rows.length, total: all.length }) : t("count", { count: all.length })}
        isFetching={props.isFetching && !props.isPending}
        display={{
          sortOptions,
          groupOptions,
          columns: columns.filter((column) => !column.primary && column.id !== "actions").map((column) => ({ id: column.id, label: String(column.header) })),
        }}
      />
      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          isPending={props.isPending}
          isError={props.isError}
          onRetry={props.onRetry}
          empty={{ title: empty, icon }}
          groupings={groupings}
          caption={caption}
          minWidth={980}
        />
      </AdminPanel>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Editing =
  | { kind: "credit-packs"; row: CreditPackDto | null }
  | { kind: "addons"; row: AddonDto | null }
  | { kind: "coupons"; row: CouponDto | null };

type AnyRow = CreditPackDto | AddonDto | CouponDto;

function rowName(row: AnyRow): string {
  return "code" in row ? row.code ?? row.name : row.name;
}

function PackagesPage() {
  const t = useTranslations("adminPackages");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canManage = useCan(ADMIN_PERMISSIONS.billingPackagesManage);

  const tabParam = searchParams.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "credit-packs";
  const setTab = (next: Tab) => router.replace(next === "credit-packs" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  const packsQuery = useAdminPackages("credit-packs");
  const addonsQuery = useAdminPackages("addons");
  const couponsQuery = useAdminPackages("coupons");
  const optionsQuery = useAdminPackageOptions();
  const plansQuery = useAdminPlans();

  const packMutations = useAdminPackageMutations("credit-packs");
  const addonMutations = useAdminPackageMutations("addons");
  const couponMutations = useAdminPackageMutations("coupons");
  const mutationsFor = (kind: PackageKind) => (kind === "credit-packs" ? packMutations : kind === "addons" ? addonMutations : couponMutations);

  const [editing, setEditing] = useState<Editing | null>(null);
  const [archiving, setArchiving] = useState<{ kind: PackageKind; row: AnyRow } | null>(null);
  const [stripeTarget, setStripeTarget] = useState<{ kind: PackageKind; id: string } | null>(null);

  useAdminActionIntent({
    "create-credit-pack": () => {
      setTab("credit-packs");
      setEditing({ kind: "credit-packs", row: null });
    },
    "create-coupon": () => {
      setTab("coupons");
      setEditing({ kind: "coupons", row: null });
    },
  });

  const packs = useMemo(() => packsQuery.data ?? [], [packsQuery.data]);
  const addons = useMemo(() => addonsQuery.data ?? [], [addonsQuery.data]);
  const coupons = useMemo(() => couponsQuery.data ?? [], [couponsQuery.data]);
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const couponTargets = useMemo<CouponTargetOption[]>(
    () => [
      ...plans.map((plan) => ({ id: plan.id, type: "plan" as const, label: plan.name, hint: plan.slug })),
      ...packs.filter((pack) => pack.status !== "archived").map((pack) => ({ id: pack.id, type: "credit_pack" as const, label: pack.name, hint: pack.slug })),
      ...addons.filter((addon) => addon.status !== "archived").map((addon) => ({ id: addon.id, type: "addon" as const, label: addon.name, hint: addon.slug })),
    ],
    [plans, packs, addons],
  );

  const active = tab === "credit-packs" ? packsQuery : tab === "addons" ? addonsQuery : couponsQuery;

  const duplicate = async (kind: PackageKind, row: AnyRow) => {
    try {
      const copy = await mutationsFor(kind).duplicate.mutateAsync(row.id);
      toast.success(t("toasts.duplicated", { name: rowName(copy as AnyRow) }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.failed")));
    }
  };

  // The Stripe panel reads the LIVE row, so a sync's result shows without reopening it.
  const stripeRow: AnyRow | undefined = stripeTarget
    ? (stripeTarget.kind === "credit-packs" ? packs : stripeTarget.kind === "addons" ? addons : coupons).find((row) => row.id === stripeTarget.id)
    : undefined;
  const stripeStatus: StripeSyncStatusDto | undefined = stripeRow?.stripe;

  const handlers = <T extends AnyRow>(kind: PackageKind) => ({
    canManage,
    onEdit: (row: T) => setEditing({ kind, row } as Editing),
    onDuplicate: (row: T) => void duplicate(kind, row),
    onArchive: (row: T) => setArchiving({ kind, row }),
    onStripe: (row: T) => setStripeTarget({ kind, id: row.id }),
  });

  const tabs = [
    { value: "credit-packs" as const, label: t("tabs.creditPacks") },
    { value: "addons" as const, label: t("tabs.addons") },
    { value: "coupons" as const, label: t("tabs.coupons") },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Package size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {canManage ? (
              <Button size="sm" onClick={() => setEditing({ kind: tab, row: null } as Editing)}>
                <Plus size={14} />
                {tab === "credit-packs" ? t("newPack") : tab === "addons" ? t("newAddon") : t("newCoupon")}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void active.refetch()} disabled={active.isFetching}>
              <ArrowsClockwise size={14} className={cn(active.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
          </>
        }
      />

      <AdminFilterTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        label={t("tabsLabel")}
        trailing={optionsQuery.data && !optionsQuery.data.stripeConfigured ? <span className="text-amber-600">{t("stripe.notConfigured")}</span> : t("sandboxNote")}
      />

      {tab === "credit-packs" ? (
        <CreditPacksList
          rows={packs}
          isPending={packsQuery.isPending}
          isError={packsQuery.isError}
          isFetching={packsQuery.isFetching}
          onRetry={() => void packsQuery.refetch()}
          {...handlers<CreditPackDto>("credit-packs")}
        />
      ) : tab === "addons" ? (
        <AddonsList
          rows={addons}
          isPending={addonsQuery.isPending}
          isError={addonsQuery.isError}
          isFetching={addonsQuery.isFetching}
          onRetry={() => void addonsQuery.refetch()}
          {...handlers<AddonDto>("addons")}
        />
      ) : (
        <CouponsList
          rows={coupons}
          isPending={couponsQuery.isPending}
          isError={couponsQuery.isError}
          isFetching={couponsQuery.isFetching}
          onRetry={() => void couponsQuery.refetch()}
          {...handlers<CouponDto>("coupons")}
        />
      )}

      <p className="mt-4 text-[12px] text-ink-muted">{t("footerNote")}</p>

      <CreditPackEditorDialog
        open={editing?.kind === "credit-packs"}
        pack={editing?.kind === "credit-packs" ? editing.row : null}
        plans={plans}
        onOpenChange={(open) => (!open ? setEditing(null) : undefined)}
        onSubmit={(request) =>
          editing?.kind === "credit-packs" && editing.row
            ? packMutations.update.mutateAsync({ id: editing.row.id, request })
            : packMutations.create.mutateAsync(request)
        }
        isSaving={packMutations.create.isPending || packMutations.update.isPending}
      />
      <AddonEditorDialog
        open={editing?.kind === "addons"}
        addon={editing?.kind === "addons" ? editing.row : null}
        plans={plans}
        onOpenChange={(open) => (!open ? setEditing(null) : undefined)}
        onSubmit={(request) =>
          editing?.kind === "addons" && editing.row
            ? addonMutations.update.mutateAsync({ id: editing.row.id, request })
            : addonMutations.create.mutateAsync(request)
        }
        isSaving={addonMutations.create.isPending || addonMutations.update.isPending}
      />
      <CouponEditorDialog
        open={editing?.kind === "coupons"}
        coupon={editing?.kind === "coupons" ? editing.row : null}
        targets={couponTargets}
        onOpenChange={(open) => (!open ? setEditing(null) : undefined)}
        onSubmit={(request) =>
          editing?.kind === "coupons" && editing.row
            ? couponMutations.update.mutateAsync({ id: editing.row.id, request })
            : couponMutations.create.mutateAsync(request)
        }
        isSaving={couponMutations.create.isPending || couponMutations.update.isPending}
      />

      <ArchiveDialog
        target={archiving ? { name: rowName(archiving.row), archived: archiving.row.status === "archived", kind: archiving.kind } : null}
        onOpenChange={(open) => (!open ? setArchiving(null) : undefined)}
        onConfirm={async () => {
          if (!archiving) return;
          const archived = archiving.row.status !== "archived";
          await mutationsFor(archiving.kind).setArchived.mutateAsync({ id: archiving.row.id, archived });
          toast.success(archived ? t("toasts.archived", { name: rowName(archiving.row) }) : t("toasts.unarchived", { name: rowName(archiving.row) }));
        }}
        isSaving={archiving ? mutationsFor(archiving.kind).setArchived.isPending : false}
      />

      <StripePanelDialog
        target={
          stripeTarget && stripeRow && stripeStatus
            ? {
                kind: stripeTarget.kind,
                id: stripeRow.id,
                name: rowName(stripeRow),
                stripe: stripeStatus,
                promotionCodeId: "stripePromotionCodeId" in stripeRow ? stripeRow.stripePromotionCodeId : undefined,
              }
            : null
        }
        stripeConfigured={optionsQuery.data?.stripeConfigured ?? false}
        canManage={canManage}
        onOpenChange={(open) => (!open ? setStripeTarget(null) : undefined)}
        onSync={async () => {
          if (!stripeTarget) return;
          await mutationsFor(stripeTarget.kind).sync.mutateAsync(stripeTarget.id);
          toast.success(t("toasts.synced"));
        }}
        isSyncing={stripeTarget ? mutationsFor(stripeTarget.kind).sync.isPending : false}
      />
    </AdminPage>
  );
}

export default function AdminPackagesPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <PackagesPage />
    </Suspense>
  );
}
