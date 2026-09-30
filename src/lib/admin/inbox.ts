/**
 * G12 pending-work inbox — pure view helpers for /admin/inbox and the sidebar badge. Relative
 * imports only: scripts/test-admin-internal-mgmt.mjs imports this without a bundler.
 */

import type { InboxCountsDto, InboxItemDto, InboxPriority } from "../../types/admin-inbox.ts";

export const PRIORITY_RANK: Readonly<Record<InboxPriority, number>> = { urgent: 3, high: 2, normal: 1, low: 0 };

/** Which queue an item sits in on the page: open work, snoozed until later, or closed by hand. */
export type InboxState = "open" | "snoozed" | "done";

export function inboxState(item: Pick<InboxItemDto, "done" | "snoozed">): InboxState {
  if (item.done) return "done";
  if (item.snoozed) return "snoozed";
  return "open";
}

export type SlaState = "overdue" | "dueSoon" | "onTrack" | "none";

/** Due within this many hours counts as "due soon". */
export const DUE_SOON_HOURS = 24;

export function slaState(item: Pick<InboxItemDto, "dueAt">, now: Date = new Date()): SlaState {
  if (!item.dueAt) return "none";
  const due = new Date(item.dueAt).getTime();
  if (Number.isNaN(due)) return "none";
  const diff = due - now.getTime();
  if (diff < 0) return "overdue";
  if (diff <= DUE_SOON_HOURS * 3_600_000) return "dueSoon";
  return "onTrack";
}

export type AgeBucket = "today" | "days1to3" | "days3to7" | "week";

export function ageBucket(occurredAt: string, now: Date = new Date()): AgeBucket {
  const hours = (now.getTime() - new Date(occurredAt).getTime()) / 3_600_000;
  if (hours < 24) return "today";
  if (hours < 72) return "days1to3";
  if (hours < 168) return "days3to7";
  return "week";
}

export const AGE_BUCKETS: readonly AgeBucket[] = ["today", "days1to3", "days3to7", "week"];

/** "3 h", "2 d", "5 w" — how long it has waited. */
export function compactAge(occurredAt: string, now: Date = new Date()): { value: number; unit: "m" | "h" | "d" | "w" } {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(occurredAt).getTime()) / 60_000));
  if (minutes < 60) return { value: minutes, unit: "m" };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { value: hours, unit: "h" };
  const days = Math.floor(hours / 24);
  if (days < 21) return { value: days, unit: "d" };
  return { value: Math.floor(days / 7), unit: "w" };
}

/** "unassigned", "me" or the assignee's id — the value the assignee filter and grouping read. */
export function assigneeKey(item: Pick<InboxItemDto, "triage">, viewerId: string | null | undefined): string {
  const id = item.triage.assigneeId;
  if (!id) return "unassigned";
  return viewerId && id === viewerId ? "me" : id;
}

/**
 * Accessors for the list toolkit's client-side filtering. The inbox is bounded (each source returns
 * at most 200 items) and already aggregated by the server, so filtering it in the browser is the
 * right place — there is no larger table behind it to page through.
 */
export function inboxAccessors(viewerId: string | null | undefined, now: Date = new Date()) {
  return {
    search: (item: InboxItemDto) => [item.title, item.detail, item.customer, item.type, item.triage.assigneeName],
    filters: {
      type: (item: InboxItemDto) => item.type,
      priority: (item: InboxItemDto) => item.priority,
      source: (item: InboxItemDto) => item.source,
      assignee: (item: InboxItemDto) => assigneeKey(item, viewerId),
      age: (item: InboxItemDto) => ageBucket(item.occurredAt, now),
      sla: (item: InboxItemDto) => slaState(item, now),
    },
    sort: {
      priority: (item: InboxItemDto) => PRIORITY_RANK[item.priority] ?? 0,
      due: (item: InboxItemDto) => (item.dueAt ? new Date(item.dueAt) : null),
      age: (item: InboxItemDto) => new Date(item.occurredAt),
      type: (item: InboxItemDto) => item.type,
    },
  };
}

/** Items of one scope ("mine" = assigned to the viewer) and one state. */
export function scopeItems(
  items: readonly InboxItemDto[],
  scope: "mine" | "all",
  state: InboxState,
  viewerId: string | null | undefined,
): InboxItemDto[] {
  return items.filter(
    (item) => inboxState(item) === state && (scope === "all" || (viewerId && item.triage.assigneeId === viewerId)),
  );
}

/** The sidebar pill: open items (or 99+), nothing when there are none. */
export function inboxBadge(counts: InboxCountsDto | null | undefined): string | null {
  if (!counts || counts.open <= 0) return null;
  return counts.open > 99 ? "99+" : String(counts.open);
}

export type SnoozePreset = "laterToday" | "tomorrow" | "nextWeek" | "nextMonth";
export const SNOOZE_PRESETS: readonly SnoozePreset[] = ["laterToday", "tomorrow", "nextWeek", "nextMonth"];

/** When a preset wakes an item, in the viewer's own clock: 3 hours, 9:00 tomorrow, 9:00 next Monday, in 30 days. */
export function snoozeUntil(preset: SnoozePreset, now: Date = new Date()): Date {
  const at9 = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0, 0, 0);
  switch (preset) {
    case "laterToday":
      return new Date(now.getTime() + 3 * 3_600_000);
    case "tomorrow":
      return at9(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    case "nextWeek": {
      const daysToMonday = ((8 - now.getDay()) % 7) || 7;
      return at9(new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday));
    }
    case "nextMonth":
      return at9(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
  }
}
