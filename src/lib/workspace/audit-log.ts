/**
 * Pure helpers for the workspace audit log page: how an action reads, and how the filter bar's
 * date inputs become the API's half-open [from, to) range.
 *
 * Relative imports only — the node test runner has no bundler.
 */

/** "all" rather than "": a Radix Select item cannot carry an empty value. */
export const AUDIT_ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "suspend", label: "Workspace suspended" },
  { value: "reactivate", label: "Workspace reactivated" },
  { value: "delete", label: "Workspace deleted" },
] as const;

export const AUDIT_ENTITY_OPTIONS = [
  { value: "all", label: "All targets" },
  { value: "workspace", label: "Workspace" },
  { value: "credit_adjustment", label: "Credits" },
] as const;

const ACTION_LABELS: Record<string, string> = {
  suspend: "Workspace suspended",
  reactivate: "Workspace reactivated",
  delete: "Workspace deleted",
};

const ENTITY_LABELS: Record<string, string> = {
  workspace: "Workspace",
  credit_adjustment: "Credits",
};

/** "credit.adjusted" → "Credit adjusted". Unknown verbs still read as words, never as a slug. */
function humanize(value: string) {
  const spaced = value.replace(/[._-]+/g, " ").trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Optional translator, defaulted to English so the node:test contract for this file (and any
 * caller that has not been migrated to next-intl) keeps working unchanged. */
export type AuditLogTranslator = (key: string) => string | undefined;

export function auditActionLabel(action: string, t: AuditLogTranslator = () => undefined) {
  return t(`action.${action}`) ?? ACTION_LABELS[action] ?? humanize(action);
}

export function auditEntityLabel(entityType: string, t: AuditLogTranslator = () => undefined) {
  return t(`entity.${entityType}`) ?? ENTITY_LABELS[entityType] ?? humanize(entityType);
}

/** Translated filter options, same value set and order as the untranslated constants above. */
export function getAuditActionOptions(t: AuditLogTranslator) {
  return AUDIT_ACTION_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`actionOption.${option.value}`) ?? option.label,
  }));
}

export function getAuditEntityOptions(t: AuditLogTranslator) {
  return AUDIT_ENTITY_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`entityOption.${option.value}`) ?? option.label,
  }));
}

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A `<input type="date">` value is a calendar day in the reader's own time zone. `from` is the
 * start of that day; `to` is the start of the NEXT day, because the API range is exclusive at the
 * top and "to 16 Sep" means "including 16 Sep". Invalid or empty input yields undefined.
 */
export function dateInputToRangeBound(value: string, bound: "from" | "to"): string | undefined {
  const match = DATE_INPUT.exec(value);
  if (!match) return undefined;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d) + (bound === "to" ? 1 : 0));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** Mirrors the backend: from must be strictly earlier than to. */
export function isDateRangeInverted(fromInput: string, toInput: string) {
  const from = dateInputToRangeBound(fromInput, "from");
  const to = dateInputToRangeBound(toInput, "to");
  return Boolean(from && to && from >= to);
}
