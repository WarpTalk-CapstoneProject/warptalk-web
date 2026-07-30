# Personal Preferences

The Personal Preferences page loads the authenticated user's settings from Auth Service and saves each valid change automatically.

## Current behavior

- Selects and switches enqueue a partial update immediately after the user changes them.
- Numeric fields (`defaultMaxParticipants` and `transcriptFontSize`) commit on `Enter` or blur, not on every keystroke.
- Numeric values are validated in the browser before a request is queued: participants are `1–500`, and transcript font size is `10–32`, both as integers.
- Requests are processed in order in memory for the current page session. A failed request remains pending until the user retries it.
- The header badge reports `All changes saved`, `Saving changes...`, or `Changes not saved`.
- Room type values match the Auth Service contract: `instant` and `scheduled`.

## Data flow

`page.tsx` -> `authService.updateSettings` (partial `UpdateUserSettingsRequest`) -> Auth Service `PUT /api/v1/auth/settings`.

The successful response updates the React Query cache. A reload therefore reads the latest persisted settings from the backend.

## Important files

- `src/app/(app)/[workspaceSlug]/settings/account/preferences/page.tsx`
- `src/hooks/use-auto-save.ts`
- `src/components/features/settings/auto-save-status-badge.tsx`
- `src/services/auth.service.ts`

## Known limitations

- The in-memory queue is not persisted across a full browser restart. The page warns before unloading while a request is pending.
- Server-side validation remains authoritative even when browser validation passes.

## Testing checklist

- Typecheck with `npx.cmd tsc --noEmit`.
- Verify boundary values and invalid numeric values in the browser.
- Verify Enter and blur do not issue duplicate requests.
- Verify reload reads the saved values from Auth Service.
