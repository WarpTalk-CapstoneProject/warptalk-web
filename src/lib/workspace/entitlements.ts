/**
 * Display rules for the workspace Features page.
 *
 * READ-ONLY BY DESIGN. Billing's EntitlementResolver is the only code allowed to decide an
 * entitlement; this file only names and formats what it decided. Nothing here may compare a value
 * against a plan, re-order layers, or fill in a missing one — a key the server did not send is
 * not shown as "Not included", and a snapshot that has not arrived is not shown as defaults.
 *
 * Imports stay relative: the node-run contract test has no bundler to resolve `@/`.
 */

import type { WorkspaceEntitlementDto, WorkspaceEntitlementKind } from "../../types/workspace-entitlements.ts";

export type EntitlementGroup = "Meetings" | "AI and voice" | "Other";

interface CatalogEntry {
  label: string;
  description: string;
  group: EntitlementGroup;
  /** Plural noun for a numeric limit, e.g. "languages". */
  unit?: string;
  unitSingular?: string;
}

/**
 * The keys billing publishes today (EntitlementConstants.Keys.All). A key missing from here still
 * renders, under "Other" with a readable name, so a capability added in billing is visible before
 * anyone writes its copy.
 */
export const ENTITLEMENT_CATALOG: Record<string, CatalogEntry> = {
  max_active_rooms: {
    label: "Active meetings",
    description: "Meetings that can run at the same time.",
    group: "Meetings",
    unit: "meetings",
    unitSingular: "meeting",
  },
  max_participants: {
    label: "Participants per meeting",
    description: "People who can join a single meeting.",
    group: "Meetings",
    unit: "participants",
    unitSingular: "participant",
  },
  max_languages: {
    label: "Target languages per meeting",
    description: "Languages a meeting can translate into at once.",
    group: "Meetings",
    unit: "languages",
    unitSingular: "language",
  },
  voice_clone: {
    label: "Voice cloning",
    description: "Dub translated speech in each speaker's own voice.",
    group: "AI and voice",
  },
  ai_assistant: {
    label: "AI assistant",
    description: "WarpBot answers, summaries and suggestions in meetings.",
    group: "AI and voice",
  },
  glossary: {
    label: "Custom glossary",
    description: "Workspace terms that translation keeps consistent.",
    group: "AI and voice",
  },
};

export const ENTITLEMENT_GROUP_ORDER: EntitlementGroup[] = ["Meetings", "AI and voice", "Other"];

export type EntitlementSourceKind = "plan" | "contract" | "platform" | "workspace" | "unknown";

export interface EntitlementSourceLabel {
  kind: EntitlementSourceKind;
  label: string;
  /** Longer explanation, suitable for a tooltip. */
  detail: string;
}

/** Optional translator, defaulted to English so the node:test contract for this file (and any
 * caller that has not been migrated to next-intl) keeps working unchanged. */
export type EntitlementTranslator = (key: string, values?: Record<string, string>) => string;

const DEFAULT_ENTITLEMENT_COPY: Record<string, (values?: Record<string, string>) => string> = {
  "source.unknown.label": () => "Unknown",
  "source.unknown.detail": () => "The source of this value was not reported.",
  "source.plan.label": () => "Plan",
  "source.plan.detail": (v) => `Set by the ${v!.name} plan.`,
  "source.platformDefault.label": () => "Platform default",
  "source.platformDefault.detail": () =>
    "No active plan or contract sets this, so the platform default applies.",
  "source.contract.label": () => "Contract",
  "source.contract.detail": () => "Set by this workspace's negotiated contract.",
  "source.workspaceOverride.label": () => "Workspace limit",
  "source.workspaceOverride.detail": () => "A workspace owner lowered this below what the plan allows.",
  "source.unknownNamed.detail": (v) => `Reported source: ${v!.source}.`,
  "value.included": () => "Included",
  "value.notIncluded": () => "Not included",
  "value.unlimited": () => "Unlimited",
};

function defaultT(key: string, values?: Record<string, string>): string {
  return DEFAULT_ENTITLEMENT_COPY[key]?.(values) ?? key;
}

