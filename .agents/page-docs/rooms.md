# Rooms Page Documentation

This document tracks the workspace Rooms overview at `/:workspaceSlug/rooms`.

## Current Behavior

- `/:workspaceSlug/rooms` uses the shared workspace shell with compact status tabs, search, day strip, grouped history rows, and a linear room inventory.
- The page uses `useTranslationRooms()` for backend data and appends the frontend-only meeting-summary seed room when the slug is `fpt-sep490-su26`.
- The seed room is `summary-seed-room-fpt-sep490-su26`; it opens the normal room detail page with seeded participants, transcript segments, structured AI summary content, and retained artifacts.
- The room detail Summary tab uses a GSAP-driven gray skeleton shimmer while the AI summary is still generating or being rewritten.
- The room detail Transcript tab renders the current viewer's lines on the right, keeps transcript bubble text black for readability in light/dark modes, and keeps the scroll area inside the transcript frame.
- Users can filter rooms locally by status tabs and search by title/code/language.
- **A picked day narrows the tab; it does not replace it.** Filtering by a day still applies the tab's status rule: Active keeps only rooms that are not over (`!isMeetingOver`), History keeps only those that are. Dropping the status rule made picking a day on Active list cancelled and ended rooms under a heading reading "Active Meetings" — a stopped daily series showed its future occurrences there as "Cancelled". The exception is the All tab, where "everything I have" and "what is on Tuesday" are contradictory questions.
- The day-filtered result is still passed through `sortRooms`: the day narrows *which* rows appear and says nothing about their order.
- Create opens the shared create-room modal, and Join routes to `/join?code=...`.

## Files Affected

- `src/app/(app)/[workspaceSlug]/rooms/page.tsx`
- `src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx`
- `src/lib/meeting/meeting-summary-seed.ts`
- `src/components/rooms/meeting-record-panels.tsx`
- `src/hooks/use-translationRooms.ts`
- `src/hooks/use-transcripts.ts`
- `src/services/room-history.service.ts`
- `src/services/translation-room.service.ts`

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

- The summary seed is intentionally frontend-only and scoped by workspace slug; it does not create backend/database records.
- Summary regeneration and artifact downloads are mocked only for the seed IDs. Real rooms still use backend endpoints.

## Testing Checklist

- [ ] `/:workspaceSlug/rooms` renders in the workspace shell.
- [ ] `/fpt-sep490-su26/rooms` includes `Seed: AI Summary Review - SEP490 Sprint Sync`.
- [ ] Opening the seed room renders transcript, Summary, and Artifacts tabs without backend seed data.
- [ ] Status tabs filter the visible table rows.
- [ ] Search filters by title, room code, or language.
- [ ] Create opens the create-room modal.
- [ ] Join opens `/join?code=...`.
