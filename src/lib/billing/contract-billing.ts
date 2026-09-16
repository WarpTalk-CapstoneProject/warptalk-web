/**
 * Contract terms and bank-transfer settlement, as decisions rather than as form plumbing.
 *
 * Three rules live here because each has a wrong answer that type-checks:
 *
 *  1. `PUT /contract-terms` REPLACES all six overrides (`ApplyContractTerms` assigns every one).
 *     A form that sent only the field an admin touched would clear the other five back to the
 *     plan's defaults — the same failure `PUT /plans/{id}` already shipped once. So a draft is
 *     always seeded from the stored subscription, and a draft nobody edited parses back to exactly
 *     what was stored.
 *
 *  2. Blank is not zero. A blank field means "no override, use the plan"; a typed 0 on the
 *     overage cap means "no overage at all". The two are different contracts.
 *
 *  3. Money is spelled with its currency on every confirmation. The contract price is VND by name
 *     (`ContractPriceVnd`); an invoice's currency is whatever the invoice row says. Neither is
 *     assumed from the other — checkout currency was hardcoded once already.
 *
 * Deliberately free of React so `node:test` can exercise it without a renderer.
 */

import { formatAdminMoney, type AdminMoneyLike } from "./admin-money.ts";

export interface ContractTermsValues {
  creditsPerCycleOverride: number | null;
  contractPriceVnd: number | null;
  overageCapCreditsOverride: number | null;
  overagePricePerCreditOverride: number | null;
  invoiceTermsDaysOverride: number | null;
  billingContactEmail: string | null;
}

/** Every key the request carries, in the order they are shown. The test pins this against the type. */
export const CONTRACT_TERMS_KEYS = [
  "contractPriceVnd",
  "creditsPerCycleOverride",
  "overageCapCreditsOverride",
  "overagePricePerCreditOverride",
  "invoiceTermsDaysOverride",
  "billingContactEmail",
] as const satisfies readonly (keyof ContractTermsValues)[];

export type ContractTermsDraft = Record<keyof ContractTermsValues, string>;

export const CONTRACT_TERMS_LABELS: Record<keyof ContractTermsValues, string> = {
  contractPriceVnd: "Contract price per cycle (VND)",
  creditsPerCycleOverride: "Credits per cycle",
  overageCapCreditsOverride: "Overage cap (credits)",
  overagePricePerCreditOverride: "Overage price per credit (VND)",
  invoiceTermsDaysOverride: "Invoice terms (days)",
  billingContactEmail: "Billing contact email",
};

/** Any record carrying the six stored overrides — a SubscriptionDto, or nothing yet. */
export type ContractTermsSource = Partial<Record<keyof ContractTermsValues, number | string | null>>;

/**
 * The form's starting point: the STORED overrides, never the effective values.
 *
 * Seeding from `effectiveContractPriceVnd` would look identical on screen and then write the
 * plan's current price into the override on save — pinning the contract to a number the plan was
 * free to change.
 */
export function draftFromSubscription(source: ContractTermsSource | null | undefined): ContractTermsDraft {
  const read = (key: keyof ContractTermsValues) => {
    const value = source?.[key];
    return value == null ? "" : String(value);
  };
  return {
    contractPriceVnd: read("contractPriceVnd"),
    creditsPerCycleOverride: read("creditsPerCycleOverride"),
    overageCapCreditsOverride: read("overageCapCreditsOverride"),
    overagePricePerCreditOverride: read("overagePricePerCreditOverride"),
    invoiceTermsDaysOverride: read("invoiceTermsDaysOverride"),
    billingContactEmail: read("billingContactEmail"),
  };
}

export function termsFromSubscription(source: ContractTermsSource | null | undefined): ContractTermsValues {
  const parsed = parseContractTermsDraft(draftFromSubscription(source));
  // A stored record the server accepted parses; if it somehow does not, report it as all-default
  // rather than inventing values.
  return parsed.ok
    ? parsed.terms
    : {
        creditsPerCycleOverride: null,
        contractPriceVnd: null,
        overageCapCreditsOverride: null,
        overagePricePerCreditOverride: null,
        invoiceTermsDaysOverride: null,
        billingContactEmail: null,
      };
}

export type ParseResult =
  | { ok: true; terms: ContractTermsValues }
  | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseNumber(raw: string): number | null | typeof Number.NaN {
  const trimmed = raw.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  return Number(trimmed);
}

/**
 * Draft → request, with the server's own refusals (`ValidateContractTerms`) checked first so the
 * common mistakes read as a sentence instead of "Subscription contract terms are invalid."
 *
 * The cross-field rules that need the plan and the pricing config (price-per-credit floor, overage
 * price not below the plan's) stay on the server; its message is shown verbatim.
 */
