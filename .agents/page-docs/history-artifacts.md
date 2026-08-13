# History & Artifacts Page Documentation

This document tracks the workspace history and room artifact UI at `/:workspaceSlug/history` and `/:workspaceSlug/rooms/:id/artifacts`.

## Current Behavior

- `/:workspaceSlug/history` renders finished translation rooms and retained outputs from `useRoomHistory()`.
- `/:workspaceSlug/rooms/:id/artifacts` renders room artifact cards; summary artifacts show their inline JSON content when available.
- The frontend-only meeting-summary seed returns a ready `summary_export`, `transcript_export`, and `recording` artifact for `summary-seed-room-fpt-sep490-su26`.
- Users can search history locally and filter by completed/cancelled/output state.
- Download buttons call backend download APIs for real artifacts and return local seed content for seed artifact IDs.

## Files Affected

- `src/app/(app)/[workspaceSlug]/history/page.tsx`
- `src/app/(app)/[workspaceSlug]/rooms/[id]/artifacts/page.tsx`
- `src/hooks/use-room-history.ts`
- `src/services/room-history.service.ts`
- `src/services/translation-room.service.ts`
- `src/lib/meeting/meeting-summary-seed.ts`
- `src/types/roomHistory.ts`

## Template Mapping

Adopted from `shadcn-dashboard-landing-template`:

- KPI card row.
- List/detail card composition.
- Tabs for operational filters.
- Dense artifact cards and metadata rows.

Not adopted:

- Template sales/customer concepts.
- Direct chart dependencies because history review is currently artifact-centric.

## Backend Contract Gap

Expected future endpoints:

- `GET /translationRooms/history?status=ended`
- `GET /translationRooms/{id}/artifacts`

Until then, the UI remains safe to review with preview data.

## Testing Checklist

- [ ] `/:workspaceSlug/history` renders in the workspace shell.
- [ ] Search filters room history locally.
- [ ] Tabs filter by status/output state.
- [ ] Selecting a room updates the detail sidebar.
- [ ] `/:workspaceSlug/rooms/summary-seed-room-fpt-sep490-su26/artifacts` shows seeded summary JSON content and downloadable seed artifacts.
