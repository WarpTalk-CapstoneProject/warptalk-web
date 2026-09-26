/**
 * Pure logic for the platform settings console (/admin/settings): the client-side mirror of the
 * server's value rules, how a value reads, search, the "changed from default" filter, the diff a
 * confirmation shows, the export/import file, and the console's URL state.
 *
 * THE SERVER IS THE AUTHORITY. `SettingValueValidator` (WarpTalk.Shared.PlatformSettings) runs on
 * every write, import and revert; this module applies the same rules so an operator sees "must be
 * at most 240 minutes" while typing instead of after a round-trip. When the two disagree, the
 * server's 400 is what the console shows.
 *
 * Relative imports only: `src/lib/admin/__tests__/platform-settings.test.ts` runs under plain node.
 */

import { bestMatchScore, matchesSearch } from "./search-text.ts";
import {
  PLATFORM_SETTING_CATEGORIES,
  PLATFORM_SETTINGS_EXPORT_FORMAT,
  PLATFORM_SETTING_SCOPES,
  type FeatureFlagValue,
  type PlatformSettingCategory,
  type PlatformSettingDto,
  type PlatformSettingScope,
  type PlatformSettingsExportEntryDto,
  type SettingJson,
} from "../../types/admin-platform-settings.ts";

/** Same bar as the server (PlatformSettingsAdminService.MinReasonLength). */
export const MIN_SETTING_REASON_LENGTH = 10;
export const MAX_SETTING_REASON_LENGTH = 1000;

/** FeatureFlagValue: at most this many ids or slugs per list. */
export const MAX_FLAG_LIST_ITEMS = 500;
const MAX_TEXT_LENGTH = 2000;
const PLAN_SLUG = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FLAG_FIELDS = ["enabled", "rolloutPercent", "allowPlans", "allowWorkspaces", "denyWorkspaces"] as const;
export const FLAG_LIST_FIELDS = ["allowPlans", "allowWorkspaces", "denyWorkspaces"] as const;
export type FlagListField = (typeof FLAG_LIST_FIELDS)[number];

type SettingRules = Pick<
  PlatformSettingDto,
  "type" | "min" | "max" | "unit" | "allowedValues" | "maxLength" | "pattern"
>;

// ── Validation ──────────────────────────────────────────────────────────────────────────────────

/**
 * Why a value is refused, as a code the page localizes plus the numbers the sentence needs.
 * Mirrors SettingValueValidator message for message.
 */
export type SettingValidationError =
  | { code: "expectedBoolean" }
  | { code: "expectedInteger" }
  | { code: "expectedNumber" }
  | { code: "min"; min: number; unit: string | null }
  | { code: "max"; max: number; unit: string | null }
  | { code: "expectedText" }
  | { code: "tooLong"; maxLength: number; index?: number }
  | { code: "controlCharacters"; index?: number }
  | { code: "pattern"; index?: number }
  | { code: "notAllowed"; value: string; allowed: string[] }
  | { code: "expectedList" }
  | { code: "tooManyEntries"; maxLength: number }
  | { code: "entryNotText"; index: number }
  | { code: "entryEmpty"; index: number }
  | { code: "duplicate"; value: string }
  | { code: "expectedFlag" }
  | { code: "flagUnknownField"; field: string }
  | { code: "flagEnabled" }
  | { code: "flagRollout" }
  | { code: "flagList"; field: FlagListField }
  | { code: "flagListTooLong"; field: FlagListField; maxLength: number }
  | { code: "flagWorkspaceIds"; field: FlagListField }
  | { code: "flagPlanSlugs" };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// char.IsControl: C0 and C1 control characters. Tab, CR and LF are allowed.
function hasControlCharacters(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code <= 0x1f || (code >= 0x7f && code <= 0x9f)) && char !== "\n" && char !== "\r" && char !== "\t") return true;
  }
  return false;
}

/**
 * The registry's patterns are .NET regular expressions. The ones in use are plain enough to mean
 * the same thing in JavaScript; one that does not compile here is left to the server.
 */
