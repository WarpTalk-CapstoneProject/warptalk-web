# Legal Pages (/terms, /privacy)

## Current Routes

- `/terms` — `src/app/terms/page.tsx`
- `/privacy` — `src/app/privacy/page.tsx`
- Both are public (listed in `src/proxy.ts`'s public paths) and are linked from the login form,
  the register page, and the landing footer.

## Latest Changes

### 2026-09-30 Aligned with current Vietnamese law (follow-up review)

Checked the first version against current law and against comparable products, then amended all
three locales (paragraph counts kept in sync; `terms.sections.law` gained one paragraph):

- **Privacy — legal basis:** Decree 13/2023/ND-CP was replaced on 2026-01-01 by the Law on Personal
  Data Protection No. 91/2025/QH15 and its guiding Decree 356/2025/ND-CP; `scope` now cites those.
- **Privacy — voice data:** voice samples/profiles are biometric data, i.e. *sensitive* personal data
  under Decree 356. `voice` now says so, and requires separate explicit consent after the user is
  told the data is sensitive. `use` lists processing without consent only where the law allows
  (contract, legal obligation, protecting life/health/property).
- **Privacy — breaches:** `security` names the risks of online processing and the 72-hour
  notification to affected users for incidents involving biometric data.
- **Privacy — rights:** `rights` warns that withdrawing consent/deleting data may disable features.
- **Terms — consumer protection (Law 19/2023/QH15, Art. 25):** a standard-form contract may not
  limit liability owed to consumers under law, change terms or prices unilaterally without a right
  to terminate, or auto-renew without prior notice. So: the liability cap now applies only to
  business use and consumers keep their statutory rights (`liability`); renewal reminder
  (`payment.1`); refunds "except where required by law, including consumer rights" (`payment.3`);
  cancel without penalty on a price change (`payment.4`); terminate with pro-rata refund on a
  material Terms change (`changes.1`); consumer complaint/lawsuit rights preserved (`law.1`);
  ambiguous terms read in the consumer's favour and the Vietnamese version prevails (`law.3`).

Sources consulted (via web search; several primary-text sites were blocked by the sandbox proxy):
Law 91/2025/QH15 and Decree 356/2025/ND-CP (luatvietnam.vn, thuvienphapluat.vn summaries,
vietnam-briefing.com); Law 19/2023/QH15 Art. 23/25 (moit.gov.vn, pbgdpl.camau.gov.vn); Zoom's and
Otter.ai's published positions on AI training and retention for comparison.

Still not legal advice — have a qualified reviewer sign off before relying on the documents.

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
  for business use only (greater of 12 months' fees or 1,000,000 VND), consumers keep statutory rights; indemnity; changes (30-day notice for material
  changes); Vietnamese law, 30-day negotiation then Vietnamese courts, consumer-favourable interpretation,
  Vietnamese version prevails; contact.
- **Privacy:** scope (Law 91/2025/QH15 + Decree 356/2025/ND-CP, GDPR where applicable); WarpTalk vs Workspace Owner
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
