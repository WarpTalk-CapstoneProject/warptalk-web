# Language Configuration

## Route

- Frontend route: `warptalk-web/src/app/(app)/room/[id]/page.tsx`
- Ticket: WT-95 - FE 1.5 Build Language Configuration UI.

## Scope

WT-95 adds room-level language configuration controls for the host-facing translation room. It is intentionally separate from lifecycle, feedback, history, and module-demo integration work.

## Current Behavior

The room page now shows a Language configuration card above the transcript area. The card lets the host:

- Select the room source language from `SUPPORTED_LANGUAGES`.
- Switch between `single` and `multi` translation modes.
- Select one target language in single mode.
- Select up to three target languages in multi mode.
- Reset back to the default language policy.
- Preview the backend payload shape: `sourceLanguage` and serialized `targetLanguages`.
- See participant speak/listen language pairs using normalized display names.

The page header also summarizes the active language policy so the source and target set are visible while in the room.

## Language Rules

- Source language is normalized with `normalizeLanguageCode`.
- Target language options come from `getAvailableTargets(sourceLanguage)`, which excludes the current source language.
- Single mode keeps exactly one target language.
- Multi mode keeps up to three target languages.
- If a source change invalidates the selected targets, the UI chooses the first supported target fallback.

## Realtime Mapping

The current SignalR join call uses:

- `languagePolicy.sourceLanguage` as `speakLanguage`.
- The first selected target as `listenLanguage`.

Audio chunk sending uses `languagePolicy.sourceLanguage` as the language argument so downstream translation routing can align with the configured room source.

## Backend Mapping

WT-95 keeps the frontend contract aligned with the existing translation room DTO shape:

- `sourceLanguage`: room source language.
- `targetLanguages`: comma-separated targets produced by `serializeTargetLanguages`.
- `translationMode`: frontend policy only for now, derived from selected target count and mode control.

A future backend endpoint should persist live room language changes. Until then, the UI acts as a local room policy preview.

## Files Affected

- `src/app/(app)/room/[id]/page.tsx`
- `.agents/page-docs/language-configuration.md`

## Testing Checklist

- Open `/room/{id}` and confirm the Language configuration card appears.
- Change source language and verify the available target buttons exclude the source.
- Switch to single mode and confirm only one target remains selected.
- Switch to multi mode and confirm up to three targets can be selected.
- Confirm the header language summary updates after changing source or targets.
- Confirm participant language preview uses readable language names.