function matchesPattern(pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern).test(text);
  } catch {
    return true;
  }
}

function validateText(rules: SettingRules, text: string, index?: number): SettingValidationError | null {
  const at = index === undefined ? {} : { index };
  if (rules.type === "string" && rules.maxLength != null && text.length > rules.maxLength) {
    return { code: "tooLong", maxLength: rules.maxLength, ...at };
  }
  if (text.length > MAX_TEXT_LENGTH) return { code: "tooLong", maxLength: MAX_TEXT_LENGTH, ...at };
  if (hasControlCharacters(text)) return { code: "controlCharacters", ...at };
  if (rules.pattern && text.length > 0 && !matchesPattern(rules.pattern, text)) return { code: "pattern", ...at };
  return null;
}

function validateNumber(rules: SettingRules, value: unknown, integral: boolean): SettingValidationError | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return { code: integral ? "expectedInteger" : "expectedNumber" };
  if (integral && !Number.isInteger(value)) return { code: "expectedInteger" };
  if (rules.min != null && value < rules.min) return { code: "min", min: rules.min, unit: rules.unit };
  if (rules.max != null && value > rules.max) return { code: "max", max: rules.max, unit: rules.unit };
  return null;
}

function validateList(rules: SettingRules, value: unknown): SettingValidationError | null {
  if (!Array.isArray(value)) return { code: "expectedList" };
  if (rules.maxLength != null && value.length > rules.maxLength) return { code: "tooManyEntries", maxLength: rules.maxLength };
  const seen = new Set<string>();
  for (let i = 0; i < value.length; i += 1) {
    const index = i + 1;
    const item = value[i];
    if (typeof item !== "string") return { code: "entryNotText", index };
    if (item.trim().length === 0) return { code: "entryEmpty", index };
    if (rules.allowedValues && !rules.allowedValues.includes(item)) {
      return { code: "notAllowed", value: item, allowed: [...rules.allowedValues] };
    }
    const textError = validateText(rules, item, index);
    if (textError) return textError;
    const folded = item.toLowerCase();
    if (seen.has(folded)) return { code: "duplicate", value: item };
    seen.add(folded);
  }
  return null;
}

function validateFlag(value: unknown): SettingValidationError | null {
  if (!isPlainObject(value)) return { code: "expectedFlag" };
  for (const field of Object.keys(value)) {
    if (!(FLAG_FIELDS as readonly string[]).includes(field)) return { code: "flagUnknownField", field };
  }
  if (typeof value.enabled !== "boolean") return { code: "flagEnabled" };
  if ("rolloutPercent" in value) {
    const percent = value.rolloutPercent;
    if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100) return { code: "flagRollout" };
  }
  for (const field of FLAG_LIST_FIELDS) {
    if (!(field in value)) continue;
    const list = value[field];
    if (!Array.isArray(list)) return { code: "flagList", field };
    if (list.length > MAX_FLAG_LIST_ITEMS) return { code: "flagListTooLong", field, maxLength: MAX_FLAG_LIST_ITEMS };
    for (const item of list) {
      if (typeof item !== "string" || item.trim().length === 0) return { code: "flagList", field };
      if (field === "allowPlans" ? !PLAN_SLUG.test(item) : !GUID.test(item)) {
        return field === "allowPlans" ? { code: "flagPlanSlugs" } : { code: "flagWorkspaceIds", field };
      }
    }
  }
  return null;
}

/** Null when the server would accept `value` for this setting, otherwise why not. */
export function validateSettingValue(rules: SettingRules, value: unknown): SettingValidationError | null {
  switch (rules.type) {
    case "boolean":
      return typeof value === "boolean" ? null : { code: "expectedBoolean" };
    case "integer":
      return validateNumber(rules, value, true);
    case "decimal":
      return validateNumber(rules, value, false);
    case "string":
      return typeof value === "string" ? validateText(rules, value) : { code: "expectedText" };
    case "enum":
      if (typeof value !== "string") return { code: "notAllowed", value: String(value), allowed: [...(rules.allowedValues ?? [])] };
      return rules.allowedValues?.includes(value) ? null : { code: "notAllowed", value, allowed: [...(rules.allowedValues ?? [])] };
    case "string_list":
      return validateList(rules, value);
    case "feature_flag":
      return validateFlag(value);
    default:
      return { code: "expectedText" };
  }
}

