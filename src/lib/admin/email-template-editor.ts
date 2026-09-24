/**
 * The pure half of the email template editor: what a template references, what is wrong with it
 * before the server is asked, and how a variable is inserted where the cursor is.
 *
 * The server (EmailTemplateRenderer.Validate in warptalk-backend/shared) stays the authority —
 * its preview returns the full issue list, including unsafe HTML, and a save it refuses is
 * refused. This mirrors only the two variable rules so a typo is flagged as it is typed.
 *
 * Deliberately free of React and of `@/` imports so `node:test` runs it without a bundler.
 */

export interface TemplateVariable {
  name: string;
  required: boolean;
}

export interface TemplateContent {
  subject: string;
  heading: string;
  bodyHtml: string;
}

export type TemplateField = keyof TemplateContent;

export interface LocalIssue {
  field: TemplateField;
  code: "UNKNOWN_VARIABLE" | "MISSING_REQUIRED_VARIABLE" | "REQUIRED" | "LINE_BREAK";
  variable?: string;
}

/** Same pattern as the server: `{{Name}}`, whitespace allowed inside the braces. */
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export function referencedVariables(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

export function checkTemplate(variables: readonly TemplateVariable[], content: TemplateContent): LocalIssue[] {
  const issues: LocalIssue[] = [];
  const known = new Set(variables.map((variable) => variable.name));

  if (!content.subject.trim()) issues.push({ field: "subject", code: "REQUIRED" });
  if (/[\r\n]/.test(content.subject)) issues.push({ field: "subject", code: "LINE_BREAK" });
  if (!content.bodyHtml.trim()) issues.push({ field: "bodyHtml", code: "REQUIRED" });

  const referenced = new Set<string>();
  for (const field of ["subject", "heading", "bodyHtml"] as const) {
    for (const name of referencedVariables(content[field])) {
      referenced.add(name);
      if (!known.has(name)) issues.push({ field, code: "UNKNOWN_VARIABLE", variable: name });
    }
  }
  for (const variable of variables) {
    if (variable.required && !referenced.has(variable.name)) {
      issues.push({ field: "bodyHtml", code: "MISSING_REQUIRED_VARIABLE", variable: variable.name });
    }
  }
  return issues;
}

/** The token for a variable, as it is written into a template. */
export function placeholder(name: string): string {
  return `{{${name}}}`;
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
  return a.subject === b.subject && a.heading === b.heading && a.bodyHtml === b.bodyHtml;
}

export type TemplateFilter = "all" | "live" | "dormant" | "customized";

export interface TemplateCardFacts {
  isLive: boolean;
  isCustomized: boolean;
}

export function matchesFilter(template: TemplateCardFacts, filter: TemplateFilter): boolean {
  switch (filter) {
    case "live":
      return template.isLive;
    case "dormant":
      return !template.isLive;
    case "customized":
      return template.isCustomized;
    default:
      return true;
  }
}
