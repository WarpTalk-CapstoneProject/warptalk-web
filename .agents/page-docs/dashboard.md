# Dashboard Page Documentation

This document tracks the host dashboard at `/dashboard`.

## Purpose

`/dashboard` is the authenticated host overview for WarpTalk operations. It summarizes room volume, live sessions, participants, translated time, recent rooms, ended-room history, and quick meeting actions.

## What Changed

- Replaced the original minimal metric-only dashboard with a shadcn-inspired operations dashboard.
- Reworked the dashboard shell to align with the provided shadcn dashboard template: grouped sidebar navigation, sticky header, command search trigger, muted app background, and tighter card spacing.
- Added template-style metric cards with card actions, badges, footer context, and gradient card treatment.
- Added preview-mode sample metrics so the page looks complete while backend APIs are unavailable.
- Added frontend-only quick room actions for opening the room builder and participant join path.
- Added a lightweight room workload chart without introducing the template chart dependencies.
- Added recent rooms and recent history panels backed by existing WarpTalk hooks.
- Rewrote dashboard action copy to remove broken text encoding.
- Follow-up pass converted the related internal dashboard routes to the same shadcn visual language: `/rooms`, `/rooms/create`, `/history`, `/ai-summaries`, `/ai-chat`, `/feedback`, `/join`, `/workspace`, `/admin`, and `/dev-test`.

## Why It Changed

The provided `shadcn-dashboard-landing-template` includes useful dashboard patterns, but many examples are sales or ecommerce oriented. The dashboard was adapted to WarpTalk's domain so the page remains useful for hosts managing translation rooms.

## Files Affected

- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/components/meeting-actions.tsx`
- `src/app/(app)/layout.tsx`
- `src/components/layout/host-sidebar.tsx`
- `src/components/layout/topbar.tsx`
- `.agents/page-docs/dashboard.md`
- `.agents/page-docs/dashboard-inner-pages.md`

## Current Data Flow

- `useTranslationRooms({ pageSize: 100 })` loads current room records when the backend is available.
- `useRoomHistory()` loads ended-room history when the backend adapter is available.
- When either API returns no data, the dashboard falls back to domain-specific preview data so the shadcn dashboard layout can be evaluated visually.
- `MeetingActions` is frontend-only in preview mode:
  - Create room routes to `/rooms/create`.
  - Join by code routes to `/join?code=...`.

## Template Mapping

Adopted from the template:

- Metric card structure from `dashboard/components/section-cards.tsx` and `dashboard-2/components/metrics-overview.tsx`.
- Header and action layout from `dashboard-2/page.tsx`.
- Recent-list card pattern from `dashboard-2/components/recent-transactions.tsx`.
- Operational focus panel inspired by the template's quick summary/sidebar cards.
- App shell/sidebar/header behavior from `app/(dashboard)/layout.tsx`, `components/app-sidebar.tsx`, `components/nav-main.tsx`, `components/site-header.tsx`, and `components/command-search.tsx`.

Not adopted directly:

- Sales, revenue, order, conversion, customer insight, and product panels because they do not match WarpTalk room operations.
- Recharts-based chart components because `warptalk-web` does not currently include `recharts` or the template chart UI dependency path.
- TanStack data-table sections because the current dashboard does not need a dense admin table and adding the template table would require extra dependencies and domain remapping.
- Theme customizer and upgrade-to-pro floating widgets because they are template product features, not WarpTalk product features.

## Important UI Behavior

- `/dashboard` can be opened directly during frontend review because `DISABLE_AUTH_GUARD` is temporarily enabled in middleware.
- The dashboard shows preview data by default when backend APIs are missing so visual QA is not blocked by empty states.
- Empty, loading, and error states are shown separately for current rooms and history.
- The workload chart uses local preview values and is intentionally CSS-only.
- Recent room cards link to `/room/[id]`; recent history cards link to `/history`.
- Metric cards intentionally use shadcn tokens (`primary`, `muted`, `card`, `border`) instead of one-off hard-coded palette values.

## Known Limitations

- Backend APIs are not required for first-pass visual review. Room and history sections may show loading/error/empty states until services are available.
- The activity chart is a lightweight CSS chart, not an interactive Recharts chart.
- Sidebar collapse is visual-only for now; full shadcn sidebar collapse requires porting the template sidebar primitive and its dependency stack.
- Metrics depend on the current room and history APIs returning complete participant and duration data.
- The quick create action routes to the create-room page instead of posting to the backend in preview mode.
- AI follow-up is summarized from ready artifacts; dedicated AI summary metrics can be added when those APIs are exposed.

## Testing Checklist

- [ ] `/dashboard` renders inside the host app shell.
- [ ] Metric cards render with empty API results.
- [ ] Loading and error states do not break the layout.
- [ ] Create room action posts to `/translation-rooms` and routes to the meeting surface.
- [ ] Join by code action posts to `/translation-rooms/join`.
- [ ] Recent room cards link to the room route.
- [ ] Recent history cards link to `/history`.
- [ ] The dashboard remains readable at tablet and desktop widths.
