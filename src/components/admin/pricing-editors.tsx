"use client";

/**
 * The three write surfaces on Plans & pricing.
 *
 * Kept out of the page because each one is a form over a body the server replaces wholesale, and
 * the rules about what may and may not be retyped differ per form:
 *
 *   PlanEditDialog        every column, laid over the stored plan so nothing unseen is reset
 *   RateCardEditDialog    price and margin only — the identity columns are the upsert key;
 *                         on a credit-unit (CRD) card, the provider cost alone
 *   PricingConfigDialog   the twelve knobs the endpoint accepts, not the two it computes
 *
 * PlanCreateDialog is the one creator: POST /plans exists as of 2026-08-17, with the same
 * validation as the PUT. Rate-card identities still arrive by migration; a retired plan is
 * `isActive: false`, never deleted, because it keeps appearing on old invoices.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

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
import { usePreviewAdminRateCard } from "@/hooks/use-admin-pricing";
import { getErrorMessage } from "@/lib/api/errors";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import {
  isCreditRateCard,
  parseProviderCostUsd,
  providerCostEffect,
} from "@/lib/billing/rate-card-margin";
import {
  canSaveRateCard,
  formatMarginRatio,
  previewableInputs,
  type PricingInputs,
} from "@/lib/billing/rate-card-preview";
import {
  PLAN_BILLING_CYCLE,
  PLAN_CURRENCIES,
  applyPlanEdits,
  validatePlanRequest,
} from "@/lib/billing/plan-request";
import { cn } from "@/lib/utils";
import type { RateCardPreviewDto } from "@/types/admin-contract-billing";
import type {
  PlanRequest,
  PricingConfigDto,
  UpdatePricingConfigRequest,
  UpsertUsageRateCardRequest,
  UsageRateCardDto,
} from "@/types/admin-pricing";
import type { PlanDto } from "@/types/billing";

/* ── form furniture ──────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-hairline/60 pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
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

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
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

/** The one place a form string becomes a number, so NaN has exactly one origin to reason about. */
function toNumber(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
    >
      {message}
    </p>
  );
}

/* ── plans ───────────────────────────────────────────────────────────────── */

type PlanDraft = {
  name: string;
  slug: string;
  tier: string;
  sortOrder: string;
  price: string;
  currency: string;
  creditsPerCycle: string;
  overageCapCredits: string;
  overagePricePerCredit: string;
  lowBalanceThresholdCredits: string;
  rolloverCapCredits: string;
  invoiceTermsDays: string;
  invoiceGraceHours: string;
  maxParticipants: string;
  maxLanguages: string;
  isActive: boolean;
  voiceCloneEnabled: boolean;
  aiAssistantEnabled: boolean;
  glossaryEnabled: boolean;
  dedicatedGpu: boolean;
  features: string;
};

function draftFromPlan(plan: PlanDto): PlanDraft {
  return {
    name: plan.name,
    slug: plan.slug,
    tier: plan.tier,
    sortOrder: String(plan.sortOrder),
    price: String(plan.price),
    currency: plan.currency,
    creditsPerCycle: String(plan.creditsPerCycle),
    overageCapCredits: String(plan.overageCapCredits),
    overagePricePerCredit: String(plan.overagePricePerCredit),
    lowBalanceThresholdCredits: String(plan.lowBalanceThresholdCredits),
    rolloverCapCredits: String(plan.rolloverCapCredits),
    invoiceTermsDays: String(plan.invoiceTermsDays),
    invoiceGraceHours: String(plan.invoiceGraceHours),
    maxParticipants: String(plan.maxParticipants),
    maxLanguages: String(plan.maxLanguages),
    isActive: plan.isActive,
    voiceCloneEnabled: plan.voiceCloneEnabled,
    aiAssistantEnabled: plan.aiAssistantEnabled,
    glossaryEnabled: plan.glossaryEnabled,
    dedicatedGpu: plan.dedicatedGpu,
    features: plan.features,
  };
}

