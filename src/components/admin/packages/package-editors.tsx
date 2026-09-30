"use client";

/**
 * G11 — the create/edit dialogs of /admin/packages, the archive confirmation, and the Stripe
 * panel (sync + drift).
 *
 * Validation here mirrors the server (lib/billing/package-request) for comfort; the server
 * re-validates every write and its message is what shows when the two disagree.
 *
 * Each editor shows a CUSTOMER PREVIEW rendered by the same card the workspace billing page uses,
 * so what the admin sees is what a customer will see.
 */

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowsClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { AddonCard, CreditPackCard } from "@/components/billing/catalog-cards";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminPackageDrift } from "@/hooks/use-admin-packages";
import { getErrorMessage } from "@/lib/api/errors";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import {
  ADDON_ENTITLEMENT_KEYS,
  isNumericEntitlement,
  isoToLocalInput,
  localInputToIso,
  normalizeCode,
  parseOptionalNumber,
  validateAddon,
  validateCoupon,
  validateCreditPack,
  type ValidationIssue,
} from "@/lib/billing/package-request";
import { cn } from "@/lib/utils";
import type { PackageKind } from "@/services/admin-packages.service";
import type {
  AddonDto,
  AddonRequest,
  CatalogItemType,
  CouponDto,
  CouponRequest,
  CreditPackDto,
  CreditPackRequest,
  PackVisibility,
  StripeSyncStatusDto,
} from "@/types/admin-packages";
import type { PlanDto } from "@/types/billing";

// ── Form furniture ───────────────────────────────────────────────────────────

const selectClass =
  "h-9 w-full rounded-lg border border-border bg-surface-1 px-3 text-[13px] text-ink outline-none focus:ring-2 focus:ring-ring/40";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-hairline/60 pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, htmlFor, className, children }: { label: string; hint?: string; htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor} className="text-[12px] text-ink-muted">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-[11px] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function ToggleField({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-hairline/60 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-ink-subtle">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** Multi-select as a list of checkboxes — the lists here are a handful of plans or items. */
function CheckList({ options, value, onChange, empty }: { options: { value: string; label: string; hint?: string }[]; value: string[]; onChange: (next: string[]) => void; empty: string }) {
  if (options.length === 0) return <p className="text-[12px] text-ink-subtle">{empty}</p>;
  return (
    <div className="max-h-40 overflow-y-auto rounded-lg border border-hairline/60">
      {options.map((option) => {
        const checked = value.includes(option.value);
        return (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-surface-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(checked ? value.filter((v) => v !== option.value) : [...value, option.value])}
            />
            <span className="min-w-0 truncate text-ink">{option.label}</span>
            {option.hint ? <span className="ml-auto truncate font-mono text-[11px] text-ink-subtle">{option.hint}</span> : null}
          </label>
        );
      })}
    </div>
  );
}

function Preview({ children }: { children: ReactNode }) {
  const t = useTranslations("adminPackages.editor");
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-2/40 p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{t("preview")}</p>
      <div className="max-w-[320px]">{children}</div>
    </div>
  );
}

function useIssueText() {
  const t = useTranslations("adminPackages.validation");
  return (issue: ValidationIssue) => t(issue.key as "slug", issue.values ?? {});
}

