# History & Artifacts Page Documentation

This document tracks the host history UI at `/history`.

## Current Behavior

- `/history` has been converted to the shadcn dashboard style: stat cards, search, status tabs, ended-room list, selected transcript preview, artifact cards, and detail sidebar.
- The page continues to use `useRoomHistory()` when available and falls back to preview history when backend/artifact APIs are unavailable.
- Users can filter locally by all, ready, flagged, or missing artifact states.
- Download buttons are currently visual preview actions until real artifact URLs exist.

## Files Affected

- `src/app/(app)/history/page.tsx`
- `src/hooks/use-room-history.ts`
- `src/services/roomHistory.service.ts`
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

- [ ] `/history` renders in the host shell.
- [ ] Search filters room history locally.
- [ ] Tabs filter by artifact state.
- [ ] Selecting a room updates the transcript preview and detail sidebar.
- [ ] Empty backend state still shows the preview layout.