function editsFromDraft(draft: PlanDraft): Partial<PlanRequest> {
  return {
    name: draft.name.trim(),
    slug: draft.slug.trim().toLowerCase(),
    tier: draft.tier.trim(),
    sortOrder: toNumber(draft.sortOrder),
    price: toNumber(draft.price),
    currency: draft.currency,
    // Never taken from the form. The update endpoint accepts "monthly" and nothing else, so the
    // value is stated rather than offered — see PLAN_BILLING_CYCLE.
    billingCycle: PLAN_BILLING_CYCLE,
    creditsPerCycle: toNumber(draft.creditsPerCycle),
    overageCapCredits: toNumber(draft.overageCapCredits),
    overagePricePerCredit: toNumber(draft.overagePricePerCredit),
    lowBalanceThresholdCredits: toNumber(draft.lowBalanceThresholdCredits),
    rolloverCapCredits: toNumber(draft.rolloverCapCredits),
    invoiceTermsDays: toNumber(draft.invoiceTermsDays),
    invoiceGraceHours: toNumber(draft.invoiceGraceHours),
    maxParticipants: toNumber(draft.maxParticipants),
    maxLanguages: toNumber(draft.maxLanguages),
    isActive: draft.isActive,
    voiceCloneEnabled: draft.voiceCloneEnabled,
    aiAssistantEnabled: draft.aiAssistantEnabled,
    glossaryEnabled: draft.glossaryEnabled,
    dedicatedGpu: draft.dedicatedGpu,
    features: draft.features.trim(),
  };
}

/**
 * Every dialog here holds its draft in a form that MOUNTS with the record and unmounts with it.
 *
 * Seeding a long-lived draft from an effect was the alternative, and it has a failure the mount
 * does not: between the record changing and the effect running, the form renders the previous
 * record's numbers over the new record's name. Mounting makes the initial state the only state
 * there has ever been, so a stale draft cannot be saved over a plan it did not come from.
 */
