# User Profile Management

The Profile page loads the authenticated user's profile and auto-saves editable fields without a bottom Save button.

## Current behavior

- Full name and phone commit on `Enter` or blur.
- Preferred language and timezone commit immediately when selected.
- Preferred language falls back to `en` only when the API omits it.
- Timezone falls back to the browser's IANA timezone and then `UTC`; the timezone list is read from the runtime catalog.
- Full name is rejected locally when blank. Phone may be cleared by saving an empty string.
- Profile requests are partial and serialized by the in-memory auto-save queue.
- Successful responses update the auth store; the header badge reports saved, saving, or failed state.

## Data flow

`page.tsx` -> `authService.updateProfile` -> Auth Service `PUT /api/v1/auth/me`.

## Important files

- `src/app/(app)/[workspaceSlug]/settings/account/profile/page.tsx`
- `src/hooks/use-auto-save.ts`
- `src/components/features/settings/auto-save-status-badge.tsx`

## Known limitations

- Pending changes are kept only for the current page session and are not persisted to local storage.
- UI fallbacks do not persist missing localization data to the database; the API remains the source of truth after reload.

## Testing checklist

- Typecheck with `npx.cmd tsc --noEmit`.
- Verify profile fields save on Enter/blur or select change.
- Verify blank full name does not issue a request.
- Verify reload reads the updated profile.
- Verify a missing language displays `en` and a missing timezone displays the browser timezone (or `UTC`).