export function describeSource(
  source: string | null | undefined,
  t: EntitlementTranslator = defaultT,
): EntitlementSourceLabel {
  if (!source) {
    return { kind: "unknown", label: t("source.unknown.label"), detail: t("source.unknown.detail") };
  }
  if (source.startsWith("plan:")) {
    const slug = source.slice("plan:".length);
    const name = slug && slug !== "unknown" ? humanize(slug) : "your plan";
    return { kind: "plan", label: t("source.plan.label"), detail: t("source.plan.detail", { name }) };
  }
  switch (source) {
    case "platform_default":
      return {
        kind: "platform",
        label: t("source.platformDefault.label"),
        detail: t("source.platformDefault.detail"),
      };
    case "contract_override":
      return {
        kind: "contract",
        label: t("source.contract.label"),
        detail: t("source.contract.detail"),
      };
    case "workspace_override":
      return {
        kind: "workspace",
        label: t("source.workspaceOverride.label"),
        detail: t("source.workspaceOverride.detail"),
      };
    default:
      return {
        kind: "unknown",
        label: humanize(source),
        detail: t("source.unknownNamed.detail", { source }),
      };
  }
}

export interface FormattedEntitlementValue {
  text: string;
  /** "included" / "excluded" for a capability, "limit" / "unlimited" for a number. */
  state: "included" | "excluded" | "limit" | "unlimited" | "text";
}

/**
 * A limit of 0 or less is not enforced anywhere in the backend (meeting creation checks `> 0`),
 * so it reads as Unlimited rather than as a limit of zero.
 */
export function formatEntitlementValue(
  key: string,
  kind: WorkspaceEntitlementKind,
  value: string,
  t: EntitlementTranslator = defaultT,
  locale = "en-US",
): FormattedEntitlementValue {
  if (kind === "flag") {
    return value.toLowerCase() === "true"
      ? { text: t("value.included"), state: "included" }
      : { text: t("value.notIncluded"), state: "excluded" };
  }
  if (kind === "limit") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return { text: value, state: "text" };
    if (parsed <= 0) return { text: t("value.unlimited"), state: "unlimited" };
    const entry = ENTITLEMENT_CATALOG[key];
    const count = parsed.toLocaleString(locale);
    if (!entry?.unit) return { text: count, state: "limit" };
    if (t !== defaultT) {
      return { text: t(`catalog.${key}.unit`, { count: String(parsed) }), state: "limit" };
    }
    const noun = parsed === 1 ? (entry.unitSingular ?? entry.unit) : entry.unit;
    return { text: `${count} ${noun}`, state: "limit" };
  }
  return { text: value, state: "text" };
}

export interface EntitlementRow {
  key: string;
  label: string;
  description: string | null;
  value: FormattedEntitlementValue;
  source: EntitlementSourceLabel;
  /** Present only when an owner's limit sits under a known ceiling. */
  ceiling: { value: FormattedEntitlementValue; source: EntitlementSourceLabel } | null;
  /** An owner's limit whose ceiling the snapshot does not carry yet. */
  ceilingUnknown: boolean;
}

export interface EntitlementSection {
  group: EntitlementGroup;
  rows: EntitlementRow[];
}

export function buildEntitlementSections(
  entitlements: WorkspaceEntitlementDto[],
  t: EntitlementTranslator = defaultT,
  locale = "en-US",
): EntitlementSection[] {
  const byGroup = new Map<EntitlementGroup, EntitlementRow[]>();

  for (const item of entitlements) {
    const entry = ENTITLEMENT_CATALOG[item.key];
    const group = entry?.group ?? "Other";
    const isOverride = item.source === "workspace_override";
    const row: EntitlementRow = {
      key: item.key,
      label: entry ? (t !== defaultT ? t(`catalog.${item.key}.label`) : entry.label) : humanize(item.key),
      description: entry
        ? (t !== defaultT ? t(`catalog.${item.key}.description`) : entry.description)
        : null,
      value: formatEntitlementValue(item.key, item.kind, item.value, t, locale),
      source: describeSource(item.source, t),
      ceiling:
        isOverride && item.ceiling != null
          ? {
              value: formatEntitlementValue(item.key, item.kind, item.ceiling, t, locale),
              source: describeSource(item.ceilingSource, t),
            }
          : null,
      ceilingUnknown: isOverride && item.ceiling == null,
    };
    const rows = byGroup.get(group) ?? [];
    rows.push(row);
    byGroup.set(group, rows);
  }

  const catalogOrder = Object.keys(ENTITLEMENT_CATALOG);
  return ENTITLEMENT_GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
    group,
    rows: (byGroup.get(group) ?? []).sort((a, b) => {
      const ai = catalogOrder.indexOf(a.key);
      const bi = catalogOrder.indexOf(b.key);
      if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }),
  }));
}

function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}
