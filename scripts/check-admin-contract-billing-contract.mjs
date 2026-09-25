#!/usr/bin/env node
/**
 * Contracts, bank-transfer settlement and rate-card lifecycle: the wiring, not the logic.
 *
 * The logic is unit-tested (contract-billing.test.ts, rate-card-preview.test.ts). What those tests
 * cannot see is whether anything calls it — and this codebase has shipped the same defect
 * repeatedly: a correct endpoint, a correct helper, and no button (mark-paid worked for months
 * while nothing called it). So each write is checked end to end by source: endpoint → service →
 * hook → a confirmation dialog on a rendered page.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(root, rel), "utf8");

const [endpoints, service, hooks, component, detail, pricingService, pricingHooks, editors, plans] =
  await Promise.all([
    read("src/lib/api/endpoints.ts"),
    read("src/services/admin-contract-billing.service.ts"),
    read("src/hooks/use-admin-contract-billing.ts"),
    read("src/components/admin/workspace-contract-billing.tsx"),
    read("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx"),
    read("src/services/admin-pricing.service.ts"),
    read("src/hooks/use-admin-pricing.ts"),
    read("src/components/admin/pricing-editors.tsx"),
    read("src/app/(app)/admin/plans/page.tsx"),
  ]);

// ── routes, as the billing controllers declare them ──────────────────────────
assert.match(endpoints, /createContract: "\/subscriptions\/contract"/);
assert.match(endpoints, /`\/subscriptions\/workspace\/\$\{workspaceId\}\/contract-terms`/);
// Mark-paid goes through the audited admin route (reason required, recorded before it settles),
// scoped to the workspace in the route — not the bare, role-string-gated /invoices/{id}/mark-paid.
assert.match(
  endpoints,
  /markPaid: \(workspaceId: string, invoiceId: string\) =>\s*`\/admin\/billing\/workspaces\/\$\{workspaceId\}\/invoices\/\$\{invoiceId\}\/mark-paid`/,
);
assert.match(endpoints, /`\/usages\/rate-card\/\$\{id\}\/deactivate`/);
assert.match(endpoints, /rateCardPreview: "\/usages\/rate-card\/preview"/);
assert.match(endpoints, /`\/usages\/rate-card\/\$\{id\}\/provider-cost`/);

// ── services use the verbs the controllers accept ────────────────────────────
assert.match(service, /apiClient\.post<[\s\S]*?API\.adminSubscriptions\.createContract/);
assert.match(service, /apiClient\.put<[\s\S]*?API\.adminSubscriptions\.contractTerms/);
assert.match(service, /API\.adminInvoices\.markPaid\(workspaceId, invoiceId\),\s*\{ reason \}/);
assert.match(pricingService, /apiClient\.post<UsageRateCardDto>\(\s*API\.adminPricing\.rateCardDeactivate/);
assert.match(pricingService, /apiClient\.post<RateCardPreviewDto>\(\s*API\.adminPricing\.rateCardPreview/);
assert.match(pricingService, /apiClient\.put<UsageRateCardDto>\(\s*API\.adminPricing\.rateCardProviderCost/);

// POST /payments creates a pending, list-priced, invoiceless payment. It is not a reconciliation.
assert.doesNotMatch(service, /["'`]\/payments["'`]/, "manual payment creation must not be wired");

// A missing subscription is the state a contract is created in — not an error screen.
assert.match(hooks, /BILLING_SUBSCRIPTION_NOT_FOUND/);

// ── the page renders it ──────────────────────────────────────────────────────
assert.match(detail, /<WorkspaceContractBilling[\s\S]*?ownerId=\{workspace\.owner\.id\}/);
for (const hook of [
  "useCreateAdminContract",
  "useUpdateAdminContractTerms",
  "useMarkAdminInvoicePaid",
  "useResumeAdminWorkspaceService",
]) {
  assert.match(component, new RegExp(`${hook}\\(`), `${hook} must be called from the Billing tab`);
}

// ── money writes are confirmed with the amount and currency spelled out ──────
assert.match(component, /draftFromSubscription\(subscription\)/, "terms must be seeded from stored overrides");
assert.match(component, /describeContractTermsChanges\(/, "terms must be reviewed before saving");
assert.match(component, /invoiceConfirmationMatches\(invoice, typed\)/, "mark paid must be typed-confirmed");
assert.match(component, /validateReason\(reason\)/, "mark paid must carry a reason for the audit log");
assert.match(component, /markPaid\.mutateAsync\(\{ invoiceId: invoice\.id, reason \}\)/);
assert.match(component, /spellMoney\(\{ amount: invoice\.total, currency: invoice\.currency \}\)/);
assert.match(component, /canMarkInvoicePaid\(invoice\)/, "mark paid is offered on open invoices only");

// ── rate-card lifecycle ──────────────────────────────────────────────────────
assert.match(pricingHooks, /export function useDeactivateAdminRateCard/);
assert.match(pricingHooks, /export function usePreviewAdminRateCard/);
assert.match(plans, /<RateCardDeactivateDialog/);
assert.match(plans, /deactivateRateCard\.mutateAsync\(card\.id\)/);
assert.match(editors, /canSaveRateCard\(/, "rate-card saves must be gated on a current preview");
assert.match(editors, /disabled=\{isSaving \|\| !saveGate\.ok\}/);

// ── credit-unit (CRD) cards: the provider cost Insights computes AI cost from ─
assert.match(pricingHooks, /export function useSetAdminRateCardProviderCost/);
assert.match(plans, /setRateCardProviderCost\.mutateAsync\(\{ id, request: \{ providerUnitCostUsd \} \}\)/);
assert.match(editors, /isCreditRateCard\(card\)/, "a CRD card must not open the repricing editor");
assert.match(editors, /providerCostEffect\(card, cost\)/, "the form must say whether history is affected");

console.log("Admin contract billing contract passed.");
