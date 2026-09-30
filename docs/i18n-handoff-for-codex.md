# i18n rollout handoff (warptalk-web) — context for whoever continues this

**Read this whole file before touching anything.** It exists because the work spans many
sessions/tools; skipping context here reliably causes either duplicate work or a regression
that already happened once and was already fixed.

## 1. What this is

Ticket: **WT-607** (Linear, team FPT-SEP490-SU26). Add full internationalization (English /
Vietnamese / Japanese) to `warptalk-web`, a Next.js 16 App Router product. The app had **zero**
i18n before this — every string was a literal in the component that rendered it, enforced by a
CI guard (`scripts/check-english-ui.mjs`) that still runs today.

- **Repo**: `warptalk-web`
- **Branch**: `feature/i18n-vi-en-ja` (pushed to `origin`)
- **Latest commit on the branch**: `7f38b65e`
- **⚠️ Branch is ~187 commits behind `origin/development`** as of this writing (last synced via
  a merge at `74c25b83`). Do not open the final PR without deciding with the user whether to
  merge `development` in first — a 187-commit gap means real conflict risk with anything else
  that touched the same files since.

## 2. The one non-negotiable constraint

**The existing visual layout must never shift, wrap awkwardly, clip, or overflow.** The product
owner said this explicitly and repeated it: translation accuracy matters, but *zero UI
regression* matters more. The same English sentence can come out longer **or** shorter in
Vietnamese/Japanese — e.g. sidebar "My tasks" (8 chars) → vi "Công việc của tôi" (17 chars, 2x
longer) → ja "自分のタスク" (6 chars, shorter). Never assume a direction.

**You may not change existing UI/CSS to accommodate this**, with one narrow exception: adding
the *same class-based safety net the codebase already uses elsewhere* (`truncate`, `min-w-0`,
`max-w-full`) at a specific call site that lacks it — never a dimension change, never touching a
shared primitive (`src/components/ui/{table,button,badge}.tsx`). If concise translation plus
that safety net still isn't enough, **stop and ask the user** rather than deciding alone.

## 3. Architecture already built — do not redesign, extend it

- **Library**: `next-intl`.
- **Locale source**: a `WARPTALK_LOCALE` cookie (not a URL prefix — the route tree already uses
  `(app)/[workspaceSlug]/...` as its first dynamic segment under 115+ pages, so a `/[locale]/...`
  prefix would mean restructuring all of them for no SEO benefit these authenticated pages need).
  Falls back to `Accept-Language`, then `en`.
- **Key files**: `src/i18n/locale.ts` (`getUserLocale`, server-only), `src/i18n/locale-constants.ts`
  (client-safe constants — `SUPPORTED_LOCALES`, `Locale` type — split out because a Client
  Component importing the server-only file broke the build once), `src/i18n/actions.ts`
  (`setUserLocale` server action), `src/i18n/request.ts` (registers every message namespace —
  **add new namespaces to the `NAMESPACES` array here**), `src/i18n/catalog-completeness.ts` +
  `src/i18n/__tests__/catalog-completeness.test.ts` (the vi/ja-vs-en drift check, wired into
  `test:contracts` as `test:i18n-catalog`).
- **Catalogs**: `messages/{en,vi,ja}/<namespace>.json`, one namespace file per feature area,
  **deliberately outside `src/`** so `check-english-ui.mjs` (which only scans `src/`) never sees
  translated text but keeps blocking anyone who hardcodes vi/ja directly into a component.
