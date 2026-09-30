/**
 * Email CMS v3, the pure half: which templates are built-in or custom, what the create wizard and
 * the send form accept, how a thumbnail is scaled, and the page "Open in new tab" shows.
 *
 * Free of React and `@/` imports so `node:test` runs it.
 */

// ── Built-in vs custom ────────────────────────────────────────────────────────────────────────

export interface TemplateKind {
  isCustom?: boolean;
  status?: string;
  category?: string;
}

export function isCustomTemplate(template: TemplateKind): boolean {
  return Boolean(template.isCustom);
}

/** A soft-deleted custom template: listed only under Archived, restorable. */
export function isDeletedTemplate(template: TemplateKind): boolean {
  return template.status === "DELETED";
}

// ── The create wizard ─────────────────────────────────────────────────────────────────────────

export const TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{2,59}$/;
export const VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
export const MAX_CUSTOM_VARIABLES = 20;
export const CUSTOM_CATEGORIES = ["TRANSACTIONAL_CUSTOM", "MARKETING", "ANNOUNCEMENT"] as const;
export type CustomCategory = (typeof CUSTOM_CATEGORIES)[number];
export const VARIABLE_TYPES = ["TEXT", "URL", "DATE", "NUMBER", "MULTILINE"] as const;
export type VariableType = (typeof VARIABLE_TYPES)[number];

/** Filled in by the sender, never declared: the same list as CustomEmailDefinitions.ImplicitVariables. */
export function implicitVariables(category: string): { name: string; sample: string }[] {
  const base = [
    { name: "RecipientName", sample: "Linh Nguyen" },
    { name: "RecipientEmail", sample: "linh@example.com" },
  ];
  if (category !== "ANNOUNCEMENT") return base;
  return [
    ...base,
    { name: "AnnouncementTitle", sample: "Live captions now in 40 languages" },
    { name: "AnnouncementText", sample: "Turn them on from any meeting's caption menu." },
    { name: "AnnouncementLink", sample: "https://app.warptalk.vn/" },
  ];
}

const IMPLICIT = new Set(["RecipientName", "RecipientEmail", "AnnouncementTitle", "AnnouncementText", "AnnouncementLink"]);

/** A key suggested from the name: lower-case, dots and dashes, unique among `taken`. */
export function suggestKey(name: string, taken: ReadonlySet<string>): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
  const base = slug.length >= 3 ? slug : `email-${slug || "custom"}`.slice(0, 54);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 60);
}

export interface WizardVariable {
  name: string;
  label: string;
  type: VariableType;
  sample: string;
  required: boolean;
}

export interface WizardLocale {
  locale: "en" | "vi" | "ja";
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
}

export interface WizardState {
  name: string;
  key: string;
  category: CustomCategory;
  description: string;
  layoutId: string | null;
  variables: WizardVariable[];
  content: WizardLocale[];
}

export type WizardStep = "basics" | "layout" | "variables" | "content" | "review";
export const WIZARD_STEPS: readonly WizardStep[] = ["basics", "layout", "variables", "content", "review"];

export type WizardError =
  | "nameRequired"
  | "keyInvalid"
  | "keyTaken"
  | "variableNameInvalid"
  | "variableImplicit"
  | "variableDuplicate"
  | "variableSampleInvalid"
  | "tooManyVariables"
  | "englishRequired"
  | "subjectRequired"
  | "bodyRequired"
  | "unknownVariable";

/** What is wrong with each step, as message keys. The server checks everything again. */
export function wizardErrors(state: WizardState, takenKeys: ReadonlySet<string>): Record<WizardStep, WizardError[]> {
  const errors: Record<WizardStep, WizardError[]> = { basics: [], layout: [], variables: [], content: [], review: [] };
  if (!state.name.trim()) errors.basics.push("nameRequired");
  if (!TEMPLATE_KEY_PATTERN.test(state.key)) errors.basics.push("keyInvalid");
  else if (takenKeys.has(state.key)) errors.basics.push("keyTaken");

  const seen = new Set<string>();
  for (const variable of state.variables) {
    if (!VARIABLE_NAME_PATTERN.test(variable.name)) errors.variables.push("variableNameInvalid");
    else if (IMPLICIT.has(variable.name)) errors.variables.push("variableImplicit");
    else if (seen.has(variable.name)) errors.variables.push("variableDuplicate");
    seen.add(variable.name);
    if (variable.sample && sendValueError(variable.type, variable.sample)) errors.variables.push("variableSampleInvalid");
  }
  if (state.variables.length > MAX_CUSTOM_VARIABLES) errors.variables.push("tooManyVariables");

  const english = state.content.find((c) => c.locale === "en");
  if (!english || (!english.subject.trim() && !english.bodyHtml.trim())) errors.content.push("englishRequired");
  const known = new Set([...implicitVariables(state.category).map((v) => v.name), ...state.variables.map((v) => v.name)]);
  for (const locale of state.content) {
    const written = locale.subject.trim() || locale.bodyHtml.trim();
    if (!written && locale.locale !== "en") continue;
    if (!locale.subject.trim()) errors.content.push("subjectRequired");
    if (!locale.bodyHtml.trim()) errors.content.push("bodyRequired");
    for (const field of [locale.subject, locale.preheader, locale.heading, locale.bodyHtml]) {
      for (const match of field.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)) {
        if (!known.has(match[1])) errors.content.push("unknownVariable");
      }
    }
  }
  for (const step of WIZARD_STEPS) errors[step] = [...new Set(errors[step])];
  errors.review = [...errors.basics, ...errors.variables, ...errors.content];
  return errors;
}

