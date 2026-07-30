# Rooms Page Documentation

This document tracks the host Rooms overview at `/rooms`.

## Current Behavior

- `/rooms` now uses the shadcn dashboard treatment from the provided template: muted background from the shared app shell, page header actions, metric cards, tabs, search, and a table-first room inventory.
- The page uses `useTranslationRooms()` when backend data exists and falls back to domain-specific preview rooms when the project is running without a backend.
- Users can filter rooms locally by status tabs and search by title/code/language.
- Create and join actions link to `/rooms/create` and `/join`.

## Files Affected

- `src/app/(app)/rooms/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/components/layout/host-sidebar.tsx`
- `src/components/layout/topbar.tsx`

## Template Mapping

Adopted from `shadcn-dashboard-landing-template`:

- Header plus right-aligned action buttons.
- Stat cards with icon blocks and compact metadata.
- Tabs and dense table layout for operational scanning.
- Shared sidebar/topbar shell and command-search navigation.

Not adopted:

- Template ecommerce/order-specific tables because WarpTalk needs room status, languages, participants, and transcript state.
- Chart-heavy sections because the room list benefits more from a dense table in this first pass.

## Known Limitations

- Filtering is local state until backend list/filter endpoints are finalized.
- Preview data is shown when the room API has no usable records.
- Table actions currently route to existing pages rather than mutating backend state.

## Testing Checklist

- [ ] `/rooms` renders in the shadcn host shell.
- [ ] Status tabs filter the visible table rows.
- [ ] Search filters by title, room code, or language.
- [ ] Create Room opens `/rooms/create`.
- [ ] Join opens `/join`.