function numberOrNull(value: string): number | null {
  return parseOptionalNumber(value);
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** A draft kept as strings, so a half-typed number is never coerced mid-edit. */
function EditorShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  error,
  onSave,
  isSaving,
  saveLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  error: string | null;
  onSave: () => void;
  isSaving: boolean;
  saveLabel: string;
}) {
  const t = useTranslations("adminPackages.editor");
  return (
    <Dialog open={open} onOpenChange={(next) => (!isSaving ? onOpenChange(next) : undefined)}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-5">{children}</div>
        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter className="mt-5">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? t("saving") : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Credit pack ──────────────────────────────────────────────────────────────

interface PackDraft {
  slug: string;
  name: string;
  description: string;
  credits: string;
  bonusCredits: string;
  priceVnd: string;
  priceUsd: string;
  validityDays: string;
  visibility: PackVisibility;
  eligiblePlanIds: string[];
  eligibleWorkspaceIds: string;
  maxPerWorkspace: string;
  maxTotal: string;
  availableFrom: string;
  availableUntil: string;
  active: boolean;
  sortOrder: string;
}

function packDraft(pack: CreditPackDto | null): PackDraft {
  return {
    slug: pack?.slug ?? "",
    name: pack?.name ?? "",
    description: pack?.description ?? "",
    credits: num(pack?.credits),
    bonusCredits: num(pack?.bonusCredits ?? 0),
    priceVnd: num(pack?.priceVnd),
    priceUsd: num(pack?.priceUsd),
    validityDays: num(pack?.validityDays),
    visibility: pack?.visibility ?? "public",
    eligiblePlanIds: pack?.eligiblePlanIds ?? [],
    eligibleWorkspaceIds: (pack?.eligibleWorkspaceIds ?? []).join("\n"),
    maxPerWorkspace: num(pack?.maxPerWorkspace),
    maxTotal: num(pack?.maxTotal),
    availableFrom: isoToLocalInput(pack?.availableFrom ?? null),
    availableUntil: isoToLocalInput(pack?.availableUntil ?? null),
    active: pack?.status === "active",
    sortOrder: num(pack?.sortOrder ?? 0),
  };
}

function packRequest(draft: PackDraft): CreditPackRequest {
  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    credits: Number(draft.credits),
    bonusCredits: numberOrNull(draft.bonusCredits) ?? 0,
    priceVnd: numberOrNull(draft.priceVnd),
    priceUsd: numberOrNull(draft.priceUsd),
    validityDays: numberOrNull(draft.validityDays),
    visibility: draft.visibility,
    eligiblePlanIds: draft.visibility === "plans" ? draft.eligiblePlanIds : [],
    eligibleWorkspaceIds:
      draft.visibility === "workspaces"
        ? draft.eligibleWorkspaceIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean)
        : [],
    maxPerWorkspace: numberOrNull(draft.maxPerWorkspace),
    maxTotal: numberOrNull(draft.maxTotal),
    availableFrom: localInputToIso(draft.availableFrom),
    availableUntil: localInputToIso(draft.availableUntil),
    status: draft.active ? "active" : "draft",
    sortOrder: numberOrNull(draft.sortOrder) ?? 0,
  };
}

