# Workspace Glossary

## Overview

- Route: `/[workspaceSlug]/glossary`
- Page: `src/app/(app)/[workspaceSlug]/glossary/page.tsx`
- Purpose: workspace-owned glossaries and terms that feed live STT/translation prompt context.
  Workspace terms win over the platform baseline (see `global-glossary.md`).

## Import template (WT-880 follow-up, 2026-10-02)

What changed and why: the PO ruled that a glossary "template" is a FILE SHAPE (header row + columns
grouped Source / Target / General), not a pack of domain terms. The old "Templates Catalog" poured
terms of a fixed pair into whatever glossary was open (WT-522 again) and persisted nothing.

- **Third tab "Import template"** (beside Custom Glossary / Global Glossary),
  `src/components/glossary/workspace-import-template-view.tsx`. Every workspace member sees it
  (PO decision). The reader picks a source → target pair from every language the platform admin has
  published (`GET /translation-rooms/published-languages`; NOT the workspace policy — PO decision),
  defaulting to the open glossary's pair. Shows the group band, header and faint sample row
  (`src/components/glossary/import-template-preview.tsx`), downloads `.xlsx` (band + header +
  grey italic sample row) or `.csv` (header + sample, BOM), and lists each column with its group and
  accepted aliases.
- The file is built per pair from per-language blocks (`src/lib/glossary/import-template.ts`,
  `buildImportTemplateLayout`): Source columns from the source language's samples, Target columns
  from the target's, General from the source's. EN→VI to EN→JA changes only the Target group.
  Missing values fall back to the English block's text, except Term/Translation, which get a
  `<translation in X>` placeholder (never an invented word).
- Default groups (PO decisions): Source = Term, Context, Part of speech; **Target = Translation,
  Definition, Note** (a definition is written in the target language — "Bug" in EN→JA is defined in
  Japanese); General = Field, Priority. Samples follow the PO's example (`Bug | 不具合 |
  ソフトウェアの欠陥や誤動作`, `Bug | Bug | A defect in software…`, `Bug | lỗi phần mềm | …`, Field
  "Software engineering").
- Config comes from `GET /glossaries/import-template` (`useGlossaryImportTemplate`); while it loads
  or if it fails, `DEFAULT_IMPORT_TEMPLATE` (identical to the server default) is used.

## Import dialog

- Component: `src/components/glossary/glossary-import-dialog.tsx` (`GlossaryImportDialog`), opened
  from the page's **Import** buttons and after **New glossary** when "import after create" is set.
- One body (the Templates Catalog toggle is gone). The quick line offers "Download template for
  {source} → {target} (.xlsx)" for the open glossary's pair and "View template", which closes the
  dialog and opens the Import template tab (`onViewTemplate`).
- Parsing is `parseGlossaryMatrix`: the header is found in the first 10 rows (so the band row is
  stepped over) using the admin's names/aliases layered over `LEGACY_HEADER_ALIASES` (old files keep
  importing); headers compare case-insensitively and ignore a trailing "(Language)". The first data
  row is skipped when it is the template's sample (grey italic style in .xlsx, a `<…>` placeholder,
  or exactly a configured sample term + translation); the dialog says so.

## Language pair: filter, grouping, and change in place (PO, 2026-10-02)

- The glossary chips above the tabs are grouped under a small pair label and filterable with a
  compact "All pairs / English → Vietnamese (n)" select (`src/lib/glossary/glossary-pairs.ts`,
  `groupGlossariesByPair`, tested). The pair is one unit. A filtered-out selection falls back to the
  first visible glossary; the row wraps at narrow widths.
- The same source term living in glossaries of different pairs is normal (one dictionary per pair);
  duplicate checks stay within one glossary.
- Under the tabs, the open glossary's name sits beside `GlossaryPairEditor`
  (`src/components/glossary/glossary-pair-editor.tsx`): Owner/Admin can change source/target
  (published languages) via `PUT /glossaries/{id}/languages`. Terms are not re-translated; when the
  glossary has terms an inline confirm says "Existing translations stay as they are. Change to …?"
  (no window.confirm). The chip moves to its new group, and the dialog's download / template tab
  follow the new pair.

## Files Affected (WT-880 follow-up)

- `src/app/(app)/[workspaceSlug]/glossary/page.tsx`
- `src/components/glossary/{glossary-import-dialog,import-template-preview,workspace-import-template-view,glossary-pair-editor}.tsx`
- `src/lib/glossary/{import-template,import-template-file,glossary-pairs,domain-term-packs}.ts`
- `src/hooks/use-glossary-import-template.ts`, `src/hooks/use-workspace.ts`,
  `src/services/glossary-import-template.service.ts`, `src/services/workspace.service.ts`,
  `src/types/glossary-import-template.ts`, `src/lib/api/endpoints.ts`
- Deleted: `src/components/glossary/glossary-template-gallery.tsx`, `src/lib/glossary/sample-template.ts`
  (+ test; replaced by `import-template.test.ts`). The six domain packs live on as
  `BUILT_IN_DOMAIN_TERM_PACKS` in `domain-term-packs.ts`, wired to no UI.

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

- Import template tab as a Member: switch EN→VI to EN→JA (only Target columns change), download
  .xlsx and .csv, open them in Excel, import them back unchanged → "no rows" with the sample skipped;
  add one row → exactly one term imported.
- Import an old file with header `Term, Translation, Context, Field, Definition, Note, Part of
  speech, Priority` → still imports.
- Change a glossary's pair (with and without terms): inline confirm appears only with terms; the
  chip moves group; the dialog's download names the new pair. A Member sees the pair read-only.
- Pair filter: select a pair that hides the open glossary → the first visible one opens.
- At 1366×768 and ~390px wide the dialog stays inside the viewport and the chip row wraps.
- `npm run -s test:glossary-template`, `npx tsc --noEmit -p .`, eslint on changed files.
