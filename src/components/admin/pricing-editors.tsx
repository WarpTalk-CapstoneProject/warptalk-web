"use client";

/**
 * The three write surfaces on Plans & pricing.
 *
 * Kept out of the page because each one is a form over a body the server replaces wholesale, and
 * the rules about what may and may not be retyped differ per form:
 *
 *   PlanEditDialog        every column, laid over the stored plan so nothing unseen is reset
 *   RateCardEditDialog    price and margin only — the identity columns are the upsert key
 *   PricingConfigDialog   the twelve knobs the endpoint accepts, not the two it computes
 *
 * None of them creates anything. There is no POST behind any of these screens: plans and rate-card
 * identities arrive by migration, and a form that offered to add one would be offering something
 * the API refuses.
 */

import { useMemo, useState } from "react";

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
import { getErrorMessage } from "@/lib/api/errors";
import {
  PLAN_BILLING_CYCLE,
  PLAN_CURRENCIES,
  applyPlanEdits,
  validatePlanRequest,
} from "@/lib/billing/plan-request";
import { cn } from "@/lib/utils";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit plan</DialogTitle>
          <DialogDescription>
            Saving replaces the whole plan. Members on it keep their subscription; the new terms
            apply from their next cycle.
          </DialogDescription>
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
      setError(getErrorMessage(err, "The plan could not be saved."));
    }
  };

  return (
    <>
        <div className="mt-4 grid gap-5">
            <Section title="Identity">
              <Field label="Name" htmlFor="plan-name">
                <Input
                  id="plan-name"
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                />
              </Field>
              <Field label="Slug" htmlFor="plan-slug" hint="Lowercase, digits and hyphens.">
                <Input
                  id="plan-slug"
                  value={draft.slug}
                  onChange={(event) => set("slug", event.target.value)}
                />
              </Field>
              <Field label="Tier" htmlFor="plan-tier">
                <Input
                  id="plan-tier"
                  value={draft.tier}
                  onChange={(event) => set("tier", event.target.value)}
                />
              </Field>
              <Field label="Sort order" htmlFor="plan-sort" hint="Where it sits on the pricing page.">
                <Input
                  id="plan-sort"
                  inputMode="numeric"
                  value={draft.sortOrder}
                  onChange={(event) => set("sortOrder", event.target.value)}
                />
              </Field>
              <ToggleField
                label="Active"
                hint="Hidden plans stay on old invoices. This is how a plan is retired — there is no delete."
                checked={draft.isActive}
                onChange={(next) => set("isActive", next)}
              />
            </Section>

            <Section title="Price">
              <Field label="Price" htmlFor="plan-price">
                <Input
                  id="plan-price"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(event) => set("price", event.target.value)}
                />
              </Field>
              <Field label="Currency" htmlFor="plan-currency">
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
                label="Billing cycle"
                htmlFor="plan-cycle"
                hint="Monthly only — the update endpoint accepts no other value."
                className="sm:col-span-2"
              >
                <Input id="plan-cycle" value={PLAN_BILLING_CYCLE} disabled readOnly />
              </Field>
            </Section>

            <Section title="Credits and overage">
              <Field label="Credits per cycle" htmlFor="plan-credits">
                <Input
                  id="plan-credits"
                  inputMode="numeric"
                  value={draft.creditsPerCycle}
                  onChange={(event) => set("creditsPerCycle", event.target.value)}
                />
              </Field>
              <Field
                label="Overage cap (credits)"
                htmlFor="plan-overage-cap"
                hint="Zero means the plan allows no overage."
              >
                <Input
                  id="plan-overage-cap"
                  inputMode="numeric"
                  value={draft.overageCapCredits}
                  onChange={(event) => set("overageCapCredits", event.target.value)}
                />
              </Field>
              <Field label="Overage price per credit" htmlFor="plan-overage-price">
                <Input
                  id="plan-overage-price"
                  inputMode="decimal"
                  value={draft.overagePricePerCredit}
                  onChange={(event) => set("overagePricePerCredit", event.target.value)}
                />
              </Field>
              <Field
                label="Low-balance threshold"
                htmlFor="plan-low-balance"
                hint="Must sit above the overage cap, or the warning lands after billing starts."
              >
                <Input
                  id="plan-low-balance"
                  inputMode="numeric"
                  value={draft.lowBalanceThresholdCredits}
                  onChange={(event) => set("lowBalanceThresholdCredits", event.target.value)}
                />
              </Field>
              <Field label="Rollover cap (credits)" htmlFor="plan-rollover">
                <Input
                  id="plan-rollover"
                  inputMode="numeric"
                  value={draft.rolloverCapCredits}
                  onChange={(event) => set("rolloverCapCredits", event.target.value)}
                />
              </Field>
            </Section>

            <Section title="Invoicing">
              <Field label="Terms (days)" htmlFor="plan-terms">
                <Input
                  id="plan-terms"
                  inputMode="numeric"
                  value={draft.invoiceTermsDays}
                  onChange={(event) => set("invoiceTermsDays", event.target.value)}
                />
              </Field>
              <Field label="Grace (hours)" htmlFor="plan-grace">
                <Input
                  id="plan-grace"
                  inputMode="numeric"
                  value={draft.invoiceGraceHours}
                  onChange={(event) => set("invoiceGraceHours", event.target.value)}
                />
              </Field>
            </Section>

            <Section title="Limits">
              <Field label="Max participants" htmlFor="plan-participants">
                <Input
                  id="plan-participants"
                  inputMode="numeric"
                  value={draft.maxParticipants}
                  onChange={(event) => set("maxParticipants", event.target.value)}
                />
              </Field>
              <Field label="Max languages" htmlFor="plan-languages" hint="Between 1 and 3.">
                <Input
                  id="plan-languages"
                  inputMode="numeric"
                  value={draft.maxLanguages}
                  onChange={(event) => set("maxLanguages", event.target.value)}
                />
              </Field>
            </Section>

            <Section title="Entitlements">
              <ToggleField
                label="Voice cloning"
                checked={draft.voiceCloneEnabled}
                onChange={(next) => set("voiceCloneEnabled", next)}
              />
              <ToggleField
                label="AI assistant"
                checked={draft.aiAssistantEnabled}
                onChange={(next) => set("aiAssistantEnabled", next)}
              />
              <ToggleField
                label="Glossary"
                checked={draft.glossaryEnabled}
                onChange={(next) => set("glossaryEnabled", next)}
              />
              <ToggleField
                label="Dedicated GPU"
                checked={draft.dedicatedGpu}
                onChange={(next) => set("dedicatedGpu", next)}
              />
              <Field
                label="Features"
                htmlFor="plan-features"
                hint="The JSON blob the pricing page reads. An array or an object."
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
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save plan"}
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
  isSaving,
}: {
  card: UsageRateCardDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: UpsertUsageRateCardRequest) => Promise<unknown>;
  isSaving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit rate card</DialogTitle>
          <DialogDescription>
            What this unit sells for and what it costs to serve. The charge type, provider and
            model identify the card and cannot be retyped here — a new billing identity arrives
            with the migration that registers it.
          </DialogDescription>
        </DialogHeader>

        {card ? (
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
  const [draft, setDraft] = useState<RateCardDraft>(() => draftFromCard(card));
  const [error, setError] = useState<string | null>(null);

  const identity = useMemo(() => {
    const scope =
      card.sourceLanguageCode || card.targetLanguageCode
        ? ` · ${card.sourceLanguageCode ?? "*"}→${card.targetLanguageCode ?? "*"}`
        : "";
    return `${card.chargeType} · ${card.provider}${card.model ? ` · ${card.model}` : ""} · per ${card.unit}${scope}`;
  }, [card]);

  const set = <K extends keyof RateCardDraft>(key: K, value: RateCardDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    const unitPrice = toNumber(draft.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Unit price must be a positive amount.");
      return;
    }

    // Blank means "not recorded", which the column stores as null and the margin reader treats as
    // an unknown rather than a zero. Only a typed value is parsed.
    const cost = draft.providerUnitCostUsd.trim() === "" ? null : toNumber(draft.providerUnitCostUsd);
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
      setError("Provider cost must be a positive amount in USD, or left blank.");
      return;
    }

    const markup = draft.markupMultiplier.trim() === "" ? null : toNumber(draft.markupMultiplier);
    if (markup != null && (!Number.isFinite(markup) || markup <= 0)) {
      setError("Markup multiplier must be above zero, or left blank.");
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
      setError(getErrorMessage(err, "The rate card could not be saved."));
    }
  };

  return (
    <>
        <div className="mt-4 grid gap-4">
            <p className="rounded-lg border border-hairline/60 bg-surface-2 px-3 py-2 font-mono text-[11px] text-ink-muted">
              {identity}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Unit price" htmlFor="card-price">
                <Input
                  id="card-price"
                  inputMode="decimal"
                  value={draft.unitPrice}
                  onChange={(event) => set("unitPrice", event.target.value)}
                />
              </Field>
              <Field label="Currency" htmlFor="card-currency">
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
                label="Provider cost (USD)"
                htmlFor="card-cost"
                hint="Blank means no cost is recorded. Not the same as zero."
              >
                <Input
                  id="card-cost"
                  inputMode="decimal"
                  value={draft.providerUnitCostUsd}
                  onChange={(event) => set("providerUnitCostUsd", event.target.value)}
                />
              </Field>
              <Field
                label="Markup multiplier"
                htmlFor="card-markup"
                hint="What the margin column reports. Blank leaves it to be derived, or left unknown."
              >
                <Input
                  id="card-markup"
                  inputMode="decimal"
                  value={draft.markupMultiplier}
                  onChange={(event) => set("markupMultiplier", event.target.value)}
                />
              </Field>
            </div>

        <ToggleField
          label="Active"
          hint="An inactive card stops being charged against; the row stays for the invoices that used it."
          checked={draft.isActive}
          onChange={(next) => set("isActive", next)}
        />

        <FormError message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save rate card"}
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
const CONFIG_FIELDS: {
  key: keyof UpdatePricingConfigRequest;
  label: string;
  hint?: string;
}[] = [
  { key: "fxRateUsdVnd", label: "FX rate USD→VND", hint: "How a USD provider cost is read in VND." },
  { key: "creditValueVnd", label: "Credit value (VND)" },
  {
    key: "minimumPricePerCreditVnd",
    label: "Minimum price per credit (VND)",
    hint: "The floor a VND plan's price ÷ credits is checked against.",
  },
  { key: "minimumContractPriceVnd", label: "Minimum contract price (VND)" },
  { key: "minimumContractPriceUsd", label: "Minimum contract price (USD)" },
  { key: "salesUsageWeight", label: "Sales weight · usage" },
  { key: "salesMembersWeight", label: "Sales weight · members" },
  { key: "salesLanguagesWeight", label: "Sales weight · languages" },
  { key: "salesAiServicesWeight", label: "Sales weight · AI services" },
  { key: "defaultOverageCapRatio", label: "Default overage cap ratio" },
  { key: "defaultInvoiceTermsDays", label: "Default invoice terms (days)" },
  { key: "defaultInvoiceGraceHours", label: "Default invoice grace (hours)" },
];

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit pricing configuration</DialogTitle>
          <DialogDescription>
            Platform-wide. These are the floors and rates every plan is validated against and every
            quote is built from, so a change here can make an existing plan invalid on its next
            edit.
          </DialogDescription>
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
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(CONFIG_FIELDS.map(({ key }) => [key, String(config[key])])),
  );
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed: Partial<UpdatePricingConfigRequest> = {};
    for (const { key, label } of CONFIG_FIELDS) {
      const value = toNumber(draft[key] ?? "");
      if (!Number.isFinite(value)) {
        setError(`${label} must be a number.`);
        return;
      }
      if (value < 0) {
        setError(`${label} cannot be negative.`);
        return;
      }
      parsed[key] = value;
    }

    try {
      setError(null);
      await onSubmit(parsed as UpdatePricingConfigRequest);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "The pricing configuration could not be saved."));
    }
  };

  return (
    <>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {CONFIG_FIELDS.map(({ key, label, hint }) => (
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
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save configuration"}
        </Button>
      </DialogFooter>
    </>
  );
}