export function CreditPackEditorDialog({
  open,
  pack,
  plans,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  pack: CreditPackDto | null;
  plans: readonly PlanDto[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: CreditPackRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  return open ? (
    <CreditPackEditor key={pack?.id ?? "new"} pack={pack} plans={plans} onOpenChange={onOpenChange} onSubmit={onSubmit} isSaving={isSaving} />
  ) : null;
}

function CreditPackEditor({
  pack,
  plans,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  pack: CreditPackDto | null;
  plans: readonly PlanDto[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: CreditPackRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPackages.editor");
  const issueText = useIssueText();
  const [draft, setDraft] = useState<PackDraft>(() => packDraft(pack));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PackDraft>(key: K, value: PackDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const request = packRequest(draft);
    const issue = validateCreditPack(request);
    if (issue) return setError(issueText(issue));
    try {
      setError(null);
      await onSubmit(request);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, t("saveError")));
    }
  };

  const preview = packRequest(draft);
  const previewPrice = preview.priceVnd ?? preview.priceUsd;

  return (
    <EditorShell
      open
      onOpenChange={onOpenChange}
      title={pack ? t("pack.editTitle", { name: pack.name }) : t("pack.createTitle")}
      description={t("pack.description")}
      error={error}
      onSave={() => void save()}
      isSaving={isSaving}
      saveLabel={pack ? t("save") : t("create")}
    >
      <Section title={t("sections.identity")}>
        <Field label={t("fields.name")} htmlFor="pack-name">
          <Input id="pack-name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label={t("fields.slug")} htmlFor="pack-slug" hint={t("fields.slugHint")}>
          <Input id="pack-slug" value={draft.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
        </Field>
        <Field label={t("fields.description")} htmlFor="pack-description" className="sm:col-span-2">
          <Textarea id="pack-description" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label={t("fields.sortOrder")} htmlFor="pack-sort">
          <Input id="pack-sort" inputMode="numeric" value={draft.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
        <ToggleField label={t("fields.active")} hint={t("fields.activeHint")} checked={draft.active} onChange={(next) => set("active", next)} />
      </Section>

      <Section title={t("sections.contents")}>
        <Field label={t("fields.credits")} htmlFor="pack-credits">
          <Input id="pack-credits" inputMode="numeric" value={draft.credits} onChange={(e) => set("credits", e.target.value)} />
        </Field>
        <Field label={t("fields.bonusCredits")} htmlFor="pack-bonus" hint={t("fields.bonusHint")}>
          <Input id="pack-bonus" inputMode="numeric" value={draft.bonusCredits} onChange={(e) => set("bonusCredits", e.target.value)} />
        </Field>
        <Field label={t("fields.validityDays")} htmlFor="pack-validity" hint={t("fields.validityHint")}>
          <Input id="pack-validity" inputMode="numeric" value={draft.validityDays} onChange={(e) => set("validityDays", e.target.value)} />
        </Field>
      </Section>

      <Section title={t("sections.price")}>
        <Field label={t("fields.priceVnd")} htmlFor="pack-vnd" hint={t("fields.priceHint")}>
          <Input id="pack-vnd" inputMode="numeric" value={draft.priceVnd} onChange={(e) => set("priceVnd", e.target.value)} />
        </Field>
        <Field label={t("fields.priceUsd")} htmlFor="pack-usd" hint={t("fields.priceHint")}>
          <Input id="pack-usd" inputMode="decimal" value={draft.priceUsd} onChange={(e) => set("priceUsd", e.target.value)} />
        </Field>
      </Section>

      <Section title={t("sections.availability")}>
        <Field label={t("fields.visibility")} htmlFor="pack-visibility">
          <select id="pack-visibility" className={selectClass} value={draft.visibility} onChange={(e) => set("visibility", e.target.value as PackVisibility)}>
            {(["public", "plans", "workspaces"] as const).map((value) => (
              <option key={value} value={value}>
                {t(`visibility.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <div />
        {draft.visibility === "plans" ? (
          <Field label={t("fields.eligiblePlans")} htmlFor="pack-plans" className="sm:col-span-2">
            <CheckList
              options={plans.map((plan) => ({ value: plan.id, label: plan.name, hint: plan.slug }))}
              value={draft.eligiblePlanIds}
              onChange={(next) => set("eligiblePlanIds", next)}
              empty={t("noPlans")}
            />
          </Field>
        ) : null}
        {draft.visibility === "workspaces" ? (
          <Field label={t("fields.eligibleWorkspaces")} htmlFor="pack-workspaces" hint={t("fields.eligibleWorkspacesHint")} className="sm:col-span-2">
            <Textarea
              id="pack-workspaces"
              rows={3}
              className="font-mono text-[12px]"
              value={draft.eligibleWorkspaceIds}
              onChange={(e) => set("eligibleWorkspaceIds", e.target.value)}
            />
          </Field>
        ) : null}
        <Field label={t("fields.maxPerWorkspace")} htmlFor="pack-max-ws" hint={t("fields.unlimitedHint")}>
          <Input id="pack-max-ws" inputMode="numeric" value={draft.maxPerWorkspace} onChange={(e) => set("maxPerWorkspace", e.target.value)} />
        </Field>
        <Field label={t("fields.maxTotal")} htmlFor="pack-max-total" hint={t("fields.unlimitedHint")}>
          <Input id="pack-max-total" inputMode="numeric" value={draft.maxTotal} onChange={(e) => set("maxTotal", e.target.value)} />
        </Field>
        <Field label={t("fields.availableFrom")} htmlFor="pack-from">
          <Input id="pack-from" type="datetime-local" value={draft.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} />
        </Field>
        <Field label={t("fields.availableUntil")} htmlFor="pack-until">
          <Input id="pack-until" type="datetime-local" value={draft.availableUntil} onChange={(e) => set("availableUntil", e.target.value)} />
        </Field>
      </Section>

      <Preview>
        <CreditPackCard
          name={preview.name}
          description={preview.description}
          credits={Number.isFinite(preview.credits) ? preview.credits : 0}
          bonusCredits={Number.isFinite(preview.bonusCredits) ? preview.bonusCredits : 0}
          validityDays={preview.validityDays}
          purchasesRemaining={preview.maxPerWorkspace}
          availableUntil={preview.availableUntil}
          price={previewPrice !== null && Number.isFinite(previewPrice) ? { amount: previewPrice, currency: preview.priceVnd !== null ? "vnd" : "usd" } : null}
          action={<Button size="sm" disabled>{t("previewBuy")}</Button>}
        />
      </Preview>
    </EditorShell>
  );
}

// ── Add-on ───────────────────────────────────────────────────────────────────

interface AddonDraft {
  slug: string;
  name: string;
  description: string;
  unitLabel: string;
  entitlementKey: string;
  unitsPerQuantity: string;
  priceMonthlyVnd: string;
  priceYearlyVnd: string;
  priceMonthlyUsd: string;
  priceYearlyUsd: string;
  minQuantity: string;
  maxQuantity: string;
  eligiblePlanIds: string[];
  active: boolean;
  sortOrder: string;
}

function addonDraft(addon: AddonDto | null): AddonDraft {
  return {
    slug: addon?.slug ?? "",
    name: addon?.name ?? "",
    description: addon?.description ?? "",
    unitLabel: addon?.unitLabel ?? "",
    entitlementKey: addon?.entitlementKey ?? "max_participants",
    unitsPerQuantity: num(addon?.unitsPerQuantity ?? 1),
    priceMonthlyVnd: num(addon?.priceMonthlyVnd),
    priceYearlyVnd: num(addon?.priceYearlyVnd),
    priceMonthlyUsd: num(addon?.priceMonthlyUsd),
    priceYearlyUsd: num(addon?.priceYearlyUsd),
    minQuantity: num(addon?.minQuantity ?? 1),
    maxQuantity: num(addon?.maxQuantity ?? 1),
    eligiblePlanIds: addon?.eligiblePlanIds ?? [],
    active: addon?.status === "active",
    sortOrder: num(addon?.sortOrder ?? 0),
  };
}

function addonRequest(draft: AddonDraft): AddonRequest {
  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    unitLabel: draft.unitLabel.trim(),
    entitlementKey: draft.entitlementKey,
    unitsPerQuantity: Number(draft.unitsPerQuantity),
    priceMonthlyVnd: numberOrNull(draft.priceMonthlyVnd),
    priceYearlyVnd: numberOrNull(draft.priceYearlyVnd),
    priceMonthlyUsd: numberOrNull(draft.priceMonthlyUsd),
    priceYearlyUsd: numberOrNull(draft.priceYearlyUsd),
    minQuantity: Number(draft.minQuantity),
    maxQuantity: Number(draft.maxQuantity),
    eligiblePlanIds: draft.eligiblePlanIds,
    status: draft.active ? "active" : "draft",
    sortOrder: numberOrNull(draft.sortOrder) ?? 0,
  };
}

export function AddonEditorDialog({
  open,
  addon,
  plans,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  addon: AddonDto | null;
  plans: readonly PlanDto[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: AddonRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  return open ? (
    <AddonEditor key={addon?.id ?? "new"} addon={addon} plans={plans} onOpenChange={onOpenChange} onSubmit={onSubmit} isSaving={isSaving} />
  ) : null;
}

function AddonEditor({
  addon,
  plans,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  addon: AddonDto | null;
  plans: readonly PlanDto[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: AddonRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPackages.editor");
  const tc = useTranslations("settingsBillingCatalog.cards");
  const issueText = useIssueText();
  const [draft, setDraft] = useState<AddonDraft>(() => addonDraft(addon));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof AddonDraft>(key: K, value: AddonDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const numeric = isNumericEntitlement(draft.entitlementKey);
  // Sold add-ons keep the grant they were sold with; the server refuses a change.
  const grantLocked = (addon?.unitsSold ?? 0) > 0;

  const save = async () => {
    const request = addonRequest(draft);
    const issue = validateAddon(request);
    if (issue) return setError(issueText(issue));
    try {
      setError(null);
      await onSubmit(request);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, t("saveError")));
    }
  };

  const preview = addonRequest(draft);
  const previewMonthly = preview.priceMonthlyVnd ?? preview.priceMonthlyUsd;

  return (
    <EditorShell
      open
      onOpenChange={onOpenChange}
      title={addon ? t("addon.editTitle", { name: addon.name }) : t("addon.createTitle")}
      description={t("addon.description")}
      error={error}
      onSave={() => void save()}
      isSaving={isSaving}
      saveLabel={addon ? t("save") : t("create")}
    >
      <Section title={t("sections.identity")}>
        <Field label={t("fields.name")} htmlFor="addon-name">
          <Input id="addon-name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label={t("fields.slug")} htmlFor="addon-slug" hint={t("fields.slugHint")}>
          <Input id="addon-slug" value={draft.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
        </Field>
        <Field label={t("fields.description")} htmlFor="addon-description" className="sm:col-span-2">
          <Textarea id="addon-description" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label={t("fields.sortOrder")} htmlFor="addon-sort">
          <Input id="addon-sort" inputMode="numeric" value={draft.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
        <ToggleField label={t("fields.active")} hint={t("fields.activeHint")} checked={draft.active} onChange={(next) => set("active", next)} />
      </Section>

      <Section title={t("sections.grant")}>
        <Field label={t("fields.entitlement")} htmlFor="addon-entitlement" hint={grantLocked ? t("fields.grantLocked") : t("fields.entitlementHint")}>
          <select
            id="addon-entitlement"
            className={selectClass}
            disabled={grantLocked}
            value={draft.entitlementKey}
            onChange={(e) => {
              const key = e.target.value;
              setDraft((current) => ({
                ...current,
                entitlementKey: key,
                ...(isNumericEntitlement(key) ? {} : { unitsPerQuantity: "1", minQuantity: "1", maxQuantity: "1" }),
              }));
            }}
          >
            {ADDON_ENTITLEMENT_KEYS.map((key) => (
              <option key={key} value={key}>
                {tc(`entitlements.${key}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("fields.unitLabel")} htmlFor="addon-unit" hint={t("fields.unitLabelHint")}>
          <Input id="addon-unit" value={draft.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} />
        </Field>
        {numeric ? (
          <>
            <Field label={t("fields.unitsPerQuantity")} htmlFor="addon-units" hint={t("fields.unitsPerQuantityHint")}>
              <Input id="addon-units" inputMode="numeric" disabled={grantLocked} value={draft.unitsPerQuantity} onChange={(e) => set("unitsPerQuantity", e.target.value)} />
            </Field>
            <div />
            <Field label={t("fields.minQuantity")} htmlFor="addon-min">
              <Input id="addon-min" inputMode="numeric" value={draft.minQuantity} onChange={(e) => set("minQuantity", e.target.value)} />
            </Field>
            <Field label={t("fields.maxQuantity")} htmlFor="addon-max">
              <Input id="addon-max" inputMode="numeric" value={draft.maxQuantity} onChange={(e) => set("maxQuantity", e.target.value)} />
            </Field>
          </>
        ) : null}
      </Section>

      <Section title={t("sections.price")}>
        <Field label={t("fields.priceMonthlyVnd")} htmlFor="addon-mvnd" hint={t("fields.perUnitHint")}>
          <Input id="addon-mvnd" inputMode="numeric" value={draft.priceMonthlyVnd} onChange={(e) => set("priceMonthlyVnd", e.target.value)} />
        </Field>
        <Field label={t("fields.priceYearlyVnd")} htmlFor="addon-yvnd" hint={t("fields.perUnitHint")}>
          <Input id="addon-yvnd" inputMode="numeric" value={draft.priceYearlyVnd} onChange={(e) => set("priceYearlyVnd", e.target.value)} />
        </Field>
        <Field label={t("fields.priceMonthlyUsd")} htmlFor="addon-musd" hint={t("fields.perUnitHint")}>
          <Input id="addon-musd" inputMode="decimal" value={draft.priceMonthlyUsd} onChange={(e) => set("priceMonthlyUsd", e.target.value)} />
        </Field>
        <Field label={t("fields.priceYearlyUsd")} htmlFor="addon-yusd" hint={t("fields.perUnitHint")}>
          <Input id="addon-yusd" inputMode="decimal" value={draft.priceYearlyUsd} onChange={(e) => set("priceYearlyUsd", e.target.value)} />
        </Field>
      </Section>

      <Section title={t("sections.availability")}>
        <Field label={t("fields.eligiblePlans")} htmlFor="addon-plans" hint={t("fields.allPlansHint")} className="sm:col-span-2">
          <CheckList
            options={plans.map((plan) => ({ value: plan.id, label: plan.name, hint: plan.slug }))}
            value={draft.eligiblePlanIds}
            onChange={(next) => set("eligiblePlanIds", next)}
            empty={t("noPlans")}
          />
        </Field>
      </Section>

      <Preview>
        <AddonCard
          name={preview.name}
          description={preview.description}
          unitLabel={preview.unitLabel}
          entitlementKey={preview.entitlementKey}
          unitsPerQuantity={Number.isFinite(preview.unitsPerQuantity) ? preview.unitsPerQuantity : 1}
          minQuantity={Number.isFinite(preview.minQuantity) ? preview.minQuantity : 1}
          maxQuantity={Number.isFinite(preview.maxQuantity) ? preview.maxQuantity : 1}
          cycle="monthly"
          price={previewMonthly !== null && Number.isFinite(previewMonthly) ? { amount: previewMonthly, currency: preview.priceMonthlyVnd !== null ? "vnd" : "usd" } : null}
          action={<Button size="sm" variant="outline" disabled>{t("previewAdd")}</Button>}
        />
      </Preview>
    </EditorShell>
  );
}

// ── Coupon ───────────────────────────────────────────────────────────────────

interface CouponDraft {
  code: string;
  name: string;
  discountType: "percent" | "fixed";
  percentOff: string;
  amountOff: string;
  amountOffCurrency: "vnd" | "usd";
  appliesToTypes: CatalogItemType[];
  appliesToIds: string[];
  duration: "once" | "repeating" | "forever";
  durationInMonths: string;
  maxRedemptions: string;
  perWorkspaceLimit: string;
  validFrom: string;
  validUntil: string;
  autoApply: boolean;
  active: boolean;
}

function couponDraft(coupon: CouponDto | null): CouponDraft {
  return {
    code: coupon?.code ?? "",
    name: coupon?.name ?? "",
    discountType: coupon?.discountType ?? "percent",
    percentOff: num(coupon?.percentOff),
    amountOff: num(coupon?.amountOff),
    amountOffCurrency: coupon?.amountOffCurrency ?? "vnd",
    appliesToTypes: coupon?.appliesToTypes ?? ["credit_pack"],
    appliesToIds: coupon?.appliesToIds ?? [],
    duration: coupon?.duration ?? "once",
    durationInMonths: num(coupon?.durationInMonths),
    maxRedemptions: num(coupon?.maxRedemptions),
    perWorkspaceLimit: num(coupon?.perWorkspaceLimit ?? 1),
    validFrom: isoToLocalInput(coupon?.validFrom ?? null),
    validUntil: isoToLocalInput(coupon?.validUntil ?? null),
    autoApply: coupon?.autoApply ?? false,
    active: coupon?.status === "active",
  };
}

function couponRequest(draft: CouponDraft): CouponRequest {
  const code = normalizeCode(draft.code);
  return {
    code: code || null,
    name: draft.name.trim(),
    discountType: draft.discountType,
    percentOff: draft.discountType === "percent" ? numberOrNull(draft.percentOff) : null,
    amountOff: draft.discountType === "fixed" ? numberOrNull(draft.amountOff) : null,
    amountOffCurrency: draft.discountType === "fixed" ? draft.amountOffCurrency : null,
    appliesToTypes: draft.appliesToTypes,
    appliesToIds: draft.appliesToIds,
    duration: draft.duration,
    durationInMonths: draft.duration === "repeating" ? numberOrNull(draft.durationInMonths) : null,
    maxRedemptions: numberOrNull(draft.maxRedemptions),
    perWorkspaceLimit: numberOrNull(draft.perWorkspaceLimit) ?? 1,
    validFrom: localInputToIso(draft.validFrom),
    validUntil: localInputToIso(draft.validUntil),
    autoApply: draft.autoApply,
    status: draft.active ? "active" : "draft",
  };
}

export interface CouponTargetOption {
  id: string;
  type: CatalogItemType;
  label: string;
  hint?: string;
}

export function CouponEditorDialog({
  open,
  coupon,
  targets,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  coupon: CouponDto | null;
  targets: readonly CouponTargetOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: CouponRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  return open ? (
    <CouponEditor key={coupon?.id ?? "new"} coupon={coupon} targets={targets} onOpenChange={onOpenChange} onSubmit={onSubmit} isSaving={isSaving} />
  ) : null;
}

function CouponEditor({
  coupon,
  targets,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  coupon: CouponDto | null;
  targets: readonly CouponTargetOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: CouponRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPackages.editor");
  const issueText = useIssueText();
  const [draft, setDraft] = useState<CouponDraft>(() => couponDraft(coupon));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CouponDraft>(key: K, value: CouponDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const termsLocked = (coupon?.redemptions ?? 0) > 0;

  const save = async () => {
    const request = couponRequest(draft);
    const issue = validateCoupon(request);
    if (issue) return setError(issueText(issue));
    try {
      setError(null);
      await onSubmit(request);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, t("saveError")));
    }
  };

  const visibleTargets = targets.filter((target) => draft.appliesToTypes.includes(target.type));

  return (
    <EditorShell
      open
      onOpenChange={onOpenChange}
      title={coupon ? t("coupon.editTitle", { name: coupon.name }) : t("coupon.createTitle")}
      description={t("coupon.description")}
      error={error}
      onSave={() => void save()}
      isSaving={isSaving}
      saveLabel={coupon ? t("save") : t("create")}
    >
      <Section title={t("sections.identity")}>
        <Field label={t("fields.couponName")} htmlFor="coupon-name">
          <Input id="coupon-name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label={t("fields.code")} htmlFor="coupon-code" hint={t("fields.codeHint")}>
          <Input id="coupon-code" className="font-mono" value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </Field>
        <ToggleField label={t("fields.autoApply")} hint={t("fields.autoApplyHint")} checked={draft.autoApply} onChange={(next) => set("autoApply", next)} />
        <ToggleField label={t("fields.active")} hint={t("fields.activeHint")} checked={draft.active} onChange={(next) => set("active", next)} />
      </Section>

      <Section title={t("sections.discount")}>
        <Field label={t("fields.discountType")} htmlFor="coupon-type" hint={termsLocked ? t("fields.termsLocked") : undefined}>
          <select id="coupon-type" className={selectClass} disabled={termsLocked} value={draft.discountType} onChange={(e) => set("discountType", e.target.value as CouponDraft["discountType"])}>
            <option value="percent">{t("discountTypes.percent")}</option>
            <option value="fixed">{t("discountTypes.fixed")}</option>
          </select>
        </Field>
        {draft.discountType === "percent" ? (
          <Field label={t("fields.percentOff")} htmlFor="coupon-percent">
            <Input id="coupon-percent" inputMode="decimal" disabled={termsLocked} value={draft.percentOff} onChange={(e) => set("percentOff", e.target.value)} />
          </Field>
        ) : (
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Field label={t("fields.amountOff")} htmlFor="coupon-amount">
              <Input id="coupon-amount" inputMode="decimal" disabled={termsLocked} value={draft.amountOff} onChange={(e) => set("amountOff", e.target.value)} />
            </Field>
            <Field label={t("fields.currency")} htmlFor="coupon-currency">
              <select id="coupon-currency" className={selectClass} disabled={termsLocked} value={draft.amountOffCurrency} onChange={(e) => set("amountOffCurrency", e.target.value as "vnd" | "usd")}>
                <option value="vnd">VND</option>
                <option value="usd">USD</option>
              </select>
            </Field>
          </div>
        )}
        <Field label={t("fields.duration")} htmlFor="coupon-duration" hint={t("fields.durationHint")}>
          <select id="coupon-duration" className={selectClass} disabled={termsLocked} value={draft.duration} onChange={(e) => set("duration", e.target.value as CouponDraft["duration"])}>
            {(["once", "repeating", "forever"] as const).map((value) => (
              <option key={value} value={value}>
                {t(`durations.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        {draft.duration === "repeating" ? (
          <Field label={t("fields.durationInMonths")} htmlFor="coupon-months">
            <Input id="coupon-months" inputMode="numeric" disabled={termsLocked} value={draft.durationInMonths} onChange={(e) => set("durationInMonths", e.target.value)} />
          </Field>
        ) : null}
      </Section>

      <Section title={t("sections.appliesTo")}>
        <Field label={t("fields.appliesToTypes")} htmlFor="coupon-types" hint={t("fields.stackingHint")} className="sm:col-span-2">
          <CheckList
            options={(["plan", "credit_pack", "addon"] as const).map((type) => ({ value: type, label: t(`itemTypes.${type}`) }))}
            value={draft.appliesToTypes}
            onChange={(next) => {
              const types = next as CatalogItemType[];
              const allowed = new Set(targets.filter((target) => types.includes(target.type)).map((target) => target.id));
              setDraft((current) => ({ ...current, appliesToTypes: types, appliesToIds: current.appliesToIds.filter((id) => allowed.has(id)) }));
            }}
            empty=""
          />
        </Field>
        <Field label={t("fields.appliesToIds")} htmlFor="coupon-ids" hint={t("fields.appliesToIdsHint")} className="sm:col-span-2">
          <CheckList
            options={visibleTargets.map((target) => ({ value: target.id, label: target.label, hint: t(`itemTypes.${target.type}`) }))}
            value={draft.appliesToIds}
            onChange={(next) => set("appliesToIds", next)}
            empty={t("noTargets")}
          />
        </Field>
      </Section>

      <Section title={t("sections.limits")}>
        <Field label={t("fields.maxRedemptions")} htmlFor="coupon-max" hint={t("fields.unlimitedHint")}>
          <Input id="coupon-max" inputMode="numeric" value={draft.maxRedemptions} onChange={(e) => set("maxRedemptions", e.target.value)} />
        </Field>
        <Field label={t("fields.perWorkspaceLimit")} htmlFor="coupon-per-ws">
          <Input id="coupon-per-ws" inputMode="numeric" value={draft.perWorkspaceLimit} onChange={(e) => set("perWorkspaceLimit", e.target.value)} />
        </Field>
        <Field label={t("fields.validFrom")} htmlFor="coupon-from">
          <Input id="coupon-from" type="datetime-local" value={draft.validFrom} onChange={(e) => set("validFrom", e.target.value)} />
        </Field>
        <Field label={t("fields.validUntil")} htmlFor="coupon-until">
          <Input id="coupon-until" type="datetime-local" value={draft.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
        </Field>
      </Section>
    </EditorShell>
  );
}

// ── Archive confirmation ─────────────────────────────────────────────────────

export function ArchiveDialog({
  target,
  onOpenChange,
  onConfirm,
  isSaving,
}: {
  target: { name: string; archived: boolean; kind: PackageKind } | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<unknown>;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPackages.archive");
  const [error, setError] = useState<string | null>(null);
  const restoring = target?.archived === true;
  return (
    <Dialog open={target !== null} onOpenChange={(next) => (!isSaving ? onOpenChange(next) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{restoring ? t("restoreTitle", { name: target?.name ?? "" }) : t("title", { name: target?.name ?? "" })}</DialogTitle>
          <DialogDescription>
            {restoring ? t("restoreDescription") : target?.kind === "addons" ? t("descriptionAddon") : target?.kind === "coupons" ? t("descriptionCoupon") : t("descriptionPack")}
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button
            variant={restoring ? "default" : "destructive"}
            disabled={isSaving}
            onClick={async () => {
              try {
                setError(null);
                await onConfirm();
                onOpenChange(false);
              } catch (err) {
                setError(getErrorMessage(err, t("failed")));
              }
            }}
          >
            {restoring ? t("restore") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stripe panel ─────────────────────────────────────────────────────────────

export function StripeSyncBadge({ status }: { status: StripeSyncStatusDto }) {
  const t = useTranslations("adminPackages.stripe");
  return (
    <span
      title={status.error ?? undefined}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        status.state === "synced" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        status.state === "outdated" && "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        status.state === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        status.state === "not_synced" && "border-border bg-surface-2 text-ink-muted",
      )}
    >
      {t(`states.${status.state}`)}
    </span>
  );
}

export function StripePanelDialog({
  target,
  stripeConfigured,
  canManage,
  onOpenChange,
  onSync,
  isSyncing,
}: {
  target: { kind: PackageKind; id: string; name: string; stripe: StripeSyncStatusDto; promotionCodeId?: string | null } | null;
  stripeConfigured: boolean;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onSync: () => Promise<unknown>;
  isSyncing: boolean;
}) {
  const t = useTranslations("adminPackages.stripe");
  const [checkDrift, setCheckDrift] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drift = useAdminPackageDrift(target?.kind ?? "credit-packs", target && checkDrift ? target.id : null);

  const close = (open: boolean) => {
    if (!open) {
      setCheckDrift(false);
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={target !== null} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title", { name: target?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="grid gap-3 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">{t("state")}</span>
              <StripeSyncBadge status={target.stripe} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">{target.kind === "coupons" ? t("couponId") : t("productId")}</span>
              <span className="truncate font-mono text-[12px]">{target.stripe.productId ?? "—"}</span>
            </div>
            {target.promotionCodeId !== undefined ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-muted">{t("promotionCodeId")}</span>
                <span className="truncate font-mono text-[12px]">{target.promotionCodeId ?? "—"}</span>
              </div>
            ) : null}
            {Object.entries(target.stripe.priceIds).map(([key, id]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-ink-muted">{t("priceFor", { key })}</span>
                <span className="truncate font-mono text-[12px]">{id}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-muted">{t("syncedAt")}</span>
              <span>{target.stripe.syncedAt ? new Date(target.stripe.syncedAt).toLocaleString() : "—"}</span>
            </div>
            {target.stripe.error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{target.stripe.error}</p>
            ) : null}
            <p className="text-[11px] text-ink-subtle">{t("immutableNote")}</p>
            {!stripeConfigured ? <p className="text-[12px] text-amber-600">{t("notConfigured")}</p> : null}

            {checkDrift ? (
              <div className="rounded-lg border border-hairline/60 p-3">
                {drift.isPending ? (
                  <p className="text-ink-muted">{t("checking")}</p>
                ) : drift.isError ? (
                  <p className="text-destructive">{getErrorMessage(drift.error, t("driftFailed"))}</p>
                ) : drift.data ? (
                  drift.data.error ? (
                    <p className="text-amber-600">{drift.data.error}</p>
                  ) : drift.data.differences.length === 0 ? (
                    <p className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle size={14} weight="fill" />
                      {target.stripe.productId ? t("noDrift") : t("nothingToCompare")}
                    </p>
                  ) : (
                    <div>
                      <p className="mb-2 inline-flex items-center gap-1.5 text-amber-600">
                        <WarningCircle size={14} weight="fill" />
                        {t("driftFound", { count: drift.data.differences.length })}
                      </p>
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-left text-ink-muted">
                            <th className="py-1 font-medium">{t("field")}</th>
                            <th className="py-1 font-medium">{t("database")}</th>
                            <th className="py-1 font-medium">{t("stripeValue")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drift.data.differences.map((difference) => (
                            <tr key={difference.field} className="border-t border-hairline/60">
                              <td className="py-1 font-mono">{difference.field}</td>
                              <td className="py-1">{difference.database ?? "—"}</td>
                              <td className="py-1">{difference.stripe ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}
              </div>
            ) : null}
            {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={!canManage || !stripeConfigured || !target?.stripe.productId} onClick={() => (checkDrift ? void drift.refetch() : setCheckDrift(true))}>
            {t("checkDrift")}
          </Button>
          <Button
            disabled={!canManage || !stripeConfigured || isSyncing}
            onClick={async () => {
              try {
                setError(null);
                await onSync();
                setCheckDrift(false);
              } catch (err) {
                setError(getErrorMessage(err, t("syncFailed")));
              }
            }}
          >
            <ArrowsClockwise size={14} className={cn(isSyncing && "animate-spin")} />
            {t("sync")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function formatRevenue(revenue: readonly { currency: string; amount: number }[]): string {
  return revenue.length === 0 ? "—" : revenue.map((money) => formatAdminMoney(money)).join(" · ");
}