export function PlanEditDialog({
  plan,
  open,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  /** Null while closed. The draft is seeded from it, so it must be the plan as last read. */
  plan: PlanDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: PlanRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.planForm");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editDialog.title")}</DialogTitle>
          <DialogDescription>{t("editDialog.description")}</DialogDescription>
        </DialogHeader>

        {plan ? (
          <PlanEditForm
            key={plan.id}
            plan={plan}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            onSaved={() => onOpenChange(false)}
            isSaving={isSaving}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The seed a brand-new plan starts from. Passing a PlanDto (not a blank form) keeps
 * PlanEditForm's contract — the request is always built from a whole plan with edits laid over
 * it — so create and edit cannot drift apart field-by-field. The numbers mirror the server's own
 * PlanRequest defaults; name and slug are empty on purpose and blocked client-side until typed.
 */
const NEW_PLAN_SEED: PlanDto = {
  id: "",
  name: "",
  slug: "",
  tier: "standard",
  price: 0,
  currency: "VND",
  billingCycle: PLAN_BILLING_CYCLE,
  creditsPerCycle: 0,
  overageCapCredits: 0,
  overagePricePerCredit: 4,
  lowBalanceThresholdCredits: 0,
  rolloverCapCredits: 0,
  invoiceTermsDays: 15,
  invoiceGraceHours: 360,
  features: "{}",
  sortOrder: 0,
  isActive: true,
  maxParticipants: 10,
  maxLanguages: 4,
  voiceCloneEnabled: false,
  aiAssistantEnabled: false,
  glossaryEnabled: false,
  dedicatedGpu: false,
};

export function PlanCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: PlanRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.planForm");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>{t("createDialog.description")}</DialogDescription>
        </DialogHeader>

        {open ? (
          <PlanEditForm
            key="new-plan"
            plan={NEW_PLAN_SEED}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            onSaved={() => onOpenChange(false)}
            isSaving={isSaving}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanEditForm({
  plan,
  onCancel,
  onSubmit,
  onSaved,
  isSaving,
}: {
  plan: PlanDto;
  onCancel: () => void;
  onSubmit: (request: PlanRequest) => Promise<unknown>;
  onSaved: () => void;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.planForm");
  const [draft, setDraft] = useState<PlanDraft>(() => draftFromPlan(plan));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    // The stored plan is the base. Anything this dialog does not offer — today, nothing; after the
    // next column is added to PlanRequest, that column — survives the save instead of being reset.
    const request = applyPlanEdits(plan, editsFromDraft(draft));

    const invalid = validatePlanRequest(request);
    if (invalid) {
      setError(invalid);
      return;
    }

    try {
      setError(null);
      await onSubmit(request);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, t("saveError")));
    }
  };

  return (
    <>
        <div className="mt-4 grid gap-5">
            <Section title={t("sections.identity")}>
              <Field label={t("fields.name")} htmlFor="plan-name">
                <Input
                  id="plan-name"
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                />
              </Field>
              <Field label={t("fields.slug")} htmlFor="plan-slug" hint={t("fields.slugHint")}>
                <Input
                  id="plan-slug"
                  value={draft.slug}
                  onChange={(event) => set("slug", event.target.value)}
                />
              </Field>
              <Field label={t("fields.tier")} htmlFor="plan-tier">
                <Input
                  id="plan-tier"
                  value={draft.tier}
                  onChange={(event) => set("tier", event.target.value)}
                />
              </Field>
              <Field label={t("fields.sortOrder")} htmlFor="plan-sort" hint={t("fields.sortOrderHint")}>
                <Input
                  id="plan-sort"
                  inputMode="numeric"
                  value={draft.sortOrder}
                  onChange={(event) => set("sortOrder", event.target.value)}
                />
              </Field>
              <ToggleField
                label={t("fields.active")}
                hint={t("fields.activeHint")}
                checked={draft.isActive}
                onChange={(next) => set("isActive", next)}
              />
            </Section>

            <Section title={t("sections.price")}>
              <Field label={t("fields.price")} htmlFor="plan-price">
                <Input
                  id="plan-price"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(event) => set("price", event.target.value)}
                />
              </Field>
              <Field label={t("fields.currency")} htmlFor="plan-currency">
                <select
                  id="plan-currency"
                  value={draft.currency}
                  onChange={(event) => set("currency", event.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-1 px-3 text-[13px] text-ink outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {PLAN_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("fields.billingCycle")}
                htmlFor="plan-cycle"
                hint={t("fields.billingCycleHint")}
                className="sm:col-span-2"
              >
                <Input id="plan-cycle" value={PLAN_BILLING_CYCLE} disabled readOnly />
              </Field>
            </Section>

            <Section title={t("sections.creditsOverage")}>
              <Field label={t("fields.creditsPerCycle")} htmlFor="plan-credits">
                <Input
                  id="plan-credits"
                  inputMode="numeric"
                  value={draft.creditsPerCycle}
                  onChange={(event) => set("creditsPerCycle", event.target.value)}
                />
              </Field>
              <Field
                label={t("fields.overageCap")}
                htmlFor="plan-overage-cap"
                hint={t("fields.overageCapHint")}
              >
                <Input
                  id="plan-overage-cap"
                  inputMode="numeric"
                  value={draft.overageCapCredits}
                  onChange={(event) => set("overageCapCredits", event.target.value)}
                />
              </Field>
              <Field label={t("fields.overagePrice")} htmlFor="plan-overage-price">
                <Input
                  id="plan-overage-price"
                  inputMode="decimal"
                  value={draft.overagePricePerCredit}
                  onChange={(event) => set("overagePricePerCredit", event.target.value)}
                />
              </Field>
              <Field
                label={t("fields.lowBalance")}
                htmlFor="plan-low-balance"
                hint={t("fields.lowBalanceHint")}
              >
                <Input
                  id="plan-low-balance"
                  inputMode="numeric"
                  value={draft.lowBalanceThresholdCredits}
                  onChange={(event) => set("lowBalanceThresholdCredits", event.target.value)}
                />
              </Field>
              <Field label={t("fields.rolloverCap")} htmlFor="plan-rollover">
                <Input
                  id="plan-rollover"
                  inputMode="numeric"
                  value={draft.rolloverCapCredits}
                  onChange={(event) => set("rolloverCapCredits", event.target.value)}
                />
              </Field>
            </Section>

            <Section title={t("sections.invoicing")}>
              <Field label={t("fields.invoiceTerms")} htmlFor="plan-terms">
                <Input
                  id="plan-terms"
                  inputMode="numeric"
                  value={draft.invoiceTermsDays}
                  onChange={(event) => set("invoiceTermsDays", event.target.value)}
                />
              </Field>
              <Field label={t("fields.invoiceGrace")} htmlFor="plan-grace">
                <Input
                  id="plan-grace"
                  inputMode="numeric"
                  value={draft.invoiceGraceHours}
                  onChange={(event) => set("invoiceGraceHours", event.target.value)}
                />
              </Field>
            </Section>

            <Section title={t("sections.limits")}>
              <Field label={t("fields.maxParticipants")} htmlFor="plan-participants">
                <Input
                  id="plan-participants"
                  inputMode="numeric"
                  value={draft.maxParticipants}
                  onChange={(event) => set("maxParticipants", event.target.value)}
                />
              </Field>
              <Field label={t("fields.maxLanguages")} htmlFor="plan-languages" hint={t("fields.maxLanguagesHint")}>
                <Input
                  id="plan-languages"
                  inputMode="numeric"
                  value={draft.maxLanguages}
                  onChange={(event) => set("maxLanguages", event.target.value)}
                />
              </Field>
            </Section>

            <Section title={t("sections.entitlements")}>
              <ToggleField
                label={t("fields.voiceCloning")}
                checked={draft.voiceCloneEnabled}
                onChange={(next) => set("voiceCloneEnabled", next)}
              />
              <ToggleField
                label={t("fields.aiAssistant")}
                checked={draft.aiAssistantEnabled}
                onChange={(next) => set("aiAssistantEnabled", next)}
              />
              <ToggleField
                label={t("fields.glossary")}
                checked={draft.glossaryEnabled}
                onChange={(next) => set("glossaryEnabled", next)}
              />
              <ToggleField
                label={t("fields.dedicatedGpu")}
                checked={draft.dedicatedGpu}
                onChange={(next) => set("dedicatedGpu", next)}
              />
              <Field
                label={t("fields.features")}
                htmlFor="plan-features"
                hint={t("fields.featuresHint")}
                className="sm:col-span-2"
              >
                <Textarea
                  id="plan-features"
                  rows={3}
                  className="font-mono text-[12px]"
                  value={draft.features}
                  onChange={(event) => set("features", event.target.value)}
                />
              </Field>
            </Section>

        <FormError message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── rate cards ──────────────────────────────────────────────────────────── */

type RateCardDraft = {
  unitPrice: string;
  currency: string;
  providerUnitCostUsd: string;
  markupMultiplier: string;
  isActive: boolean;
};

function draftFromCard(card: UsageRateCardDto): RateCardDraft {
  return {
    unitPrice: String(card.unitPrice),
    currency: card.currency,
    // Empty, not "0". A card with no recorded provider cost is a card whose margin is unknown, and
    // typing a zero would turn that into a claim that the vendor charges nothing.
    providerUnitCostUsd: card.providerUnitCostUsd == null ? "" : String(card.providerUnitCostUsd),
    markupMultiplier: card.markupMultiplier == null ? "" : String(card.markupMultiplier),
    isActive: card.isActive,
  };
}

export function RateCardEditDialog({
  card,
  open,
  onOpenChange,
  onSubmit,
  onSetProviderCost,
  isSaving,
}: {
  card: UsageRateCardDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: UpsertUsageRateCardRequest) => Promise<unknown>;
  /** Credit-unit (CRD) cards only: records the provider cost and nothing else. */
  onSetProviderCost: (id: string, providerUnitCostUsd: number) => Promise<unknown>;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.rateCard");
  const isCredit = card ? isCreditRateCard(card) : false;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCredit ? t("creditCost.title") : t("editDialog.title")}</DialogTitle>
          <DialogDescription>
            {isCredit ? t("creditCost.description") : t("editDialog.description")}
          </DialogDescription>
        </DialogHeader>

        {card && isCredit ? (
          <CreditRateCardCostForm
            key={card.id}
            card={card}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSetProviderCost}
            onSaved={() => onOpenChange(false)}
            isSaving={isSaving}
          />
        ) : card ? (
          <RateCardEditForm
            key={card.id}
            card={card}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            onSaved={() => onOpenChange(false)}
            isSaving={isSaving}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RateCardEditForm({
  card,
  onCancel,
  onSubmit,
  onSaved,
  isSaving,
}: {
  card: UsageRateCardDto;
  onCancel: () => void;
  onSubmit: (request: UpsertUsageRateCardRequest) => Promise<unknown>;
  onSaved: () => void;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.rateCard");
  const [draft, setDraft] = useState<RateCardDraft>(() => draftFromCard(card));
  const [error, setError] = useState<string | null>(null);

  const identity = useMemo(() => {
    const scope =
      card.sourceLanguageCode || card.targetLanguageCode
        ? ` · ${card.sourceLanguageCode ?? "*"}→${card.targetLanguageCode ?? "*"}`
        : "";
    return `${card.chargeType} · ${card.provider}${card.model ? ` · ${card.model}` : ""} · ${t("perUnit", { unit: card.unit })}${scope}`;
  }, [card, t]);

  const set = <K extends keyof RateCardDraft>(key: K, value: RateCardDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // Preview-before-save. A change to cost or markup changes what real usage is charged, so it is
  // priced by the server first — and a preview of other numbers than the ones saved does not count.
  const previewMutation = usePreviewAdminRateCard();
  const [preview, setPreview] = useState<{ inputs: PricingInputs; result: RateCardPreviewDto } | null>(
    null,
  );
  const storedInputs: PricingInputs = {
    providerUnitCostUsd: card.providerUnitCostUsd,
    markupMultiplier: card.markupMultiplier,
  };
  const optionalNumber = (value: string) => (value.trim() === "" ? null : toNumber(value));
  const draftInputs: PricingInputs = {
    providerUnitCostUsd: optionalNumber(draft.providerUnitCostUsd),
    markupMultiplier: optionalNumber(draft.markupMultiplier),
  };
  const previewable = previewableInputs(draftInputs);
  const saveGate = canSaveRateCard(storedInputs, draftInputs, preview?.inputs ?? null);

  const handlePreview = async () => {
    if (!previewable) return;
    try {
      setError(null);
      const result = await previewMutation.mutateAsync(previewable);
      setPreview({ inputs: previewable, result });
    } catch (err) {
      setPreview(null);
      setError(getErrorMessage(err, t("errors.previewFailed")));
    }
  };

  const handleSave = async () => {
    if (!saveGate.ok) {
      setError(
        saveGate.reason === "preview-stale"
          ? t("errors.previewStale")
          : t("errors.previewRequired"),
      );
      return;
    }
    const unitPrice = toNumber(draft.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError(t("errors.unitPriceInvalid"));
      return;
    }

    // Blank means "not recorded", which the column stores as null and the margin reader treats as
    // an unknown rather than a zero. Only a typed value is parsed.
    const cost = draft.providerUnitCostUsd.trim() === "" ? null : toNumber(draft.providerUnitCostUsd);
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
      setError(t("errors.providerCostInvalid"));
      return;
    }

    const markup = draft.markupMultiplier.trim() === "" ? null : toNumber(draft.markupMultiplier);
    if (markup != null && (!Number.isFinite(markup) || markup <= 0)) {
      setError(t("errors.markupInvalid"));
      return;
    }

    try {
      setError(null);
      await onSubmit({
        // The identity, returned exactly as it was read. The service matches on these and refuses
        // a combination it has not seen — it cannot create a rate card, only update one.
        chargeType: card.chargeType,
        unit: card.unit,
        provider: card.provider,
        model: card.model,
        sourceLanguageCode: card.sourceLanguageCode,
        targetLanguageCode: card.targetLanguageCode,
        currency: draft.currency,
        unitPrice,
        providerUnitCostUsd: cost,
        markupMultiplier: markup,
        isActive: draft.isActive,
      });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, t("errors.saveFailed")));
    }
  };

  return (
    <>
        <div className="mt-4 grid gap-4">
            <p className="rounded-lg border border-hairline/60 bg-surface-2 px-3 py-2 font-mono text-[11px] text-ink-muted">
              {identity}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("fields.unitPrice")} htmlFor="card-price">
                <Input
                  id="card-price"
                  inputMode="decimal"
                  value={draft.unitPrice}
                  onChange={(event) => set("unitPrice", event.target.value)}
                />
              </Field>
              <Field label={t("fields.currency")} htmlFor="card-currency">
                <select
                  id="card-currency"
                  value={draft.currency}
                  onChange={(event) => set("currency", event.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface-1 px-3 text-[13px] text-ink outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {PLAN_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("fields.providerCost")}
                htmlFor="card-cost"
                hint={t("fields.providerCostHint")}
              >
                <Input
                  id="card-cost"
                  inputMode="decimal"
                  value={draft.providerUnitCostUsd}
                  onChange={(event) => set("providerUnitCostUsd", event.target.value)}
                />
              </Field>
              <Field
                label={t("fields.markup")}
                htmlFor="card-markup"
                hint={t("fields.markupHint")}
              >
                <Input
                  id="card-markup"
                  inputMode="decimal"
                  value={draft.markupMultiplier}
                  onChange={(event) => set("markupMultiplier", event.target.value)}
                />
              </Field>
            </div>

        <div className="rounded-lg border border-hairline/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-ink">{t("preview.heading")}</p>
              <p className="mt-0.5 text-[11px] text-ink-subtle">
                {previewable ? t("preview.hintReady") : t("preview.hintNotReady")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePreview()}
              disabled={!previewable || previewMutation.isPending || isSaving}
            >
              {previewMutation.isPending ? t("preview.pricing") : t("preview.button")}
            </Button>
          </div>
          {preview ? (
            <dl
              className={cn(
                "mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]",
                !saveGate.ok && "opacity-50",
              )}
            >
              <dt className="text-ink-muted">{t("preview.creditsPerUnit")}</dt>
              <dd className="text-right tabular-nums text-ink">{preview.result.unitPriceCredits}</dd>
              <dt className="text-ink-muted">{t("preview.customerPrice")}</dt>
              <dd className="text-right tabular-nums text-ink">
                {formatAdminMoney({ amount: preview.result.customerPriceVnd, currency: "VND" })}{" "}
                {t("preview.vndSuffix")}
              </dd>
              <dt className="text-ink-muted">{t("preview.providerCost")}</dt>
              <dd className="text-right tabular-nums text-ink">
                {formatAdminMoney({ amount: preview.result.providerCostVnd, currency: "VND" })}{" "}
                {t("preview.vndSuffix")}
              </dd>
              <dt className="text-ink-muted">{t("preview.margin")}</dt>
              <dd
                className={cn(
                  "text-right font-semibold tabular-nums",
                  preview.result.marginVnd < 0 ? "text-destructive" : "text-ink",
                )}
              >
                {formatAdminMoney({ amount: preview.result.marginVnd, currency: "VND" })} ·{" "}
                {formatMarginRatio(preview.result.marginRatio)}
              </dd>
              <dt className="col-span-2 mt-1 font-mono text-[10px] text-ink-subtle">
                {t("preview.formulaLine", {
                  formula: preview.result.formula,
                  fx: preview.result.fxRateUsdVnd,
                  credit: preview.result.creditValueVnd,
                })}
              </dt>
            </dl>
          ) : null}
        </div>

        <ToggleField
          label={t("fields.active")}
          hint={t("fields.activeHint")}
          checked={draft.isActive}
          onChange={(next) => set("isActive", next)}
        />

        <FormError message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving || !saveGate.ok}>
          {isSaving ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * The provider cost of a credit-unit (CRD) card, and nothing else.
 *
 * These are the cards usage is actually settled on, and the only ones admin Insights can compute AI
 * provider cost from. Their credit price is set by hand rather than derived from cost × markup, so
 * the full form above — whose preview and save gate reprice the card from its cost — does not apply.
 * What saving does to history depends on whether the card already had a cost; the form says which
 * before the admin commits, because "applies to all past usage" is not something to learn afterwards.
 */
function CreditRateCardCostForm({
  card,
  onCancel,
  onSubmit,
  onSaved,
  isSaving,
}: {
  card: UsageRateCardDto;
  onCancel: () => void;
  onSubmit: (id: string, providerUnitCostUsd: number) => Promise<unknown>;
  onSaved: () => void;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.rateCard");
  const [draft, setDraft] = useState(
    card.providerUnitCostUsd == null ? "" : String(card.providerUnitCostUsd),
  );
  const [error, setError] = useState<string | null>(null);
  const unit = card.unit || t("creditCost.noUnit");
  const cost = parseProviderCostUsd(draft);
  const effect = cost == null ? null : providerCostEffect(card, cost);

  const handleSave = async () => {
    if (!card.unit) {
      setError(t("creditCost.errors.noUnit"));
      return;
    }
    if (cost == null) {
      setError(t("creditCost.errors.invalid"));
      return;
    }
    if (effect === "unchanged") {
      onSaved();
      return;
    }
    try {
      setError(null);
      await onSubmit(card.id, cost);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, t("errors.saveFailed")));
    }
  };

  return (
    <>
      <div className="mt-4 grid gap-4">
        <p className="rounded-lg border border-hairline/60 bg-surface-2 px-3 py-2 font-mono text-[11px] text-ink-muted">
          {card.chargeType} · {t("perUnit", { unit })} · {card.unitPrice} {card.currency}
        </p>

        <Field
          label={t("creditCost.field", { unit })}
          htmlFor="credit-card-cost"
          hint={t("creditCost.hint", { unit })}
        >
          <Input
            id="credit-card-cost"
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </Field>

        {effect && effect !== "unchanged" ? (
          <p className="rounded-lg border border-hairline/60 px-3 py-2 text-[12px] text-ink-muted">
            {effect === "backfill" ? t("creditCost.effectBackfill") : t("creditCost.effectSupersede")}
          </p>
        ) : null}

        <FormError message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving || cost == null || !card.unit}>
          {isSaving ? t("saving") : t("creditCost.save")}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Retiring a rate card. Typed confirmation, because it is the least reversible write on the page:
 * the card leaves the active list the moment it is retired, and this screen reads only that list,
 * so nothing here can bring it back. Until a new rate is published for the identity, usage that
 * resolves to it cannot be priced and is not charged.
 */
export function RateCardDeactivateDialog({
  card,
  onOpenChange,
  onConfirm,
  isSaving,
}: {
  card: UsageRateCardDto | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (card: UsageRateCardDto) => Promise<unknown>;
  isSaving: boolean;
}) {
  return (
    <Dialog open={card !== null} onOpenChange={(next) => (isSaving ? undefined : onOpenChange(next))}>
      <DialogContent className="gap-0 sm:max-w-md">
        {card ? (
          <RateCardDeactivateForm
            key={card.id}
            card={card}
            isSaving={isSaving}
            onCancel={() => onOpenChange(false)}
            onConfirm={async () => {
              await onConfirm(card);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RateCardDeactivateForm({
  card,
  isSaving,
  onCancel,
  onConfirm,
}: {
  card: UsageRateCardDto;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.deactivate");
  const tRateCard = useTranslations("adminPlansSettings.pricingEditors.rateCard");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === card.chargeType;

  const handleConfirm = async () => {
    if (!matches) return;
    try {
      setError(null);
      await onConfirm();
    } catch (err) {
      setError(getErrorMessage(err, t("error")));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3">
        <p className="rounded-lg border border-hairline/60 bg-surface-2 px-3 py-2 font-mono text-[11px] text-ink-muted">
          {card.chargeType} · {card.provider}
          {card.model ? ` · ${card.model}` : ""} · {tRateCard("perUnit", { unit: card.unit })} ·{" "}
          {formatAdminMoney({ amount: card.unitPrice, currency: card.currency })} ({card.currency})
        </p>
        <Field label={t("confirmLabel", { chargeType: card.chargeType })} htmlFor="card-deactivate-confirm">
          <Input
            id="card-deactivate-confirm"
            className="font-mono"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={isSaving}
          />
        </Field>
        <FormError message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("back")}
        </Button>
        <Button variant="destructive" onClick={() => void handleConfirm()} disabled={!matches || isSaving}>
          {isSaving ? t("deactivating") : t("confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── pricing config ──────────────────────────────────────────────────────── */

/**
 * The twelve knobs the endpoint accepts, in the order they are read on screen.
 *
 * `formula` and `resolverKey` are on the DTO and not here on purpose: they describe how the config
 * was resolved rather than what it holds, and `UpdatePricingConfigRequest` has no room for them.
 */
const CONFIG_FIELD_KEYS: (keyof UpdatePricingConfigRequest)[] = [
  "fxRateUsdVnd",
  "creditValueVnd",
  "minimumPricePerCreditVnd",
  "minimumContractPriceVnd",
  "minimumContractPriceUsd",
  "salesUsageWeight",
  "salesMembersWeight",
  "salesLanguagesWeight",
  "salesAiServicesWeight",
  "defaultOverageCapRatio",
  "defaultInvoiceTermsDays",
  "defaultInvoiceGraceHours",
];

function useConfigFields(
  t: ReturnType<typeof useTranslations>,
): { key: keyof UpdatePricingConfigRequest; label: string; hint?: string }[] {
  return useMemo(
    () =>
      CONFIG_FIELD_KEYS.map((key) => {
        const hint = t.has(`fields.${key}.hint`) ? t(`fields.${key}.hint`) : undefined;
        return { key, label: t(`fields.${key}.label`), hint };
      }),
    [t],
  );
}

export function PricingConfigDialog({
  config,
  open,
  onOpenChange,
  onSubmit,
  isSaving,
}: {
  config: PricingConfigDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: UpdatePricingConfigRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.config");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        {config ? (
          <PricingConfigForm
            config={config}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            onSaved={() => onOpenChange(false)}
            isSaving={isSaving}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PricingConfigForm({
  config,
  onCancel,
  onSubmit,
  onSaved,
  isSaving,
}: {
  config: PricingConfigDto;
  onCancel: () => void;
  onSubmit: (request: UpdatePricingConfigRequest) => Promise<unknown>;
  onSaved: () => void;
  isSaving: boolean;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.config");
  const configFields = useConfigFields(t);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(configFields.map(({ key }) => [key, String(config[key])])),
  );
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed: Partial<UpdatePricingConfigRequest> = {};
    for (const { key, label } of configFields) {
      const value = toNumber(draft[key] ?? "");
      if (!Number.isFinite(value)) {
        setError(t("numberError", { label }));
        return;
      }
      if (value < 0) {
        setError(t("negativeError", { label }));
        return;
      }
      parsed[key] = value;
    }

    try {
      setError(null);
      await onSubmit(parsed as UpdatePricingConfigRequest);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, t("saveError")));
    }
  };

  return (
    <>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {configFields.map(({ key, label, hint }) => (
            <Field key={key} label={label} hint={hint} htmlFor={`config-${key}`}>
              <Input
                id={`config-${key}`}
                inputMode="decimal"
                value={draft[key] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </Field>
          ))}
        </div>

        <FormError message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
