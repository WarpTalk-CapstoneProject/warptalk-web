# Document detail page (`/{workspaceSlug}/documents/{documentId}`)

## What changed (WT-843, 2026-09-30)

- **i18n**: the page never used `next-intl`; every toast, button label and the not-found state was
  hardcoded English. All strings now come from `useTranslations("documents.detail")`, with keys in
  `messages/{en,vi,ja}/documents.json` under `detail` (`notFound.*`, `approve`, `reject`,
  `download`, `backToLibrary`, `toasts.*`).
- **docx preview XSS**: `DocumentPreview.tsx` renders mammoth's docx→HTML output with
  `dangerouslySetInnerHTML`. mammoth passes hyperlink hrefs through verbatim (including
  `javascript:`), and the preview is shown *before* a document is approved. The HTML is now passed
  through `DOMPurify.sanitize()` (dynamic import, client-only) before `setWordHtml`.
  New dependency: `dompurify` (+ `@types/dompurify`).

## Files affected

- `src/app/(app)/[workspaceSlug]/documents/[documentId]/page.tsx`
- `src/app/(app)/[workspaceSlug]/documents/[documentId]/components/DocumentPreview.tsx`
- `messages/{en,vi,ja}/documents.json`
- `package.json`, `package-lock.json`

## How it works now

- Not-found / query error: toast `detail.notFoundError`, redirect to the documents list; the
  not-found card uses `detail.notFound.*`.
- Approve / Reject / Download / revision upload / visibility / AI-indexing actions show toasts from
  `detail.toasts.*`. A server-provided `response.data.error` still takes precedence over the
  localized fallback.
- Word preview: mammoth → DOMPurify → dangerouslySetInnerHTML. Any parse failure falls back to the
  "download the file" notice.

## Documents list: WarpBot knowledgebase wording (WT-880 follow-up, 2026-10-02)

The list's AI status badge (`documents/page.tsx`, from the real `ingestionStatus`) now reads
"Loading into WarpBot knowledgebase…" / "Ready in WarpBot knowledgebase" / "Couldn't load into
WarpBot knowledgebase" (`documents.status.*` in en/vi/ja), and the realtime toast uses the same
wording, with a new error toast on `DocumentFailed`. No logic change to the status itself. See
`workspace-glossary.md` for the glossary side.

## Known limitations

- The realtime toasts in `realtime-notification-provider.tsx` are English-only (that provider has no
  message bundle).
- Server error messages (`response.data.error`) are not localized.
- Other preview kinds (PDF, sheet, text) were not touched.

## Testing checklist

- [ ] Switch language en/vi/ja: buttons, toasts and not-found card translate.
- [ ] Open a non-existent document id: toast + redirect.
- [ ] Preview a docx containing a `javascript:` hyperlink: link is neutralized, headings/lists/tables still render.
- [ ] Approve, reject, download, re-upload revision, change visibility, toggle AI indexing.

## Notes for maintainers

- Add new strings to all three locale files; `node scripts/check-english-ui.mjs` guards hardcoded English.
- Never render externally-authored HTML without sanitizing first.
