# Global Glossary

## Route and Access

- Route: `/admin/global-glossary`
- Navigation: Platform section in `src/components/layout/linear-sidebar.tsx`
- Access: system administrators only; this is a platform-wide baseline, not a workspace-owned glossary.

## Current Behavior

- Search and filter terms by draft, published, or archived status.
- Create, edit, delete, publish, and archive terms.
- Bulk-import CSV rows and inspect per-term audit history.
- Editing supports the term, preferred translation, source/target language, business domain,
  definition, usage note, and priority.
- Published terms apply to opted-in workspaces. Workspace terminology takes precedence on a
  collision, and a workspace can opt out through `AiUsagePolicy.UseGlobalGlossary`.
- **2026-09-24:** the create-term and edit-term dialogs' form no longer caps itself to
  `max-h-[60vh] overflow-y-auto` — that wrapper showed a vertical scrollbar even though the six
  fields fit the dialog comfortably, since `DialogContent` (`src/components/ui/dialog.tsx`) has
  no height cap of its own to defer to. The form now just grows with its content, like the
  bulk-import dialog beside it. If a future field addition makes either form tall enough to
  genuinely risk overflowing a short viewport, re-add a height cap on the `DialogContent` itself
  (which every dialog on this page already sizes independently) rather than on the form.
- **2026-10-01 (WT-907):** the bulk-import dialog's `DialogContent` is now capped to the viewport
  (`max-h-[calc(100dvh-2rem)]`, `sm:max-h-[90dvh]`) with `grid-rows-[auto_minmax(0,1fr)_auto]`
  and `overflow-hidden`; the CSV/Templates tab body is wrapped in one
  `min-h-0 overflow-y-auto overscroll-contain` div. Previewing a long template in the Template
  Catalog used to make the dialog taller than the screen — it is centred with `translate-y`, so
  it spilled off both edges and the title and Import/Cancel buttons were unreachable without
  zooming out. Now only the body scrolls; header, tabs, and footer stay pinned. Same fix as the
  workspace import dialog (see `workspace-glossary.md`).

## Tabs: Terms + Import template (WT-880 follow-up, 2026-10-02)

- The page has two tabs (`CmsTabBar`, URL `?tab=import-template`): **Terms** (everything above) and
  **Import template** (`src/components/admin/glossary/import-template-editor.tsx`). The header's
  Bulk import / New term buttons show on Terms only.
- `/admin/glossary-templates` and its sidebar/palette/title/permission entries are removed (that
  page held `useState` only and saved nothing); `src/proxy.ts` forwards the old address to
  `/admin/global-glossary?tab=import-template`; `scripts/check-retired-admin-pages.mjs` pins both.
- The editor configures the glossary import FILE SHAPE every workspace downloads (no term
  content): per column group (Source/Target/General), order (up/down), shown/hidden, header name,
  aliases (comma-separated); per-language sample blocks as a card grid with an edit dialog, added
  from the published languages; and a live preview/download for any pair (same component as the
  workspace tab, unsaved changes included). Term and Translation are locked to their groups and
  cannot be hidden. Duplicate header names/aliases and a non-integer Priority sample are flagged
  before Save; the server re-validates.
- API (TranscriptService): `GET/PUT/DELETE /admin/global-glossary/import-template`
  (glossary:read / glossary:manage; PUT and DELETE audited as `glossary.template_updated` /
  `glossary.template_reset` on `glossary_import_template`). DELETE = "Reset to default". Staff
  without glossary:manage see it read-only.
- The bulk-import dialog lost its "Templates Catalog" tab; it is the CSV textarea only.

## Data and AI Flow

- UI uses `src/hooks/use-global-glossary.ts` and `src/services/global-glossary.service.ts`.
- TranscriptService owns CRUD, lifecycle, audits, and published-term embedding events.
- `GlossaryStartedEventConsumer` merges global and workspace terms into live STT/translation
  prompt context.
- `warptalk-ai/ai_assistant_worker/chat_tools.py` searches the dedicated
  `global_glossary` collection as the assistant fallback.

## Files Affected

- `src/app/(app)/admin/global-glossary/page.tsx`
- `src/hooks/use-global-glossary.ts`
- `src/services/global-glossary.service.ts`
- `src/types/global-glossary.ts`
- `src/components/layout/linear-sidebar.tsx`
- `scripts/check-2807-hotfix-contract.mjs`

## Testing Checklist

- Create a draft, edit every field, publish it, view its audit history, archive it, and delete it.
- Bulk-import a CSV containing `Term` and `Translation` headers.
- Import template tab: rename a column, move Definition to General, hide Part of speech, add a
  language block, Save, reload; the workspace tab shows the same file. Reset to default restores it.
  A duplicate alias blocks Save. /admin/glossary-templates forwards to the tab.
- Confirm non-system-admin users see the access-required state.
- Run `npm run test:2807-hotfix`, `npm run typecheck`, and the production build.
- Real prompt behavior still requires a live meeting/assistant run with published terms; source,
  contract, and build verification alone do not prove provider/model output.