/** Only the languages that were written go to the server; English always does. */
export function writtenLocales(content: readonly WizardLocale[]): WizardLocale[] {
  return content.filter((c) => c.locale === "en" || c.subject.trim() || c.bodyHtml.trim());
}

// ── The send form ────────────────────────────────────────────────────────────────────────────

export type SendValueError = "notALink" | "notANumber" | "notADate" | "tooLong";

/** The server's checks (EmailCampaignService.ValidateValues), so a typo shows as it is typed. */
export function sendValueError(type: string, value: string): SendValueError | null {
  const trimmed = value.trim();
  if (trimmed.length > 2000) return "tooLong";
  if (!trimmed) return null;
  switch (type) {
    case "URL":
      try {
        const url = new URL(trimmed);
        return url.protocol === "https:" || url.protocol === "http:" ? null : "notALink";
      } catch {
        return "notALink";
      }
    case "NUMBER":
      return /^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, "")) ? null : "notANumber";
    case "DATE":
      return Number.isNaN(Date.parse(trimmed)) ? "notADate" : null;
    default:
      return null;
  }
}

/** Roughly how long a send takes at the server's rate, in whole minutes (at least 1). */
export function sendDurationMinutes(recipients: number, perMinute: number): number {
  if (recipients <= 0) return 0;
  return Math.max(1, Math.ceil(recipients / Math.max(1, perMinute)));
}

/** The server refuses a confirmed count that drifted more than this from the real one. */
export const RECIPIENT_DRIFT_TOLERANCE = 5;

// ── Thumbnails and "Open in new tab" ──────────────────────────────────────────────────────────

/** Emails are designed at 600 px; a thumbnail shows that width scaled into its box. */
export const EMAIL_DESIGN_WIDTH = 640;

export function thumbnailScale(boxWidth: number, designWidth = EMAIL_DESIGN_WIDTH): number {
  if (boxWidth <= 0) return 0.4;
  return Math.min(1, boxWidth / designWidth);
}

/** The email with its scrollbars hidden, for a frame nobody scrolls. */
export function thumbnailDocument(html: string): string {
  const style = "<style>html,body{overflow:hidden!important;}</style>";
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}</head>`) : style + html;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The page "Open in new tab" shows: the envelope, then the email in a frame with no scripts and
 * no same-origin access — the same sandbox as the portal's preview, so opening it outside the
 * dialog does not loosen anything.
 */
export function standalonePreviewDocument(input: {
  title: string;
  subject: string;
  from: string;
  to: string;
  preheader: string;
  html: string;
  dark: boolean;
  lang: string;
}): string {
  const ground = input.dark ? "#111214" : "#f4f4f5";
  const ink = input.dark ? "#f4f4f5" : "#18181b";
  const muted = input.dark ? "#a1a1aa" : "#52525b";
  return `<!doctype html>
<html lang="${escapeHtml(input.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-src 'self' about: data:">
<title>${escapeHtml(input.title)}</title>
<style>
body{margin:0;background:${ground};color:${ink};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
header{max-width:760px;margin:0 auto;padding:24px 16px 12px;}
h1{font-size:20px;margin:0 0 8px;}
p{margin:2px 0;font-size:13px;color:${muted};}
main{max-width:760px;margin:0 auto;padding:0 16px 32px;}
iframe{width:100%;height:80vh;border:0;border-radius:12px;background:${input.dark ? "#111214" : "#ffffff"};}
</style>
</head>
<body>
<header>
<h1>${escapeHtml(input.subject)}</h1>
<p>${escapeHtml(input.from)}</p>
<p>${escapeHtml(input.to)}</p>
<p>${escapeHtml(input.preheader)}</p>
</header>
<main><iframe sandbox="" title="${escapeHtml(input.subject)}" srcdoc="${escapeHtml(input.html)}"></iframe></main>
</body>
</html>`;
}

/**
 * The wizard's quick look at a body before the template exists on the server: sample values
 * substituted (HTML-escaped, like the server does) inside a plain card. The real preview — layout,
 * blocks, dark mode — is the server's, after saving.
 */
export function draftBodyDocument(bodyHtml: string, heading: string, samples: Readonly<Record<string, string>>): string {
  const fill = (text: string, escape: boolean) =>
    text.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (match, name: string) =>
      name in samples ? (escape ? escapeHtml(samples[name]) : samples[name]) : match,
    );
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#FBF9F5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#3F3F46;font-size:15px;line-height:1.6}.card{max-width:540px;margin:24px auto;background:#fff;border:1px solid #E4E4E7;border-radius:16px;padding:28px 32px}h1{font-size:22px;color:#18181B;margin:0 0 16px}</style></head><body><div class="card">${heading ? `<h1>${escapeHtml(fill(heading, false))}</h1>` : ""}${fill(bodyHtml, true)}</div></body></html>`;
}