/** A number field's text as a number, or null when it is not one. Accepts "1,5" as 1.5. */
export function parseNumberDraft(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "" || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Splits a pasted block ("a@x.vn, b@x.vn\nc@x.vn") into trimmed, non-empty entries. */
export function splitListInput(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// ── Feature flags ───────────────────────────────────────────────────────────────────────────────

export interface NormalizedFlag {
  enabled: boolean;
  rolloutPercent: number;
  allowPlans: string[];
  allowWorkspaces: string[];
  denyWorkspaces: string[];
}

/** A flag with every field present. An absent rollout is 100, as FeatureFlagValue reads it. */
export function normalizeFlag(value: SettingJson | null | undefined): NormalizedFlag {
  const source = isPlainObject(value) ? (value as Partial<FeatureFlagValue>) : {};
  const list = (items: unknown) => (Array.isArray(items) ? items.filter((item): item is string => typeof item === "string") : []);
  return {
    enabled: source.enabled === true,
    rolloutPercent: typeof source.rolloutPercent === "number" ? source.rolloutPercent : 100,
    allowPlans: list(source.allowPlans),
    allowWorkspaces: list(source.allowWorkspaces),
    denyWorkspaces: list(source.denyWorkspaces),
  };
}

/** The flag as the server stores it (FeatureFlagValue.ToJson): every field, in its order. */
export function flagToJson(flag: NormalizedFlag): { [key: string]: SettingJson } {
  return {
    enabled: flag.enabled,
    rolloutPercent: flag.rolloutPercent,
    allowPlans: [...flag.allowPlans],
    allowWorkspaces: [...flag.allowWorkspaces],
    denyWorkspaces: [...flag.denyWorkspaces],
  };
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────────

/** The words a formatted value needs; English by default, the page passes the localized ones. */
export interface SettingValueWords {
  on: string;
  off: string;
  empty: string;
  none: string;
  rollout: (percent: number) => string;
  plans: (count: number) => string;
  workspaces: (count: number) => string;
  denied: (count: number) => string;
}

export const ENGLISH_VALUE_WORDS: SettingValueWords = {
  on: "On",
  off: "Off",
  empty: "(empty)",
  none: "None",
  rollout: (percent) => `${percent}%`,
  plans: (count) => `${count} ${count === 1 ? "plan" : "plans"}`,
  workspaces: (count) => `${count} ${count === 1 ? "workspace" : "workspaces"}`,
  denied: (count) => `${count} denied`,
};

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(value);
}

/**
 * A flag in one line: "Off" when the kill switch is off (nothing else matters then), otherwise
 * "On", the rollout when it is partial, and the allow/deny lists that are not empty —
 * "On · 25% · 2 workspaces".
 */
export function formatFlag(value: SettingJson | null | undefined, words: SettingValueWords = ENGLISH_VALUE_WORDS): string {
  const flag = normalizeFlag(value);
  if (!flag.enabled) return words.off;
  const parts = [words.on];
  if (flag.rolloutPercent < 100) parts.push(words.rollout(flag.rolloutPercent));
  if (flag.allowPlans.length) parts.push(words.plans(flag.allowPlans.length));
  if (flag.allowWorkspaces.length) parts.push(words.workspaces(flag.allowWorkspaces.length));
  if (flag.denyWorkspaces.length) parts.push(words.denied(flag.denyWorkspaces.length));
  return parts.join(" · ");
}

/** A value as the console prints it: "30 minutes", "On", "a@x.vn, b@x.vn", "On · 25%". */
export function formatSettingValue(
  setting: Pick<PlatformSettingDto, "type" | "unit">,
  value: SettingJson | null | undefined,
  words: SettingValueWords = ENGLISH_VALUE_WORDS,
  locale = "en-US",
): string {
  if (value === null || value === undefined) return words.none;
  switch (setting.type) {
    case "boolean":
      return value === true ? words.on : value === false ? words.off : JSON.stringify(value);
    case "integer":
    case "decimal":
      if (typeof value !== "number") return JSON.stringify(value);
      return setting.unit ? `${formatNumber(value, locale)} ${setting.unit}` : formatNumber(value, locale);
    case "string":
    case "enum":
      return typeof value === "string" ? (value.length ? value : words.empty) : JSON.stringify(value);
    case "string_list":
      if (!Array.isArray(value)) return JSON.stringify(value);
      return value.length ? value.map(String).join(", ") : words.none;
    case "feature_flag":
      return formatFlag(value, words);
    default:
      return JSON.stringify(value);
  }
}

// ── Effective value ─────────────────────────────────────────────────────────────────────────────

export type EffectiveExplanation =
  | { state: "set"; value: SettingJson; overrides: number }
  | { state: "notSet"; service: string; codeDefault: SettingJson; overrides: number };

/**
 * What is in force. "Not set" is not "the default": the owning service falls back to its own
 * deploy-time configuration first and only then to the registry's code default, so the console
 * names the service rather than claiming a value it cannot see.
 */
export function explainEffectiveValue(
  setting: Pick<PlatformSettingDto, "isSet" | "value" | "owningService" | "defaultValue" | "overrides">,
): EffectiveExplanation {
  if (setting.isSet && setting.value !== null) {
    return { state: "set", value: setting.value, overrides: setting.overrides.length };
  }
  return {
    state: "notSet",
    service: setting.owningService,
    codeDefault: setting.defaultValue,
    overrides: setting.overrides.length,
  };
}

/** The English sentence, for logs and tests; the page builds the localized one from the same parts. */
export function describeEffectiveValue(setting: PlatformSettingDto, words: SettingValueWords = ENGLISH_VALUE_WORDS): string {
  const explanation = explainEffectiveValue(setting);
  if (explanation.state === "set") return formatSettingValue(setting, explanation.value, words);
  return `Not set — ${explanation.service} uses its deploy-time value (code default ${formatSettingValue(setting, explanation.codeDefault, words)})`;
}

// ── Filters and search ──────────────────────────────────────────────────────────────────────────

/** "Changed from default": a platform value is stored, or any plan/workspace override is. */
export function isChangedFromDefault(setting: Pick<PlatformSettingDto, "isSet" | "overrides">): boolean {
  return setting.isSet || setting.overrides.length > 0;
}

/**
 * Whether a free-text query names this setting: label, key, description, category (key and the
 * localized name the page passes) and owning service.
 */
export function settingMatchesQuery(
  setting: Pick<PlatformSettingDto, "label" | "key" | "description" | "category" | "owningService">,
  query: string,
  extraTexts: readonly (string | null | undefined)[] = [],
): boolean {
  if (!query.trim()) return true;
  // Keys are dotted and snake_cased; "lockout duration" should find security.lockout.duration_minutes.
  const spacedKey = setting.key.replace(/[._]+/g, " ");
  return matchesSearch(query, [setting.label, setting.key, spacedKey, setting.description, setting.category, setting.owningService, ...extraTexts]);
}

/** Best-first settings for a query, label matches above description matches. For the ⌘K palette. */
export function rankSettings<T extends Pick<PlatformSettingDto, "label" | "key" | "description" | "category" | "owningService">>(
  query: string,
  settings: readonly T[],
  limit = 6,
): T[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return settings
    .map((setting, index) => {
      const spacedKey = setting.key.replace(/[._]+/g, " ");
      const strong = bestMatchScore(trimmed, [setting.label, setting.key, spacedKey]);
      const score = strong > 0 ? strong + 100 : settingMatchesQuery(setting, trimmed) ? 10 : 0;
      return { setting, score, index };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.setting);
}

export interface SettingsFilter {
  category: string | null;
  query: string;
  changedOnly: boolean;
}

/**
 * The rows the list shows. A query searches EVERY category (the left nav then only counts); with
 * no query the selected category narrows it.
 */
export function filterSettings<T extends PlatformSettingDto>(
  settings: readonly T[],
  filter: SettingsFilter,
  categoryLabel: (category: string) => string = (category) => category,
): T[] {
  const query = filter.query.trim();
  return settings.filter((setting) => {
    if (filter.changedOnly && !isChangedFromDefault(setting)) return false;
    if (query) return settingMatchesQuery(setting, query, [categoryLabel(setting.category)]);
    return !filter.category || setting.category === filter.category;
  });
}

/**
 * The left navigation: every category in the console's order — also the ones with no registry key
 * yet (Data & retention, Integrations), which carry panels of their own — then any category the
 * server knows and this build does not, so a newer registry is never hidden.
 */
export function orderedCategories(serverCategories: readonly { key: string }[]): string[] {
  const unknown = serverCategories
    .map((category) => category.key)
    .filter((key, index, all) => !isKnownCategory(key) && all.indexOf(key) === index);
  return [...PLATFORM_SETTING_CATEGORIES, ...unknown];
}

/** Categories that render a panel of their own beside (or instead of) registry rows. */
export function isPanelCategory(category: string): boolean {
  return category === "billing" || category === "retention" || category === "integrations" || category === "meetings";
}

export function isKnownCategory(value: string | null | undefined): value is PlatformSettingCategory {
  return !!value && (PLATFORM_SETTING_CATEGORIES as readonly string[]).includes(value);
}

// ── URL state ───────────────────────────────────────────────────────────────────────────────────

export interface ConsoleUrlState {
  category: string | null;
  query: string;
  changedOnly: boolean;
  /** Focus one setting: `?key=security.lockout.duration_minutes`. */
  focusKey: string | null;
}

export function parseConsoleUrl(params: { get(name: string): string | null }): ConsoleUrlState {
  const category = params.get("category");
  return {
    category: category && /^[a-z_]{1,40}$/.test(category) ? category : null,
    query: (params.get("q") ?? "").slice(0, 200),
    changedOnly: params.get("changed") === "1",
    focusKey: params.get("key") || null,
  };
}

/** The console's query string for a state; defaults write nothing. */
export function consoleUrlQuery(state: Partial<ConsoleUrlState>): string {
  const params = new URLSearchParams();
  if (state.category) params.set("category", state.category);
  if (state.query?.trim()) params.set("q", state.query.trim());
  if (state.changedOnly) params.set("changed", "1");
  if (state.focusKey) params.set("key", state.focusKey);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Where ⌘K and links send someone to look at one setting. */
export function settingHref(key: string): string {
  return `/admin/settings?key=${encodeURIComponent(key)}`;
}

/** The category a focused key belongs to, so the page can open it. */
export function categoryOfKey(settings: readonly Pick<PlatformSettingDto, "key" | "category">[], key: string | null): string | null {
  if (!key) return null;
  return settings.find((setting) => setting.key === key)?.category ?? null;
}

// ── Scopes and versions ─────────────────────────────────────────────────────────────────────────

export interface SettingScopeRef {
  scopeType: PlatformSettingScope;
  scopeId: string;
}

export const PLATFORM_SCOPE: SettingScopeRef = { scopeType: "platform", scopeId: "" };

/** What is stored at one scope, with its version, or null when nothing is. */
export function storedAt(
  setting: Pick<PlatformSettingDto, "isSet" | "value" | "version" | "overrides">,
  scope: SettingScopeRef,
): { value: SettingJson; version: number } | null {
  if (scope.scopeType === "platform") {
    return setting.isSet && setting.value !== null ? { value: setting.value, version: setting.version } : null;
  }
  const override = setting.overrides.find(
    (candidate) => candidate.scopeType === scope.scopeType && candidate.scopeId.toLowerCase() === scope.scopeId.trim().toLowerCase(),
  );
  return override ? { value: override.value, version: override.version } : null;
}

/** The `expectedVersion` a write at this scope must carry: what was read, 0 when nothing was. */
export function expectedVersionAt(setting: Pick<PlatformSettingDto, "isSet" | "value" | "version" | "overrides">, scope: SettingScopeRef): number {
  return storedAt(setting, scope)?.version ?? 0;
}

export type ScopeIdError = "planSlug" | "workspaceId" | "scopeNotAllowed" | null;

/** The same scope-id rules NormalizeScope applies. */
export function validateScopeId(setting: Pick<PlatformSettingDto, "scopes">, scopeType: PlatformSettingScope, scopeId: string): ScopeIdError {
  if (!setting.scopes.includes(scopeType)) return "scopeNotAllowed";
  const id = scopeId.trim();
  if (scopeType === "plan") return PLAN_SLUG.test(id.toLowerCase()) ? null : "planSlug";
  if (scopeType === "workspace") return GUID.test(id) ? null : "workspaceId";
  return null;
}

/** The override scopes a setting allows besides platform. */
export function overrideScopes(setting: Pick<PlatformSettingDto, "scopes">): PlatformSettingScope[] {
  return setting.scopes.filter((scope) => scope !== "platform");
}

// ── Diff for the confirmation ───────────────────────────────────────────────────────────────────

export interface SettingDiffField {
  field: string;
  before: SettingJson | null;
  after: SettingJson | null;
}

export interface SettingDiff {
  key: string;
  label: string;
  scope: SettingScopeRef;
  kind: "set" | "reset";
  /** Stored before; null = not set at this scope. */
  before: SettingJson | null;
  /** Stored after; null = not set (a reset). */
  after: SettingJson | null;
  unchanged: boolean;
  /** Lists: entries added and removed. */
  added: string[];
  removed: string[];
  /** Flags: the fields that differ. */
  fields: SettingDiffField[];
  /** Risky, or a Security setting: the confirmation asks why. */
  requiresReason: boolean;
  expectedVersion: number;
}

function stableJson(value: SettingJson | null | undefined): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, SettingJson>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Equal in meaning: key order ignored, and a flag compared with its defaults filled in. */
export function settingValuesEqual(
  type: PlatformSettingDto["type"],
  a: SettingJson | null | undefined,
  b: SettingJson | null | undefined,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (type === "feature_flag") return stableJson(flagToJson(normalizeFlag(a))) === stableJson(flagToJson(normalizeFlag(b)));
  return stableJson(a) === stableJson(b);
}

export function buildSettingDiff(
  setting: PlatformSettingDto,
  scope: SettingScopeRef,
  next: SettingJson | null,
): SettingDiff {
  const stored = storedAt(setting, scope);
  const before = stored?.value ?? null;
  const after = next;
  const added: string[] = [];
  const removed: string[] = [];
  const fields: SettingDiffField[] = [];

  if (setting.type === "string_list") {
    const beforeList = Array.isArray(before) ? before.map(String) : [];
    const afterList = Array.isArray(after) ? after.map(String) : [];
    added.push(...afterList.filter((item) => !beforeList.includes(item)));
    removed.push(...beforeList.filter((item) => !afterList.includes(item)));
  }
  if (setting.type === "feature_flag") {
    const a = before === null ? null : flagToJson(normalizeFlag(before));
    const b = after === null ? null : flagToJson(normalizeFlag(after));
    for (const field of FLAG_FIELDS) {
      const from = a ? a[field] : null;
      const to = b ? b[field] : null;
      if (stableJson(from) !== stableJson(to)) fields.push({ field, before: from, after: to });
    }
  }

  return {
    key: setting.key,
    label: setting.label,
    scope,
    kind: after === null ? "reset" : "set",
    before,
    after,
    unchanged: settingValuesEqual(setting.type, before, after),
    added,
    removed,
    fields,
    requiresReason: setting.risky || setting.requiresSecurityPermission,
    expectedVersion: stored?.version ?? 0,
  };
}

/** Whether a reason satisfies the confirmation. Only required ones are held to the minimum. */
export function reasonIsValid(reason: string, required: boolean): boolean {
  const trimmed = reason.trim();
  if (trimmed.length > MAX_SETTING_REASON_LENGTH) return false;
  return !required || trimmed.length >= MIN_SETTING_REASON_LENGTH;
}

// ── Export / import files ───────────────────────────────────────────────────────────────────────

/** `warptalk-platform-settings-YYYYMMDD.json`, in UTC like the server's exportedAt. */
export function exportFileName(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `warptalk-platform-settings-${y}${m}${d}.json`;
}

export const MAX_IMPORT_ENTRIES = 2000;
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

export type ImportFileError =
  | { code: "invalidJson" }
  | { code: "notAnObject" }
  | { code: "wrongFormat"; format: string | null }
  | { code: "noSettings" }
  | { code: "tooManyEntries"; max: number }
  | { code: "badEntry"; index: number; reason: "notAnObject" | "key" | "scopeType" | "scopeId" | "value" };

export type ImportFileResult =
  | { ok: true; entries: PlatformSettingsExportEntryDto[]; excluded: string[]; exportedAt: string | null }
  | { ok: false; error: ImportFileError };

/**
 * Reads a file the export produced. Checks its shape only — whether each key exists and each value
 * is allowed is the server's dry run, which reports per line.
 */
export function parseImportFile(text: string): ImportFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "invalidJson" } };
  }
  if (!isPlainObject(parsed)) return { ok: false, error: { code: "notAnObject" } };
  if (parsed.format !== PLATFORM_SETTINGS_EXPORT_FORMAT) {
    return { ok: false, error: { code: "wrongFormat", format: typeof parsed.format === "string" ? parsed.format : null } };
  }
  if (!Array.isArray(parsed.settings) || parsed.settings.length === 0) return { ok: false, error: { code: "noSettings" } };
  if (parsed.settings.length > MAX_IMPORT_ENTRIES) return { ok: false, error: { code: "tooManyEntries", max: MAX_IMPORT_ENTRIES } };

  const entries: PlatformSettingsExportEntryDto[] = [];
  for (let i = 0; i < parsed.settings.length; i += 1) {
    const index = i + 1;
    const entry = parsed.settings[i];
    if (!isPlainObject(entry)) return { ok: false, error: { code: "badEntry", index, reason: "notAnObject" } };
    if (typeof entry.key !== "string" || !/^[a-z0-9_.]{3,120}$/.test(entry.key)) {
      return { ok: false, error: { code: "badEntry", index, reason: "key" } };
    }
    const scopeType = entry.scopeType ?? "platform";
    if (typeof scopeType !== "string" || !(PLATFORM_SETTING_SCOPES as readonly string[]).includes(scopeType)) {
      return { ok: false, error: { code: "badEntry", index, reason: "scopeType" } };
    }
    const scopeId = entry.scopeId ?? "";
    if (typeof scopeId !== "string" || (scopeType === "platform" ? scopeId !== "" : scopeId.trim() === "")) {
      return { ok: false, error: { code: "badEntry", index, reason: "scopeId" } };
    }
    if (!("value" in entry) || entry.value === undefined || entry.value === null) {
      return { ok: false, error: { code: "badEntry", index, reason: "value" } };
    }
    entries.push({ key: entry.key, scopeType, scopeId, value: entry.value as SettingJson });
  }
  const excluded = Array.isArray(parsed.excluded) ? parsed.excluded.filter((key): key is string => typeof key === "string") : [];
  return { ok: true, entries, excluded, exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : null };
}

/** Human scope label: "Platform", "plan: pro", "workspace: 1f2e…". */
export function scopeLabel(scope: { scopeType: string; scopeId: string }): string {
  return scope.scopeType === "platform" || !scope.scopeId ? scope.scopeType : `${scope.scopeType}: ${scope.scopeId}`;
}
