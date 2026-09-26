/**
 * G12 pending-work inbox — the workspace service's contract
 * (WarpTalk.WorkspaceService.Application.DTOs.Admin.AdminInboxDtos, WarpTalk.Shared.Contracts.Admin.AdminInbox).
 * Items are read live from their owning services; only the triage is stored.
 */

export const INBOX_SOURCES = ["billing", "providers", "expenses", "staff", "content", "operations"] as const;
export type InboxSource = (typeof INBOX_SOURCES)[number];

export const INBOX_TYPES = [
  "sales_lead",
  "invoice_past_due",
  "invoice_awaiting_payment",
  "payment_disputed",
  "trial_ending",
  "subscription_ending",
  "subscription_suspended",
  "provider_incident",
  "provider_quota",
  "expense_due",
  "staff_invitation",
  "announcement_scheduled",
  "announcement_draft",
  "broadcast_failed",
  "dead_letter",
  "paid_credits_frozen",
] as const;
export type InboxItemType = (typeof INBOX_TYPES)[number];

export const INBOX_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type InboxPriority = (typeof INBOX_PRIORITIES)[number];

export type InboxSourceStatus = "ok" | "unavailable" | "forbidden";

export interface InboxSourceStatusDto {
  source: string;
  status: InboxSourceStatus;
  itemCount: number;
  truncated: boolean;
  durationMs: number;
  error: string | null;
}

export interface InboxTriageDto {
  assigneeId: string | null;
  assigneeName: string | null;
  assignedAt: string | null;
  snoozedUntil: string | null;
  doneAt: string | null;
  doneBy: string | null;
  noteCount: number;
  lastNoteAt: string | null;
}

export interface InboxItemDto {
  key: string;
  source: string;
  type: string;
  /** English, from the source; the page shows it as the detail under a localized type label. */
  title: string;
  detail: string | null;
  workspaceId: string | null;
  customer: string | null;
  occurredAt: string;
  dueAt: string | null;
  priority: InboxPriority;
  /** Always a path under /admin (the server replaces anything else). */
  href: string;
  /** true: leaves the inbox by itself once handled on its page, so "mark done" is not offered. */
  naturalCompletion: boolean;
  amount: number | null;
  currency: string | null;
  overdue: boolean;
  snoozed: boolean;
  done: boolean;
  triage: InboxTriageDto;
}

export interface InboxCountsDto {
  open: number;
  mine: number;
  unassigned: number;
  overdue: number;
  snoozed: number;
  done: number;
}

export interface InboxDto {
  generatedAt: string;
  viewerId: string;
  items: InboxItemDto[];
  sources: InboxSourceStatusDto[];
  counts: InboxCountsDto;
}

export interface InboxSummaryDto {
  generatedAt: string;
  counts: InboxCountsDto;
  unavailableSources: number;
}

export interface InboxNoteDto {
  id: string;
  itemKey: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
}
