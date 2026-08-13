# My Meetings Page

## Purpose

This document tracks the personal meeting timeline at `/[workspaceSlug]/my-meetings`.

## Current Behavior

- `My Meetings` is a workspace-scoped personal timeline, not a home-page widget and not a cross-workspace account page.
- The route shows only meetings the current user hosts, joined, or was invited to inside the active workspace.
- The page loads one month window at a time through `useMyMeetings`, keyed by workspace plus month instead of by page number.
- The left rail contains a mini calendar, month navigation, counters, and filter chips.
- Clicking a day in the mini calendar scrolls the agenda to that day instead of filtering the list down to a single date.
- The central agenda groups meetings by day, anchors initial scroll around `Today`, and renders gap markers when long empty ranges exist between clusters.
- Upcoming and live rows keep a clear action state by showing an audience badge (`Host`, `Going`, `Invited`) plus an `Open`/`Join` action.
- Past rows show artifact chips with both label and current readiness/consent state.
- The detail rail mirrors the selected meeting and lets users download ready artifacts directly from the panel.
- The workspace sidebar now exposes `My Meetings` above `History`, matching the WT-333 product route structure.

## Files Affected

- `src/app/(app)/[workspaceSlug]/my-meetings/page.tsx`
- `src/hooks/use-my-meetings.ts`
- `src/services/my-meetings.service.ts`
- `src/services/translation-room.service.ts`
- `src/services/room-history.service.ts`
- `src/types/myMeetings.ts`
- `src/lib/api/endpoints.ts`
- `src/components/layout/linear-sidebar.tsx`

## Important UI Notes

- This page answers the personal-timeline question. Workspace-wide archives remain on `/[workspaceSlug]/history`.
- Empty days are intentionally omitted from the agenda; the gap marker exists so the omission reads as "no meetings" rather than "data failed to load".
- The page reuses shared artifact labeling/status helpers so history and my-meetings cannot drift on consent/readiness wording.
- Meeting downloads still go through the existing authenticated artifact flow and respect consent requirements.

## Known Limitations

- The page currently loads one month window at a time with a `pageSize` cap of 100. Very dense months may still need search narrowing.
- RSVP state is inferred from host/participant presence plus invitation fallback because the timeline payload does not expose a richer invitation-response enum yet.
- Runtime verification against a live backend still depends on the translation-room service being available locally.

## Testing Checklist

- Open `/[workspaceSlug]/my-meetings` and confirm it renders inside the authenticated app shell.
- Confirm the sidebar contains `My Meetings` above `History`.
- Change the mini-calendar month and confirm the query window updates without losing the app shell.
- Click a calendar day with meetings and confirm the agenda scrolls to that day.
- Confirm `Today` is highlighted and initial scroll lands near it.
- Verify upcoming/live rows show an audience badge plus `Open` or `Join`.
- Verify past rows and the detail panel show artifact status text and only allow downloads for ready outputs.
