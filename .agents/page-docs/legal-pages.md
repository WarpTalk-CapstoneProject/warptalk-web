# Legal Pages (/terms, /privacy)

## Current Routes

- `/terms` — `src/app/terms/page.tsx`
- `/privacy` — `src/app/privacy/page.tsx`
- Both are public (listed in `src/proxy.ts`'s public paths) and are linked from the login form,
  the register page, and the landing footer.

## Latest Changes

### 2026-09-30 Published documents replace the placeholder (WT-835, WT-836, WT-841)

- **What changed:** the two routes used to render `LegalPlaceholder`, a short "not published yet"
  notice. They now render the full Terms of Use (19 sections) and Privacy Policy (15 sections) in
  en/vi/ja, written as the official version — no "Draft" banner and no "to confirm" markers, at
  the request of the project owner, who will review and amend the copy directly.
- **Landing footer (WT-841):** the Company column's "Terms and Condition" and "Privacy Policy"
  entries now link to `/terms` and `/privacy` instead of `#`. `footerCompanyKeys` became
  `footerCompany` (`{ key, href }[]`), mirroring `footerNavigation`. Blog and About still point at
  `#` — they have no page.
- **Files:**
  - `src/components/legal/legal-document.tsx` (new) — renders either document.
  - `src/lib/legal/legal-contact.ts` (new) — contact email and effective date.
  - `src/components/legal/legal-placeholder.tsx` — deleted.
  - `src/app/terms/page.tsx`, `src/app/privacy/page.tsx` — render `<LegalDocument kind=… />`.
  - `messages/{en,vi,ja}/legal.json` — `placeholder.*` replaced by `document.*`;
    `terms.sections` and `privacy.sections` added.
  - `src/app/page.tsx` — footer Company links.

## How It Works

- The copy lives only in the `legal` catalog. Each document is `{ title, summary, sections }`;
  `sections` is an ordered object of `{ heading, body: string[] }`, keyed by a stable id that is
  also the section's anchor (e.g. `/privacy#retention`).
- `LegalDocument` reads `sections` with `t.raw`, so body strings are **not** ICU-parsed. Two
  conventions apply inside `body`:
  - a paragraph starting with `- ` is a list item; consecutive items render as one `<ul>`;
  - `{email}` is replaced with `LEGAL_CONTACT_EMAIL`.
- Layout: brand link → title → "Effective {date}" (formatted per locale from
  `LEGAL_EFFECTIVE_DATE`) → summary → table of contents → sections → contact line and links to
  the other document, home and sign-in.
- Arrays count as keys in `test:i18n-catalog` (`body.0`, `body.1`, …), so **every locale must have
  the same number of paragraphs in each section**. Add or remove a paragraph in all three at once.
- `mergeWithFallback` replaces arrays wholesale, so a vi/ja section is never a mix of locales.

## Content Summary

- **Terms:** acceptance; eligibility (16+) and accounts; workspaces and the Workspace Owner's
  control; the Service; AI output accuracy; recording/transcription consent (the host's
  responsibility, including desktop-app capture); voice profiles (own voice or documented
  permission, no impersonation); acceptable use; content ownership and licence (no training of
  general-purpose models); plans, Stripe payments, auto-renewal, credits, refunds, 30-day price
  notice; third-party integrations; IP; suspension/termination; disclaimers; liability cap
  (greater of 12 months' fees or 1,000,000 VND); indemnity; changes (30-day notice for material
  changes); Vietnamese law, 30-day negotiation then Vietnamese courts; contact.
- **Privacy:** scope (Decree 13/2023/ND-CP, GDPR where applicable); WarpTalk vs Workspace Owner
  roles; data collected (account incl. Google/Microsoft sign-in, workspace, meeting content, voice
  samples, generated content, usage/device, sessions, Stripe, connected integrations); purposes
  and legal bases; AI processing by speech/translation/LLM/voice providers, no training, live
  audio not stored unless recorded/transcribed; voice profiles (consent, deletion within 30 days,
  no biometrics); sharing (no sale, no ad sharing); international transfers; retention (workspace
  setting, 30 days after account deletion, 90-day backups, 12-month logs); security; data subject
  rights; essential cookies only; children under 16; changes; contact.

## Known Limitations / Needs Owner Review

The documents are published as final, but these statements were written from what the codebase
shows and should be checked by the team:

- Contact mailbox `support@warptalk.io.vn` (`src/lib/legal/legal-contact.ts`) — confirm it exists.
- Operator identity: the documents say "WarpTalk"; no legal entity name, address or registration
  number is given.
- Minimum age 16, liability cap 1,000,000 VND, 30-day deletion, 90-day backups, 12-month logs,
  30-day notice periods, refund policy, credit expiry.
- "Providers do not train on your content" and "live audio is not stored" depend on provider
  contracts and backend behaviour.
- Page `<title>` metadata is still static English (same limitation as other pages, see
  `i18n-localization.md`).

## Testing Checklist

- [x] `npm run typecheck`, `npx eslint` on touched files — clean.
- [x] `npm run test:i18n-catalog` — en/vi/ja key parity, including every `body.N`.
- [x] `npm run test:english-ui` — no inline non-English copy in `src/`.
- [x] `npm run test:contracts` — passes.
- [x] Browser: `/privacy` (vi), `/terms` (ja, en) render title, effective date, TOC and all sections.
- [x] Browser: landing footer links to `/terms` and `/privacy`.

## Notes for Future Maintainers

- Changing the mailbox or effective date is a one-line edit in `src/lib/legal/legal-contact.ts`.
- Material changes to either document should bump `LEGAL_EFFECTIVE_DATE` and, per the documents'
  own "Changes" sections, be announced to users before they take effect.
- Keep section ids stable — they are public anchors.
