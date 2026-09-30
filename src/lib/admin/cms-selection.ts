/**
 * Bulk selection for the CMS lists: which rows are ticked, what "select all" means on a filtered
 * page, and dropping ids that a refetch or a filter took off screen.
 *
 * Free of React and `@/` imports so `node:test` runs it.
 */

export function toggleOne(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}

/** "Select all" ticks every visible row; when all visible rows are ticked it clears them. */
export function toggleAll(selected: readonly string[], visible: readonly string[]): string[] {
  const allOn = visible.length > 0 && visible.every((id) => selected.includes(id));
  if (allOn) return selected.filter((id) => !visible.includes(id));
  return [...selected, ...visible.filter((id) => !selected.includes(id))];
}

export type HeaderState = "none" | "some" | "all";

export function headerState(selected: readonly string[], visible: readonly string[]): HeaderState {
  const on = visible.filter((id) => selected.includes(id)).length;
  if (on === 0) return "none";
  return on === visible.length ? "all" : "some";
}

/** A selection only ever holds rows the admin can see: acting on hidden rows is a surprise. */
export function prune(selected: readonly string[], visible: readonly string[]): string[] {
  const next = selected.filter((id) => visible.includes(id));
  return next.length === selected.length ? (selected as string[]) : next;
}

export type ListView = "cards" | "table";

export function parseListView(value: string | null | undefined): ListView {
  return value === "table" ? "table" : "cards";
}