- **Switcher**: `src/components/layout/language-switcher.tsx`. Has a `compact` prop (icon-only,
  `sr-only` label, sized to match `ThemeToggleButton`'s 24px circle) for tight chrome; the
  default (non-compact) form is used on the landing navbar and auth pages.
- **The living reference doc**: `.agents/page-docs/i18n-localization.md`. This is the detailed,
  continuously-updated version of everything in this handoff — read it, and **update it after
  every batch** the same way this session did. This handoff file is a snapshot/orientation;
  that doc is the source of truth going forward.

## 3a. The request flow, traced end to end — with the actual code

This is the part a description can't really replace: exactly what runs, in what order, for a
page load and for a locale switch. Every snippet below is the file's real, current content —
not paraphrased.

**Step 1 — a request comes in. Next.js needs to know which locale to render.**
`next.config.ts` wraps the whole app with the next-intl plugin, pointing at the config file:

```ts
// next.config.ts
import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
// ...
export default withNextIntl(nextConfig);
```

**Step 2 — `src/i18n/request.ts` resolves the locale and loads that locale's messages.** This
runs once per request, server-side, before any component renders:

```ts
// src/i18n/request.ts
import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "@/i18n/locale";

const NAMESPACES = [
  "common", "auth", "landing", "legal", "validation",
  "home", "dashboard", "tasks", "voiceProfiles", "knowledge", "aiChat",
  // add your new namespace here
] as const;

async function loadMessages(locale: string) {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      const mod = await import(`../../messages/${locale}/${namespace}.json`);
      return [namespace, mod.default] as const;
    })
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return { locale, messages: await loadMessages(locale) };
});
```

**Step 3 — `getUserLocale()` is where the actual decision happens**: cookie first, then browser
header, then default. This is the *only* place that decides what locale a request gets:

```ts
// src/i18n/locale.ts (server-only — reads next/headers)
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isSupportedLocale, type Locale } from "@/i18n/locale-constants";

export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isSupportedLocale(cookieValue)) return cookieValue;

  const headerStore = await headers();
  const fromHeader = localeFromAcceptLanguage(headerStore.get("accept-language"));
  if (fromHeader) return fromHeader;

  return DEFAULT_LOCALE;
}
```

The constants it depends on live in a **separate, client-safe file** — this split exists because
a Client Component that imported the server-only file (for the `Locale` type) once dragged
`next/headers` into the client bundle and broke the build:

```ts
// src/i18n/locale-constants.ts (no server-only imports — safe from Client Components too)
export const SUPPORTED_LOCALES = ["en", "vi", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "WARPTALK_LOCALE";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export function isSupportedLocale(value: string | undefined | null): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
```

**Step 4 — the root layout reads the resolved locale and messages, and wraps everything.**
`src/app/layout.tsx` is an async Server Component:

```tsx
// src/app/layout.tsx
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "./providers";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased" suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

Every existing provider (`GoogleOAuthProvider`, `QueryClientProvider`, `ThemeProvider`, etc., all
inside `Providers`) sits **inside** `NextIntlClientProvider`, unchanged — the i18n provider was
added as the new outermost layer, nothing about the existing provider tree was touched.

**Step 5 — any component reads a string via `useTranslations`/`getTranslations`.** This is the
only API components call; they never touch cookies, headers, or the messages object directly:

```tsx
// Client Component
"use client";
import { useTranslations } from "next-intl";
const t = useTranslations("tasks");     // scopes into messages/*/tasks.json
t("filters.open")                        // → "Open" / "Đang mở" / "未完了"

// Server Component
import { getTranslations } from "next-intl/server";
const t = await getTranslations("legal.terms");
```

**Step 6 — switching locale.** `LanguageSwitcher` calls a server action to write the cookie, then
asks Next.js to re-render the current route from the server — no client-side string swapping,
no full page reload:

```tsx
// src/components/layout/language-switcher.tsx (complete file)
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Check } from "@phosphor-icons/react/dist/ssr";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setUserLocale } from "@/i18n/actions";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/locale-constants";

