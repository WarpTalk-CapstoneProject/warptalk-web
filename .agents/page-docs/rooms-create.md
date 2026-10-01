# Rooms Create Page Documentation

This document tracks the Create Room flow at `/rooms/create`.

## Current Behavior

- `/rooms/create` now uses a shadcn-style dashboard form: page header, card-based setup sections, selectable tiles, Base UI select controls, switches, and a right-side setup summary.
- The page is frontend-only for now. It generates a preview room code and join link without posting to the backend.
- The form captures title, schedule, capacity, language pair, access policy, room options, and transcript retention.
- The generated preview link opens `/join?code={code}`.

## Create Room dialog: meeting types (2026-10-01)

- The Create Room dialog (`src/components/rooms/create-room-dialog.tsx`, picker in `src/components/rooms/create/template-picker.tsx`) offers `CREATABLE_MEETING_TYPES` — every type except **External Meeting** (`EXTERNAL_BRIDGE`).
- An External Meeting room is created only where the Google Meet call is: by WarpBot (together with the Meet link and calendar event) or by the desktop app's Meet auto-detect (`src/lib/meeting/bridge-auto-room.ts`). The dialog's bridge notice and far-side language planning were removed with the option.
- `MEETING_TYPES` still contains `EXTERNAL_BRIDGE` and `rooms.create.templatePicker.types.externalMeeting` is kept, so existing bridge rooms keep their name on the room page (`MeetingPropertiesPills.tsx`).
- Contract: `npm run test:room-surface` (`scripts/check-room-surface-contract.mjs`).

## Files Affected

- `src/app/(app)/rooms/create/page.tsx`
- `src/components/rooms/create-room-dialog.tsx`
- `src/components/rooms/create/template-picker.tsx`
- `src/lib/meeting/meeting-types.ts`

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
