/**
 * Contracts for the admin workspace page (ERP-style detail): the money overview it leads with and
 * the actions an operator takes on one tenant.
 *
 * Mirrors three services, each gated server-side by the platform system-admin POLICY:
 *
 *   billing          ~/admin/billing/workspaces/{id}/overview | credits/adjust |
 *                    subscription/{change-plan, extend-trial, comp, entitlements} |
 *                    invoices/{invoiceId}/mark-paid
 *   workspace        ~/admin/workspaces/{id}/{transfer-ownership, notices, notes, timeline, export}
 *   auth             ~/admin/users/workspaces/{id}/revoke-sessions
 *
 * Every write carries a reason and is recorded in the platform audit log before it takes effect;
 * the actor is the token's, never the body's. Money is VND; a null amount is "cannot be computed"
 * (its note says why) and renders as "—", never as 0.
 */

import type { InvoiceDto } from "@/types/billing";
import type { AdminCreditTransactionDto } from "@/types/admin-workspace-analytics";
import type { AdminWorkspaceDetailDto, AdminWorkspaceMemberDto } from "@/types/admin-workspace";

export interface AdminWorkspaceMoneyDto {
  amount: number | null;
  currency: string;
  note: string | null;
}

export interface AdminWorkspaceSubscriptionSummaryDto {
  id: string;
  planId: string;
  planName: string;
  planSlug: string;
  billingCycle: string;
  status: string;
  serviceState: string;
  suspendedReason: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  creditsRemaining: number;
  creditsUsedThisCycle: number;
  creditsPerCycle: number;
  /**
   * Credits kept from this subscription after it ended without a renewal (billing
   * CreditFreezeService): not spendable, restored on renewal, never deleted. 0 on a live plan.
   * Optional because an older billing build does not send it.
   */
  frozenCredits?: number;
  creditsFrozenAt?: string | null;
  /** Set once frozen credits outlived the grace window. Still kept. */
  frozenCreditsDormantAt?: string | null;
}

export interface AdminWorkspaceInvoiceSummaryDto {
  open: number;
  overdue: number;
  outstanding: AdminWorkspaceMoneyDto;
  nextDueAt: string | null;
  oldestOverdueDays: number | null;
}

/** One UTC day of the burn chart. `balanceAfter` is null on a day with no ledger rows. */
export interface AdminWorkspaceBurnPointDto {
  date: string;
  consumed: number;
  granted: number;
  balanceAfter: number | null;
}

export interface AdminWorkspaceEntitlementDto {
  key: string;
  value: string;
  source: string;
  /** The contract override on the subscription (layer 3), when one is set. */
  contractOverride: string | null;
}

export interface AdminWorkspaceBillingOverviewDto {
  workspaceId: string;
  from: string;
  to: string;
  subscription: AdminWorkspaceSubscriptionSummaryDto | null;
  revenueLifetime: AdminWorkspaceMoneyDto;
  paymentsLifetime: number;
  revenueInPeriod: AdminWorkspaceMoneyDto;
  paymentsInPeriod: number;
  aiProviderCostInPeriod: AdminWorkspaceMoneyDto;
  grossMarginInPeriod: AdminWorkspaceMoneyDto;
  creditsConsumedInPeriod: number;
  invoices: AdminWorkspaceInvoiceSummaryDto;
  burn: AdminWorkspaceBurnPointDto[];
  entitlements: AdminWorkspaceEntitlementDto[];
}

export interface AdminWorkspaceBillingActionResultDto {
  action: string;
  subscription: AdminWorkspaceSubscriptionSummaryDto | null;
  ledgerEntry: AdminCreditTransactionDto | null;
  invoice: InvoiceDto | null;
  entitlements: AdminWorkspaceEntitlementDto[] | null;
}

export interface AdminWorkspaceTimelineEntryDto {
  kind: "action" | "note";
  id: string;
  at: string;
  action: string | null;
  sourceService: string | null;
  entityType: string | null;
  entityId: string | null;
  result: string | null;
  /** The action's reason, or the note's body. */
  text: string;
  actorId: string;
  actorName: string | null;
  before: Record<string, string | null> | null;
  after: Record<string, string | null> | null;
}

export interface AdminWorkspaceNoteDto {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
}

export interface AdminWorkspaceNoticeResultDto {
  ownerId: string;
  notificationId: string | null;
  sentAt: string;
}

export interface AdminWorkspaceExportDto {
  generatedAt: string;
  generatedBy: string;
  workspace: AdminWorkspaceDetailDto;
  members: AdminWorkspaceMemberDto[];
  timeline: AdminWorkspaceTimelineEntryDto[];
}

export interface AdminWorkspaceSignOutResultDto {
  workspaceId: string;
  signedOut: string[];
  failed: { userId: string; error: string }[];
}

/** A limit is a whole number; a capability is on or off; null clears the contract override. */
export type EntitlementOverrideValue = number | boolean | null;
