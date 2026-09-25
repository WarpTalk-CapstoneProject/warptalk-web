/**
 * The pure half of the email CMS: what a template references, what is wrong with it before the
 * server is asked, how a variable or a block is inserted at the cursor, and how the lists filter
 * and sort.
 *
 * The server (EmailTemplateRenderer.Validate in warptalk-backend/shared) stays the authority — its
 * preview returns the full issue list, including unsafe HTML and blocks that do not exist, and a
 * publish it refuses is refused. This mirrors only the variable rules so a typo is flagged as it
 * is typed.
 *
 * Deliberately free of React and of `@/` imports so `node:test` runs it without a bundler.
 */

export interface TemplateVariable {
  name: string;
  required: boolean;
}

export interface TemplateContent {
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  /** "" derives the plain text from the HTML. */
  textBody: string;
}

export type TemplateField = keyof TemplateContent;

export const TEMPLATE_FIELDS: readonly TemplateField[] = ["subject", "preheader", "heading", "bodyHtml", "textBody"];

export interface LocalIssue {
  field: TemplateField;
  code: "UNKNOWN_VARIABLE" | "MISSING_REQUIRED_VARIABLE" | "REQUIRED" | "LINE_BREAK";
  variable?: string;
}

/** Same pattern as the server: `{{Name}}`, whitespace allowed inside the braces. */
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const PARTIAL = /\{\{>\s*([a-z0-9][a-z0-9_-]*)\s*\}\}/g;

export function referencedVariables(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

export function referencedBlocks(text: string): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(PARTIAL)) {
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

export function checkTemplate(variables: readonly TemplateVariable[], content: TemplateContent): LocalIssue[] {
  const issues: LocalIssue[] = [];
  const known = new Set(variables.map((variable) => variable.name));

  if (!content.subject.trim()) issues.push({ field: "subject", code: "REQUIRED" });
  if (/[\r\n]/.test(content.subject)) issues.push({ field: "subject", code: "LINE_BREAK" });
  if (/[\r\n]/.test(content.preheader)) issues.push({ field: "preheader", code: "LINE_BREAK" });
  if (!content.bodyHtml.trim()) issues.push({ field: "bodyHtml", code: "REQUIRED" });

  const referenced = new Set<string>();
  for (const field of TEMPLATE_FIELDS) {
    for (const name of referencedVariables(content[field])) {
      if (field !== "textBody" && field !== "preheader") referenced.add(name);
      if (!known.has(name)) issues.push({ field, code: "UNKNOWN_VARIABLE", variable: name });
    }
  }
  for (const variable of variables) {
    if (variable.required && !referenced.has(variable.name)) {
      issues.push({ field: "bodyHtml", code: "MISSING_REQUIRED_VARIABLE", variable: variable.name });
    }
  }
  // A hand-written text part is all a plain-text reader sees, so it must carry the link too.
  if (content.textBody.trim()) {
    const inText = new Set(referencedVariables(content.textBody));
    for (const variable of variables) {
      if (variable.required && !inText.has(variable.name)) {
        issues.push({ field: "textBody", code: "MISSING_REQUIRED_VARIABLE", variable: variable.name });
      }
    }
  }
  return issues;
}

/** The token for a variable, as it is written into a template. */
export function placeholder(name: string): string {
  return `{{${name}}}`;
}

/** The token that includes a reusable block. */
export function blockInclude(key: string): string {
  return `{{> ${key}}}`;
}

/** `value` with `token` replacing the selection, and where the caret goes afterwards. */
export function insertAt(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  token: string,
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart ?? value.length, value.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, value.length));
  return { value: value.slice(0, start) + token + value.slice(end), caret: start + token.length };
}

export function sameContent(a: TemplateContent, b: TemplateContent): boolean {
  return TEMPLATE_FIELDS.every((field) => a[field] === b[field]);
}

// ── Lists ────────────────────────────────────────────────────────────────────────────────────

export type TemplateFilter = "all" | "live" | "dormant" | "customized" | "draft";

export interface TemplateCardFacts {
  isLive: boolean;
  /** Any published variant. */
  isCustomized: boolean;
  hasDraftChanges: boolean;
}

export function matchesFilter(template: TemplateCardFacts, filter: TemplateFilter): boolean {
  switch (filter) {
    case "live":
      return template.isLive;
    case "dormant":
      return !template.isLive;
    case "customized":
      return template.isCustomized;
    case "draft":
      return template.hasDraftChanges;
    default:
      return true;
  }
}

export function matchesSearch(fields: readonly (string | null | undefined)[], search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(needle));
}

export type TemplateSort = "name" | "updated" | "sent";

export interface SortableTemplate {
  name: string;
  updatedAt: string | null;
  sent: number;
}

export function compareTemplates(sort: TemplateSort, a: SortableTemplate, b: SortableTemplate): number {
  switch (sort) {
    case "updated":
      return (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0) || a.name.localeCompare(b.name);
    case "sent":
      return b.sent - a.sent || a.name.localeCompare(b.name);
    default:
      return a.name.localeCompare(b.name);
  }
}

/** The status one block shows on its card. */
export type BlockStatus = "DRAFT" | "PUBLISHED" | "CHANGES" | "ARCHIVED";

export function blockStatus(block: { status: string; publishedVersion: number; hasDraftChanges: boolean }): BlockStatus {
  if (block.status === "ARCHIVED") return "ARCHIVED";
  if (block.publishedVersion === 0) return "DRAFT";
  return block.hasDraftChanges ? "CHANGES" : "PUBLISHED";
}

/** A block key suggested from its name: lower-case slug, 2–60 characters. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const BLOCK_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,59}$/;

/** A plausible email address — the server does the real check. */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** "a@x.vn, b@x.vn\nc@x.vn" → unique addresses, in order. */
export function parseRecipients(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[\s,;]+/)) {
    const address = part.trim();
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push(address);
  }
  return out;
}

// ── Locales ──────────────────────────────────────────────────────────────────────────────────

export type LocaleState = "PUBLISHED" | "CHANGES" | "DRAFT_ONLY" | "ARCHIVED" | "MISSING";

export interface LocaleVariantFacts {
  locale: string;
  status: string;
  publishedVersion: number;
  hasDraftChanges: boolean;
}

export function localeState(variant: LocaleVariantFacts | undefined): LocaleState {
  if (!variant) return "MISSING";
  if (variant.status === "ARCHIVED") return "ARCHIVED";
  if (variant.publishedVersion === 0) return "DRAFT_ONLY";
  return variant.hasDraftChanges ? "CHANGES" : "PUBLISHED";
}

/**
 * What a recipient in `locale` is sent — the rule EmailPublishedResolver applies: that locale's
 * published content if it has any and is not archived, else English's, else the built-in wording.
 * Returns the locale actually used, or "default".
 */
export function sentVersionFor(locale: string, variants: readonly LocaleVariantFacts[]): string {
  const live = (code: string) => {
    const variant = variants.find((candidate) => candidate.locale === code);
    return Boolean(variant && variant.status !== "ARCHIVED" && variant.publishedVersion > 0);
  };
  if (live(locale)) return locale;
  if (locale !== "en" && live("en")) return "en";
  return "default";
}
