/**
 * Drag-and-drop on the Preview tab decides the ladder's order (owner, 3 Oct 2026: "the sort-order
 * field is hard to use — drag the cards").
 *
 * The result is the `sortOrder` every plan needs for the new order, and ONLY the plans whose number
 * changes: each one is a full-replacement PUT, so touching a plan that did not move is a needless
 * write. Numbers are spaced by 10 so a later single move rarely renumbers the whole ladder.
 */
import type { PlanDto } from "../../types/billing.ts";

export const SORT_STEP = 10;

/** `ids` reordered by moving `movedId` to where `targetId` is. */
export function moveId(ids: readonly string[], movedId: string, targetId: string): string[] {
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, movedId);
  return next;
}

export function sortOrderUpdates(
  plans: readonly Pick<PlanDto, "id" | "sortOrder">[],
  orderedIds: readonly string[],
): { id: string; sortOrder: number }[] {
  const current = new Map(plans.map((plan) => [plan.id, plan.sortOrder]));
  return orderedIds
    .map((id, index) => ({ id, sortOrder: (index + 1) * SORT_STEP }))
    .filter(({ id, sortOrder }) => current.has(id) && current.get(id) !== sortOrder);
}

/** Where a new plan goes: after everything there is. */
export function nextSortOrder(plans: readonly Pick<PlanDto, "sortOrder">[]): number {
  const highest = plans.reduce((max, plan) => Math.max(max, plan.sortOrder ?? 0), 0);
  return (Math.floor(highest / SORT_STEP) + 1) * SORT_STEP;
}
