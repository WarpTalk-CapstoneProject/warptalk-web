# Rooms Create Page Documentation

This document tracks the Create Room flow at `/rooms/create`.

## Current Behavior

- `/rooms/create` now uses a shadcn-style dashboard form: page header, card-based setup sections, selectable tiles, Base UI select controls, switches, and a right-side setup summary.
- The page is frontend-only for now. It generates a preview room code and join link without posting to the backend.
- The form captures title, schedule, capacity, language pair, access policy, room options, and transcript retention.
- The generated preview link opens `/join?code={code}`.

## Files Affected

- `src/app/(app)/rooms/create/page.tsx`

## Template Mapping

Adopted from `shadcn-dashboard-landing-template`:

- Dashboard form page composition.
- Compact bordered cards instead of large custom panels.
- Right-side summary/preview card.
- Muted app background and shadcn token-based spacing.

Not adopted:

- Backend submit behavior from older WarpTalk code because the current review requirement is frontend-only with no authentication/backend dependency.
- Template marketing/landing blocks because this is an internal workflow page.

## Known Limitations

- The generated room code and join link are local preview state.
- No room is persisted until backend integration is re-enabled.
- Language options are a small frontend list and should later be sourced from the supported-language config or API.

## Testing Checklist

- [ ] Suggested Workspace Members excludes the signed-in host by user ID and normalized email.
- [ ] `npm run test:2807-hotfix` passes.
- [ ] `/rooms/create` renders in the host shell.
- [ ] Schedule/access tiles show selected states.
- [ ] Language selects update the setup summary.
- [ ] Retain transcript switch toggles.
- [ ] Create preview generates a room code.
- [ ] Open join page routes to `/join?code={code}`.