export function parseContractTermsDraft(draft: ContractTermsDraft): ParseResult {
  const credits = parseNumber(draft.creditsPerCycleOverride);
  if (credits !== null && (!Number.isInteger(credits) || credits <= 0))
    return { ok: false, error: "Credits per cycle must be a whole number above zero, or blank for the plan's." };

  const price = parseNumber(draft.contractPriceVnd);
  if (price !== null && (!Number.isFinite(price) || price < 0))
    return { ok: false, error: "Contract price must be an amount in VND, or blank for the plan's price." };
  if (price !== null && !Number.isInteger(price))
    return { ok: false, error: "Contract price is in VND, which has no minor unit — use a whole amount." };

  const cap = parseNumber(draft.overageCapCreditsOverride);
  if (cap !== null && (!Number.isInteger(cap) || cap < 0))
    return { ok: false, error: "Overage cap must be a whole number of credits (0 turns overage off), or blank." };

  const overagePrice = parseNumber(draft.overagePricePerCreditOverride);
  if (overagePrice !== null && (!Number.isFinite(overagePrice) || overagePrice < 0))
    return { ok: false, error: "Overage price must be an amount in VND per credit, or blank." };

  const days = parseNumber(draft.invoiceTermsDaysOverride);
  if (days !== null && (!Number.isInteger(days) || days <= 0))
    return { ok: false, error: "Invoice terms must be a whole number of days above zero, or blank." };

  const email = draft.billingContactEmail.trim();
  if (email !== "" && !EMAIL.test(email))
    return { ok: false, error: "Billing contact email is not a valid address." };

  if (cap !== null && credits !== null && cap > credits)
    return { ok: false, error: "The overage cap cannot exceed the credits granted per cycle." };

  return {
    ok: true,
    terms: {
      creditsPerCycleOverride: credits,
      contractPriceVnd: price,
      overageCapCreditsOverride: cap,
      overagePricePerCreditOverride: overagePrice,
      invoiceTermsDaysOverride: days,
      billingContactEmail: email === "" ? null : email,
    },
  };
}

const numberFormatter = new Intl.NumberFormat("en-US");

/** An amount with its currency written out, not just its symbol: "₫12,000,000 (VND)". */
export function spellMoney(money: AdminMoneyLike): string {
  return `${formatAdminMoney(money)} (${money.currency.toUpperCase()})`;
}

/** How one override reads on a confirmation. Null is named as the fallback it is. */
export function formatContractTerm(key: keyof ContractTermsValues, value: number | string | null): string {
  if (value == null) return "Plan default";
  switch (key) {
    case "contractPriceVnd":
    case "overagePricePerCreditOverride":
      return spellMoney({ amount: Number(value), currency: "VND" });
    case "creditsPerCycleOverride":
    case "overageCapCreditsOverride":
      return `${numberFormatter.format(Number(value))} credits`;
    case "invoiceTermsDaysOverride":
      return `${numberFormatter.format(Number(value))} days`;
    case "billingContactEmail":
      return String(value);
  }
}

export interface ContractTermChange {
  key: keyof ContractTermsValues;
  label: string;
  from: string;
  to: string;
}

/** Only what actually moves. An empty list means the save would change nothing. */
export function describeContractTermsChanges(
  before: ContractTermsValues,
  after: ContractTermsValues,
): ContractTermChange[] {
  return CONTRACT_TERMS_KEYS.filter((key) => before[key] !== after[key]).map((key) => ({
    key,
    label: CONTRACT_TERMS_LABELS[key],
    from: formatContractTerm(key, before[key]),
    to: formatContractTerm(key, after[key]),
  }));
}

/* ── invoices ─────────────────────────────────────────────────────────────── */

export interface InvoiceLike {
  status: string;
  total: number;
  currency: string;
  invoiceNumber: string;
}

/**
 * Whether "Mark paid" is honest to offer.
 *
 * Only an OPEN invoice. The endpoint would accept a void or uncollectible one too — it checks
 * nothing but "already paid" — and marking a voided invoice paid is recording money against a
 * charge that was cancelled.
 */
export function canMarkInvoicePaid(invoice: Pick<InvoiceLike, "status">): boolean {
  return invoice.status.trim().toLowerCase() === "open";
}

/** Whether an open invoice is past its due date — the one the overdue sweeper suspends on. */
export function isInvoiceOverdue(
  invoice: { status: string; dueAt: string | null },
  now: Date = new Date(),
): boolean {
  if (!canMarkInvoicePaid(invoice) || !invoice.dueAt) return false;
  return new Date(invoice.dueAt).getTime() < now.getTime();
}

/**
 * The typed confirmation for settling an invoice: the invoice number itself, compared exactly
 * apart from surrounding whitespace and case. Typing it is what makes an admin read which invoice
 * — and therefore which amount — they are about to record as received.
 */
export function invoiceConfirmationMatches(invoice: Pick<InvoiceLike, "invoiceNumber">, typed: string): boolean {
  const expected = invoice.invoiceNumber.trim().toLowerCase();
  return expected.length > 0 && typed.trim().toLowerCase() === expected;
}
