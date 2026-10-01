# Workspace Glossary

## Overview

- Route: `/[workspaceSlug]/glossary`
- Page: `src/app/(app)/[workspaceSlug]/glossary/page.tsx`
- Purpose: workspace-owned glossaries and terms that feed live STT/translation prompt context.
  Workspace terms win over the platform baseline (see `global-glossary.md`).

## Import dialog and Template Catalog

- Component: `src/components/glossary/glossary-import-dialog.tsx` (`GlossaryImportDialog`), opened
  from the page's **Import** buttons and after **New glossary** when "import after create" is set.
- Two tabs:
  - **Upload file** — `.xlsx` / `.csv` parsed client-side, previewed in a table, then imported.
  - **Templates Catalog** — `src/components/glossary/glossary-template-gallery.tsx`
    (`GlossaryTemplateGallery`), backed by `src/lib/glossary/glossary-templates-catalog.ts`. The
    user filters by language, picks a template card, previews its terms (a `max-h-[160px]`
    scrolling table), can download it as XLSX/CSV, or loads its rows into the Upload tab.
- The same gallery is also embedded in the admin bulk-import dialog on `/admin/global-glossary`.

## Layout behaviour (WT-886, WT-907)

- `DialogContent` (`src/components/ui/dialog.tsx`) is a fixed, centred CSS grid with **no height
  cap** of its own, so each dialog that can grow tall must cap itself.
- WT-886: `grid-cols-[minmax(0,1fr)]` pins the column to the dialog width so an unbreakable term
  in the preview cannot widen the dialog; width override is `sm:max-w-[760px]`.
- **2026-10-01 (WT-907):** previewing a long template (e.g. IT & Software DevOps, Business & Agile)
  made the dialog taller than a laptop viewport (measured 831px at 1366×768). Because it is
  centred with `translate-y`, it spilled off both the top and bottom edges and nothing scrolled,
  so the title, tabs and Import/Cancel buttons were unreachable without zooming out. Fix:
  - `DialogContent` gets `max-h-[calc(100dvh-2rem)] sm:max-h-[90dvh]`,
    `grid-rows-[auto_minmax(0,1fr)_auto]` and `overflow-hidden`.
  - Both tab bodies sit in one wrapper `-mx-4 min-h-0 overflow-y-auto overscroll-contain px-4`
    (negative margin + padding keeps the scrollbar on the dialog edge without clipping focus
    rings). Header/tabs and the footer stay pinned; only the body scrolls.
  - The shared `dialog.tsx` was deliberately left unchanged so other dialogs are unaffected.

## Files Affected (WT-907)

- `src/components/glossary/glossary-import-dialog.tsx`
- `src/app/(app)/admin/global-glossary/page.tsx` (same fix for the admin bulk-import dialog)

## Known Limitations

- Dialogs elsewhere that use the base `DialogContent` still have no viewport cap; apply the same
  pattern if one of them can grow taller than the screen.

## Testing Checklist

- At 1366×768, 1280×600 and a ~390px-wide mobile viewport: Glossary → Import → Templates Catalog →
  pick a long template. The dialog must stay fully inside the viewport, the body must scroll, and
  the title/tabs and Cancel/Import buttons must stay visible.
- Load a template into the Upload tab and import; parse a large `.xlsx` with errors and confirm
  the error list also scrolls within the dialog.
- `npm run typecheck` and `npm run lint`.