export function LanguageSwitcher({ className, compact = false }: { className?: string; compact?: boolean }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("common.languageSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setUserLocale(next);   // server action — writes the cookie
      router.refresh();            // re-renders the current route from the server
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("srLabel")}
        disabled={isPending}
        className={cn(
          compact
            ? "inline-flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-1 text-ink-muted shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
            : "inline-flex h-9 items-center gap-1.5 rounded-full border border-border/50 px-3 text-sm font-medium text-ink-muted outline-none transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60",
          className,
        )}
      >
        <Globe size={compact ? 12 : 16} weight="regular" />
        <span className={compact ? "sr-only" : undefined}>{t(locale)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {SUPPORTED_LOCALES.map((code) => (
          <DropdownMenuItem key={code} onClick={() => handleSelect(code)} className="flex cursor-pointer items-center justify-between gap-3">
            <span>{t(code)}</span>
            {code === locale ? <Check size={14} weight="bold" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

And the server action it calls:

```ts
// src/i18n/actions.ts — MUST be a separate file from locale.ts.
// A "use server" file may only export async functions — no constants, no types. Mixing a
// server action into locale.ts (which also exports SUPPORTED_LOCALES etc.) fails the build.
"use server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS, type Locale } from "@/i18n/locale-constants";

export async function setUserLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
  });
}
```

**That's the whole mechanism.** No middleware, no URL rewriting, no client-side i18n state
library. A locale change is: write one cookie → ask the server to re-render → step 2 above reads
the new cookie value on the next request.

## 3b. A complete namespace, verbatim — the exact shape to copy

Every namespace file is a plain flat/nested JSON object, one file per locale, same keys
everywhere. Here is `tasks` in full, all three locales, unedited:

```json
// messages/en/tasks.json
{
  "filters": { "open": "Open", "closed": "Closed", "all": "All" },
  "loading": "Loading…",
  "empty": {
    "openTitle": "Nothing open",
    "otherTitle": "No tasks in this state yet",
    "openDescription": "Every task from your meetings is closed.",
    "otherDescription": "Tasks appear here when their meeting records an action item."
  },
  "markDone": "Mark done",
  "reopen": "Reopen",
  "untitledMeeting": "Untitled meeting",
  "drop": "Drop",
  "toasts": { "updateFailed": "Could not update the item." }
}
```

```json
// messages/vi/tasks.json — identical key shape, translated values
{
  "filters": { "open": "Đang mở", "closed": "Đã đóng", "all": "Tất cả" },
  "loading": "Đang tải…",
  "empty": {
    "openTitle": "Không có việc nào đang mở",
    "otherTitle": "Chưa có công việc ở trạng thái này",
    "openDescription": "Mọi công việc từ các cuộc họp của bạn đã hoàn tất.",
    "otherDescription": "Công việc sẽ xuất hiện khi cuộc họp ghi nhận một hạng mục hành động."
  },
  "markDone": "Đánh dấu hoàn tất",
  "reopen": "Mở lại",
  "untitledMeeting": "Cuộc họp chưa đặt tên",
  "drop": "Bỏ qua",
  "toasts": { "updateFailed": "Không thể cập nhật mục này." }
}
```

```json
// messages/ja/tasks.json — same again
{
  "filters": { "open": "未完了", "closed": "完了", "all": "すべて" },
  "loading": "読み込み中…",
  "empty": {
    "openTitle": "未完了のタスクはありません",
    "otherTitle": "この状態のタスクはまだありません",
    "openDescription": "ミーティングのタスクはすべて完了しています。",
    "otherDescription": "ミーティングでアクションアイテムが記録されるとここに表示されます。"
  },
  "markDone": "完了にする",
  "reopen": "再開する",
  "untitledMeeting": "無題のミーティング",
  "drop": "却下",
  "toasts": { "updateFailed": "更新できませんでした。" }
}
```

And the component that consumes it — note `useTranslations("tasks")` is called once, at the top
of the component, and every string in the JSX below it is a `t("...")` call, never a literal:

```tsx
// src/app/(app)/[workspaceSlug]/tasks/page.tsx (relevant excerpt)
"use client";
import { useTranslations } from "next-intl";
// ...
export default function WorkspaceTasksPage() {
  const t = useTranslations("tasks");
  // ... later in the JSX:
  // <WorkspaceFilterPill label={t("filters.open")} ... />
  // toast.error(t("toasts.updateFailed"))
  // <PagePlaceholder title={t("empty.openTitle")} description={t("empty.openDescription")} />
}
```

## 4. How to add a translatable string (the actual workflow)

1. Pick or create a namespace matching the feature area (e.g. `rooms`, `members`, `admin`).
   Register it in `NAMESPACES` in `src/i18n/request.ts` if new (see §3a step 2 — it's a plain
   array, add the string).
2. Add the key to `messages/en/<namespace>.json` first (source of truth), then `vi` and `ja`,
   matching §3b's shape exactly — same nesting, same key names, only the values differ.
   Translate for meaning/tone, not word-for-word. Use `{placeholder}` for interpolation
   (e.g. `"Switched to workspace \"{name}\""`, resolved via `t("key", { name })`).
3. In the component: `const t = useTranslations("namespace")` (Client) or
   `const t = await getTranslations("namespace")` (Server), then `t("key")` — see §3a step 5.
4. **Zod schemas** are declared at module scope and can't call `useTranslations()` (it's a hook).
   Convert to a factory function that takes the translator and is called inside the component:

   ```tsx
   // src/app/(auth)/login/page.tsx — the actual pattern in production
   function getLoginSchema(tv: ReturnType<typeof useTranslations>) {
     return z.object({
       email: z.string().min(1, tv("emailRequired")).email(tv("emailInvalid")),
       password: z.string().optional(),
     });
   }
   // inside the component:
   // const tv = useTranslations("validation");
   // const loginSchema = useMemo(() => getLoginSchema(tv), [tv]);
   // useForm({ resolver: zodResolver(loginSchema) })
   ```

   More worked examples: `src/app/(auth)/register/page.tsx` (multi-field schema),
   `src/app/(auth)/forgot-password/page.tsx`, `reset-password/page.tsx` (schema built inline in
   the component body, no separate factory function needed for a one-field schema).

5. **Plain (non-component) helper functions** that produce user-facing strings and are called
   from both migrated and not-yet-migrated pages take an **optional** translator parameter
   defaulted to the original English strings — this is what lets an unmigrated caller keep
   compiling and keep behaving identically until it's that page's turn. The exact pattern, taken
   verbatim from `src/lib/utils.ts` (also used the same way in
   `src/lib/knowledge/knowledge-view.ts`'s `sourceLabel`/`sourceTypeLabel`/`translatedSourceTabs`
   and `src/lib/billing/usage-labels.ts`'s `usageTypeLabel`/`usageTypeDetailLabel`):

   ```ts
   // src/lib/utils.ts (complete pattern, real code)
   type PlanCopyTranslator = (key: string, values?: Record<string, string | number>) => string;

   const DEFAULT_PLAN_COPY: Record<string, string> = {
     descriptionStartup: "For growing global teams that need reliable AI summaries and history.",
     descriptionEnterprise: "For operators using voice cloning and native-feeling interpretation at scale.",
     descriptionDefault: "Flexible plan for customized workspace requirements and additional features.",
     featureCredits: "{count} credits per cycle",
     // ...
   };

   function defaultPlanCopy(key: string, values?: Record<string, string | number>): string {
     let template = DEFAULT_PLAN_COPY[key] ?? key;
     if (values) for (const [name, value] of Object.entries(values)) {
       template = template.replace(`{${name}}`, String(value));
     }
     return template;
   }

   // The default parameter is the whole trick: call it with no `t` and you get today's
   // English, unchanged. Call it with a real next-intl `t` and you get the translated version.
   export function getPlanDescription(planName: string, t: PlanCopyTranslator = defaultPlanCopy): string {
     const name = (planName || "").toLowerCase();
     if (name.includes("startup")) return t("descriptionStartup");
     if (name.includes("enterprise")) return t("descriptionEnterprise");
     return t("descriptionDefault");
   }
   ```

   A migrated caller passes a real translator: `getPlanDescription(plan.name, myPricingT)`. An
   unmigrated caller calls `getPlanDescription(plan.name)` exactly as before — same output.

6. Run `npm run test:i18n-catalog` before committing anything — it fails the build if a key
   exists in `en` but is missing in `vi`/`ja`.
7. Never hardcode raw Vietnamese/Japanese text directly in a `.tsx`/`.ts` file under `src/` —
   `npm run test:english-ui` will fail. Genuine exceptions get an `i18n-allow` comment (see
   `src/lib/language/languages.ts` for the existing convention).

## 5. Hard-won lessons — each of these caused a real, already-fixed break

Do not relearn these the expensive way:

1. **`useTranslations()` must be called before any early return** in a component (Rules of
   Hooks). This codebase has an actual contract test (`test:hooks-early-return`) that catches
   hook-after-return patterns elsewhere — assume the same rule applies everywhere, even where no
   test currently checks it.
2. **Some lib files have a contract-test-enforced import shape.** Example:
   `src/lib/knowledge/knowledge-view.ts` must stay free of *value* imports (type-only) so
   `node:test` can run it without a module resolver — `check-admin-knowledge-contract.mjs`
   asserts this with a regex. Adding a value import there (even a one-line helper) breaks it.
   **Before adding anything to a `lib/*-view.ts` or similar "deliberately dependency-free" file,
   grep `scripts/` for that file's path to see if a contract test constrains its shape.**
3. **Contract tests that `assert.match(source, /literal English string/)` will break** the moment
   that string becomes `t("key")` — correctly, because the literal really did leave the source.
   **Fix by splitting into two assertions, never by deleting the check**: (a) the source calls
   the expected translation key, (b) `messages/en/<namespace>.json` still holds the original
   English text at that key. This is the actual diff, in `scripts/check-admin-knowledge-contract.mjs`:

   ```js
   // BEFORE — broke the moment the page migrated to t("restricted.title")
   assert.match(
     workspacePage,
     /Only a workspace Owner or Admin can see what has been indexed/,
     "the workspace page must keep its owner/admin gate",
   );

   // AFTER — same guarantee, i18n-aware. Also load the catalog at the top of the script:
   //   source("messages/en/knowledge.json").then(JSON.parse)
   assert.match(
     workspacePage,
     /t\(["']restricted\.title["']\)/,
     "the workspace page must keep its owner/admin gate wired to the i18n catalog",
   );
   assert.match(
     knowledgeEn.restricted.title,
     /Only a workspace Owner or Admin can see what has been indexed/,
     "messages/en/knowledge.json must keep the owner/admin gate's original wording",
   );
   ```

   Same move, done twice more in the same file for `table` (`knowledge-table.tsx`)'s error and
   empty states — `assert.match(table, /t\(["']readError["']\)/)` plus
   `assert.match(knowledgeEn.table.readError, /Could not read the index/)`, and the same shape
   for `emptyTitle`/"Nothing indexed yet". **Read the full current file
   (`scripts/check-admin-knowledge-contract.mjs`) before writing a new fix of this shape** — it's
   the template, don't reinvent the phrasing.
4. **Legal/consent text that a server hashes must never be translated.** Example:
   `src/components/voice/create-voice-profile-dialog.tsx`'s `CONSENT_ITEMS` — the server SHA-256s
   that exact English text as the record of what a person agreed to
   (`VoiceProfileConsentContract.CanonicalContractText`). Translating the display text would
   desync it from what the hash attests to. **Before translating anything that looks like a
   consent checkbox, terms acknowledgment, or legal confirmation, search for comments mentioning
   hashing/canonical text/server-side verification.** When in doubt, leave it English and ask.
5. **Data is not UI vocabulary — don't translate it.** Room names, document names, user-entered
   custom categories: never translate (they're content, not chrome). Fixed product enums shown
   as labels (e.g. `FACT_CATEGORIES` — "decision"/"requirement"/etc.) **are** UI vocabulary and
   should be translated, but only when the value is one of the known enum members — check with an
   `isKnownXxx()` type-guard before translating, falling through to the raw value otherwise (a
   user's own custom-typed category must render as typed, not get run through the catalog).
6. **Language *names* (`getLanguageName()` from `src/lib/language/languages.ts`) are deliberately
   always English**, regardless of UI locale — that registry is a separate concern (meeting/
   transcription language, not UI chrome) and its own doc comment says the UI for it is English
   throughout. Do not translate language names anywhere in the app.
7. **Use real ICU plurals when English actually distinguishes singular/plural**:
   `{count, plural, one {# document} other {# documents}}`, not string concatenation with a
   manual `? "" : "s"`. For `vi`/`ja` catalogs, only `{count, plural, other {...}}` is needed
   (per CLDR, neither language has a grammatical plural) — don't bother writing a `one` branch
   there, it will never be selected.
8. **Most containers in this codebase are already safe by construction** — either unconstrained
   width (chips, pills, buttons with no `w-*` class: they just grow) or already following the
   `flex-1 min-w-0` container + `truncate` label idiom (ellipsizes instead of overflowing). The
   real risk concentration, found by a full-codebase audit before batch 1, is:
   - Raw `<table>` elements with `w-[Npx]` on `<th>`/`<td>` — the shared `Table` primitive
     (`src/components/ui/table.tsx`) hard-codes `whitespace-nowrap` with **no** overflow
     protection, so a longer translated header/cell widens that column and shifts every column
     after it. Seen in `AdminInvoicesTab.tsx`, `billing/workspace/[id]/page.tsx`, `billing/page.tsx`,
     `billing/plans/page.tsx` — all still pending (batch 5/6).
   - `Badge` (`src/components/ui/badge.tsx`) has no `truncate`; safe when the badge is free-width,
     a real risk when placed in a fixed-width column with no additional truncate class (found:
     `members/page.tsx`'s Membership Type / Status badges, 100px columns — the Role badge next to
     them already got fixed once before after a real overflow bug, documented in a comment there;
     Membership Type / Status haven't been fixed — do it when batch 3 gets to `members/page.tsx`).
   - `Button` (`src/components/ui/button.tsx`) has zero overflow protection; only matters if a
     Button is ever given a fixed width for a text label (rare — 2 instances found, one dev-only).

## 6. Batch plan and current status

Sequential, agreed with the user; live-meeting room deliberately last (highest complexity/risk);
`src/app/dev/*` and `dev-test/page.tsx` excluded entirely (dev-only, `NODE_ENV`-gated, never
reach production).

| # | Batch | Scope | Status |
|---|---|---|---|
| A | Landing, auth, legal, primary nav | `src/app/page.tsx`, all 5 auth pages, terms/privacy, `linear-sidebar.tsx`, topbar `LanguageSwitcher` | ✅ Done |
| 1 | Core workspace, light | `home`, `tasks`, `ai-chat`, `dashboard`(+5 subcomponents), `knowledge`(+2 subcomponents incl. shared libs), `voice-profiles`(+5 subcomponents) | ✅ Done (commit `7f38b65e`) |
| 2 | Core workspace, lists | `rooms` (list only, not `[id]`), `history`, `schedules` | ⬜ Not started |
| 3 | Core workspace, content | `documents`(+`[documentId]`), `glossary`, `members` (⚠️ has the known badge-overflow gap above — fix it here) | ⬜ Not started |
| 4 | Settings & workspace billing | `settings/*`, `settings/billing/*`, `settings/account/*`, `member-roles`, `payment/plans` | ⬜ Not started |
| 5 | Admin console | All 13 `(app)/admin/*` pages + the admin nav / settings-nav branches inside `linear-sidebar.tsx` (deliberately deferred from batch A) | ⬜ Not started |
| 6 | Platform billing & workspace lifecycle | `(internal)/billing/*`, `workspace/create`, `workspace/join`, `workspace/plans`, `workspace/payment/*` — text-heavy onboarding copy, not just short labels | ⬜ Not started |
| 7 | Standalone routes | `join`, `download`, `payment-cancelled`, `room/[id]`, `rooms/[id]` (root-level) | ⬜ Not started |
| 8 | Live meeting room (last, highest risk) | `[workspaceSlug]/rooms/[id]/page.tsx`, `persistent-meeting-session.tsx` (3558 lines — the single largest file in the app), `meeting-control-bar.tsx`, `global-chatbot.tsx`, `meeting-transcript-panel.tsx`, rest of `rooms/live/*`. Many strings here are toasts for technical/error states — verify each is actually shown via `toast.*` (user-facing) before spending translation effort; some may be console-only diagnostics mistaken for UI text. | ⬜ Not started |

Also pending, not tied to one batch: the remaining `toast(...)` literal call sites app-wide
(~52 files, ~223 call sites before batch 1 started), email templates under `src/emails` (no
request-scoped locale cookie at send time — needs the recipient's saved preference passed
explicitly), and persisting locale preference server-side so it follows a user cross-device
(currently a browser cookie only — fine for now, not in scope to fix here).

## 7. Per-batch workflow — repeat exactly this for every batch

1. Read the batch's page(s) **and every subcomponent they actually render** — not just the
   top-level `page.tsx`. A page that looks translated but hands off to English subcomponents is
   not translated.
2. Extract every hardcoded string: JSX text, `placeholder`/`aria-label`/`title` attributes,
   `toast(...)` literals, zod validation messages.
3. Write/extend `messages/{en,vi,ja}/<namespace>.json`.
4. Wire components via `useTranslations()`/`getTranslations()`; convert zod schemas to factories
   where needed; apply the optional-translator pattern to any shared plain-function helper.
5. Run, in order, and fix anything that fails before moving on:
   ```bash
   npm run typecheck
   npm run lint
   npm run test:i18n-catalog
   npm run test:contracts
   npm run build
   ```
6. Visually verify in the browser across en/vi/ja if possible (see §8 — currently blocked in
   this environment; check whether your environment has a runnable backend before skipping this).
7. Commit the batch **alone**, with a detailed message (see `git log` on this branch for the
   established style — long body explaining *why*, not just *what*).
8. Push to `origin feature/i18n-vi-en-ja`.
9. Update `.agents/page-docs/i18n-localization.md`'s progress section.

## 8. Browser verification — currently blocked, check your environment

In the session that did batch 1, in-browser verification of any authenticated
`(app)/[workspaceSlug]/*` page was **not possible**: `warptalk-backend`'s gateway wasn't running,
and `src/proxy.ts` gates every such route behind an `HttpOnly` access-token cookie checked
server-side — there's no way to fake it from a script, so every attempt redirects to `/login`
before the page renders. Landing and the public auth pages (no auth gate) **were** verified live
in-browser during Phase A and did catch a real bug (see §9).

**If your environment has a runnable local backend** (`warptalk-backend` + Postgres, see that
repo's `docker-compose.dev.yml`), use it — real in-browser verification is strictly better than
the source-level reasoning batch 1 had to fall back on. If not, be explicit in your commit/doc
notes about what was verified by tooling (`typecheck`/`lint`/`test:contracts`/`build`) versus
what was verified by reading source and cross-referencing the risk audit in §5 — don't blur the
two the way a rushed report might.

## 9. One real bug this process already caught (proof the process works)

The landing page's Japanese hero headline visually overlapped itself:
`leading-[0.92]` (a line-height *shorter* than the font size) only works because Latin glyphs
leave slack above the cap height — a CJK glyph fills its entire em box, so the two lines of
Japanese text collided. Fixed with a locale-conditional `leading`/`tracking` value (see
`src/app/page.tsx`'s hero `<h1>`). **Lesson for any batch touching a large/display-size
heading**: `leading-` below ~1.0 or aggressive negative `tracking-` is a Latin-only assumption —
verify Japanese specifically, in the browser, not just by reading the catalog.

## 10. Quick command reference

```bash
# Full verification, in order
npm run typecheck
npm run lint
npm run test:i18n-catalog
npm run test:contracts
npm run build

# Just the i18n-specific tests
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test src/i18n/__tests__/catalog-completeness.test.ts
npm run test:english-ui
```
