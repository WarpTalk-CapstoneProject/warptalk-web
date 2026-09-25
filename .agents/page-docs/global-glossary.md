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
- Confirm non-system-admin users see the access-required state.
- Run `npm run test:2807-hotfix`, `npm run typecheck`, and the production build.
- Real prompt behavior still requires a live meeting/assistant run with published terms; source,
  contract, and build verification alone do not prove provider/model output.
