# UI Localization (i18n) — English / Vietnamese / Japanese

## Purpose

WarpTalk's UI ships in three display languages — English (`en`), Vietnamese (`vi`), Japanese (`ja`) — chosen by the person using the app, independent of the meeting/transcription language they speak. Ticket: WT-607.

This is a **from-scratch i18n layer**: before this, `warptalk-web` had none (see `scripts/check-english-ui.mjs`'s original doc comment), and the shipped UI was English-only by explicit CI-enforced policy. This doc is the "how do I add a new translatable string" reference the ticket's acceptance criteria asked for.

**Do not confuse this with `src/lib/language/languages.ts`.** That file is the meeting/transcription language registry (source/target language for live translation, room language policy) — a completely separate concern from the UI chrome text this doc covers. "Locale" in this doc always means UI display language; "language" elsewhere in the codebase usually means meeting content language.

## Architecture

- **Library**: [`next-intl`](https://next-intl.dev), the standard for Next.js App Router.
- **No URL locale prefix.** `warptalk-web`'s routes already use `(app)/[workspaceSlug]/...` as the first dynamic segment under 115+ pages. Rather than restructure every route under `app/[locale]/...` (a large, risky migration touching every internal link, invite link, and email redirect), locale is resolved **without changing the URL**: a `WARPTALK_LOCALE` cookie (falling back to the browser's `Accept-Language`, then `en`). See `src/i18n/locale.ts` (`getUserLocale`) and `src/i18n/actions.ts` (`setUserLocale`, a server action that writes the cookie).
- **Request config**: `src/i18n/request.ts` — `next-intl`'s `getRequestConfig`, resolves the locale and loads/merges that locale's message namespace files.
- **Provider wiring**: `src/app/layout.tsx` is an async Server Component; it reads the resolved locale (`getLocale()`), sets `<html lang={locale}>`, and wraps the existing client `<Providers>` tree in `<NextIntlClientProvider>`.
- **`next.config.ts`** is wrapped with `createNextIntlPlugin("./src/i18n/request.ts")`.
- **Message catalogs** live at the repo root in `messages/{en,vi,ja}/*.json` — **outside** `src/`. This is deliberate: `scripts/check-english-ui.mjs` scans only `src/**/*.{ts,tsx}` for non-English characters, so keeping catalogs outside `src/` means that guard keeps doing useful work — it still blocks anyone from pasting raw Vietnamese/Japanese text directly into a component instead of going through the catalog.
- **Switching locale**: `src/components/layout/language-switcher.tsx` — a dropdown that calls the `setUserLocale` server action, then `router.refresh()`. Wired into the landing navbar, all five auth pages (via `CinematicAuthShell` for forgot/reset/verify, and directly on login/register), and belongs on the authenticated app shell next (see Phase B below).

## How to add a new translatable string

1. **Pick (or create) a namespace file.** Namespaces mirror feature areas: `common` (shared chrome — buttons, nav, toasts used everywhere), `auth`, `landing`, `legal`, `validation`. A new feature area gets its own file, added to `NAMESPACES` in `src/i18n/request.ts` and created as `messages/{en,vi,ja}/<namespace>.json`.
2. **Add the English key first** (`messages/en/<namespace>.json` is the source of truth) — nested objects are fine, e.g. `"toasts": { "saveFailed": "..." }` is read as `t("toasts.saveFailed")`.
3. **Add the same key to `messages/vi/<namespace>.json` and `messages/ja/<namespace>.json`.** Translate for meaning and tone, not word-for-word — Vietnamese and Japanese have different sentence structure, and a literal translation usually reads as broken. Use `{placeholder}` for interpolated values (e.g. `"Switched to workspace \"{name}\""` — ICU-style, resolved via `t("key", { name })`).
4. **Read it in the component:**
   - Client Component: `const t = useTranslations("landing"); ... {t("hero.title")}`
   - Server Component: `const t = await getTranslations("legal.terms"); ... {t("title")}`
5. **Zod validation schemas** can't call `useTranslations()` at module scope (it's a hook). Pattern used throughout the auth pages: turn the schema into a factory function that takes a translator, e.g. `getLoginSchema(tv: ReturnType<typeof useTranslations>)`, and build it inside the component with `useMemo(() => getLoginSchema(tv), [tv])` where `tv = useTranslations("validation")`.
6. **Plain (non-component) helper functions** that produce user-facing text (e.g. `src/lib/utils.ts`'s `getPlanDescription`/`buildFeatureList`) take an **optional** translator parameter defaulted to the pre-migration English strings, so call sites that haven't been migrated yet keep compiling and keep their existing copy — see that file for the exact pattern.
7. **Run `npm run test:i18n-catalog`** before committing — it fails loudly if a key exists in `en` but is missing (or renamed) in `vi`/`ja`, so a forgotten translation can't silently fall back to English in production. It's wired into `npm run test:contracts`.
8. **Never hardcode a raw Vietnamese/Japanese string directly in a `.tsx`/`.ts` file under `src/`** — `npm run test:english-ui` will fail the build. If you genuinely need literal non-English data (e.g. a language-name table), mark the block with an `i18n-allow` comment, same convention as `src/lib/language/languages.ts`.

## Deliberately not translated (documented, not accidental)

A few spots keep English-only text on purpose, called out inline in the code with a comment:

- **`src/app/page.tsx`**: the hand-tuned SVG story-board branch labels (`live`, `low latency`, `room signal`, crossing-diagram language names, `decisions`/`questions`/etc.) and the small `feature-wave-labels`/`feature-language-line` word chips. These are positioned/sized against exact English character widths in a bespoke animation; translating them needs per-locale layout re-tuning, not a blind string swap.
- **`src/app/page.tsx`**'s `LoadingScreen` splash (`loaderWords`, the `WalpTalk` wordmark) — transient branding, not information-bearing.

## What's migrated (Phase A) vs. what's next (Phase B)

Per WT-607's own scope ("không cần dịch toàn bộ ứng dụng trong ticket đầu tiên này nếu blast radius quá lớn"), this rollout is intentionally a vertical slice + a repeatable pattern, not a full-app pass in one PR.

**Done:**
- Landing page (`src/app/page.tsx`) — nav, hero, feature/signal copy, pricing chrome, footer.
- All five auth pages — login, register (+ zod schemas), forgot-password, reset-password, verify-email — and `CinematicAuthShell`/`LegalPlaceholder` shared components.
- `terms` / `privacy` pages.
- The primary authenticated app nav in `linear-sidebar.tsx` (`mainNav`, `workspaceNav`, the workspace-switch toasts).

**Not yet migrated — follow the pattern above, page by page:**
- The ~100 remaining authenticated app pages (dashboard, rooms, admin console, settings, billing, etc.).
- The admin console nav and the settings-page collapsed nav inside `linear-sidebar.tsx` (same file as the migrated nav — deliberately scoped out this pass, see `app-layout.md`).
- The remaining `toast(...)` call sites outside the migrated files (~60+ across the app).
- Email templates under `src/emails` (React Email renders server-side without the request-scoped locale cookie readily available; needs the recipient's saved locale preference passed explicitly at send time).
- Persisting a user's locale preference server-side (`warptalk-backend`) so it follows them across devices — today it's a browser cookie only, which is enough for a working feature but not cross-device.

## Files Affected

- `src/i18n/locale.ts`, `src/i18n/actions.ts`, `src/i18n/request.ts`, `src/i18n/catalog-completeness.ts`, `src/i18n/__tests__/catalog-completeness.test.ts`
- `messages/{en,vi,ja}/{common,auth,landing,legal,validation}.json`
- `src/components/layout/language-switcher.tsx`
- `src/app/layout.tsx`, `next.config.ts`, `package.json`
- `src/app/page.tsx`, `src/lib/utils.ts`
- `src/app/(auth)/{login,register,forgot-password,reset-password,verify-email}/page.tsx`, `src/components/auth/cinematic-auth-shell.tsx`
- `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/components/legal/legal-placeholder.tsx`
- `src/components/layout/linear-sidebar.tsx`
- `scripts/check-english-ui.mjs` (doc comment only — logic unchanged)

## Typography note — CJK needs different metrics

The landing hero (`src/app/page.tsx`) sets its `<h1>` leading/tracking **per locale**:

```
locale === "ja" ? "leading-[1.14] tracking-[-0.02em]" : "leading-[0.92] tracking-[-0.065em]"
```

This is not cosmetic fine-tuning — it fixes a real defect found during browser verification. `leading-[0.92]` builds a line box *shorter than the font size*, which only works because Latin glyphs leave slack above the cap height. A CJK glyph fills its full em box, so at 0.92 the two lines of the Japanese headline physically overlapped on screen. The negative letter-spacing is relaxed for the same reason: `-0.065em` is tuned for Latin sidebearings and visibly crowds kana/kanji.

**Watch for this whenever you translate a display-size heading**: any `leading-` below ~1.0 or aggressive negative `tracking-` will break in Japanese. Latin-tuned metrics are not locale-neutral. Verify in the browser, not just in the catalog.

## Known Limitations

- No per-locale URLs — a `vi`/`ja` reader and an `en` reader see the same URL for the same page. Acceptable since these routes are either behind auth or single-instance marketing pages with no per-locale SEO requirement today.
- `<title>`/`<meta description>` metadata (`export const metadata` in page files) is still static English — `generateMetadata` per-locale is a follow-up if SEO/tab-title localization is wanted. Confirmed in-browser: `/terms` renders fully translated body copy while its tab title stays "Terms of use | WarpTalk".
- Locale preference is a browser cookie, not tied to the user's account — clearing cookies or switching browsers resets it to `en`/`Accept-Language`.
- **A validation error already on screen keeps its old-locale text until validation re-runs.** react-hook-form stores the *resolved string* in `formState.errors`, so switching locale while an error is visible leaves the previous language's message in place; it corrects itself on the next submit/validate. Verified as recoverable, not stuck. Only worth fixing (by storing keys and resolving at render) if it turns out to bother real users.
- Long-form legal content (terms/privacy) still only has the same short English-authored placeholder summary translated into vi/ja — actual legal copy, whenever written, needs its own translation pass.

## Testing Checklist

- [x] `npm run typecheck` passes; `npm run lint` reports 0 errors (43 pre-existing warnings, none in i18n-touched files).
- [x] `npm run test:i18n-catalog` passes (vi/ja key parity against en — 11 subtests).
- [x] `npm run test:english-ui` passes (no raw non-English literals leaked into `src/`).
- [x] `npm run test:contracts` passes end-to-end (exit 0, no failures) — confirms none of the ~155 existing structural/text contract checks broke on the touched files.
- [x] `npm run build` succeeds (Turbopack production build, 84 routes).
- [x] Manual: `/` switched en → vi → ja via the switcher; copy updates and **persists across navigation** (cookie is read server-side, so SSR output is already in the chosen locale).
- [x] Manual: `/login` — UI copy and **zod validation messages** translate (`Địa chỉ email không hợp lệ` / `メールアドレスの形式が正しくありません`), confirming the schema-factory pattern works.
- [x] Manual: `/register`, `/forgot-password`, `/reset-password`, `/verify-email` all render translated (the last three via `CinematicAuthShell`).
- [x] Manual: `/terms` renders translated title/summary/disclaimer through the Server Component `getTranslations` path.
- [x] Fixed during verification: Japanese hero headline lines overlapped — see "Typography note" above.
- [ ] Manual: inside a workspace (needs a running backend), confirm the sidebar nav labels translate. Not exercised — the local backend/gateway was not running during this pass, so authenticated routes could not be loaded. The sidebar strings are covered by `test:i18n-catalog` and typecheck, but have not been seen on screen.
