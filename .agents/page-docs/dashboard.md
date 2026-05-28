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
- Follow-up pass converted the related internal dashboard routes to the same shadcn visual language: `/rooms`, `/rooms/create`, `/history`, `/ai-summaries`, `/ai-chat`, `/feedback`, `/workspace`, `/admin`, and `/dev-test`.
- Rebuilt `/dashboard` as a standalone dark glassmorphism dashboard inspired by the provided reference image.
- Added a route-specific dark shell so `/dashboard` can own the full viewport, including the sidebar and header, without the default light app topbar/sidebar.
- Replaced `dashboard-light-rays.jpg` with the user's new particle-light background image and kept it as the only dashboard background image.
- Reworked the dashboard content into a compact glass sidebar, low-height glass header, shadcn-style metric cards, room overview table, operational signal cards, language mix, and recent history cards.
- Tightened the dashboard density after review: removed the oversized crypto-style hero treatment, reduced card heights, reduced shell padding, and aligned spacing closer to the compact `/rooms` operations layout.
- Tightened the sidebar again so the menu fits without an internal scrollbar on standard desktop heights; active menu items now use a dark glass card state with a right-side vertical indicator.
- Refined the dashboard glass treatment after reviewing the local `glassmorphism` reference: sidebar, main shell, active nav state, and content cards now use translucent gradients, soft borders, inner highlights, blur, and saturation instead of flat dark surfaces.
- Added GSAP-powered sidebar navigation motion. The active glass card is a single moving layer behind the menu item, so the indicator and card slides smoothly between Dashboard, Rooms, History, and the other dashboard links without delaying navigation.
- Added `gsap` as a dashboard UI motion dependency.
- Replaced the dashboard background layer with the motion video as the primary full-viewport background.
- Removed the static nebula image background from `/dashboard`; `dashboard-glass-motion.mp4` now renders without blur or mix-blend as the main background layer.
- Reduced the dark overlay/video opacity so the nebula image remains visibly present behind the glass UI.
- Compressed the dashboard for 100% desktop zoom: smaller topbar, tighter shell padding, lower metric cards, denser table rows, fixed/truncated table columns, no recent-history card row, and hidden dashboard overflow to avoid visible vertical or horizontal scrollbars.
- Made the large empty glass areas more transparent while keeping smaller content cards readable: the global dark overlays, sidebar shell, main shell, top search, and host chip now use lower fill opacity and lighter blur so the nebula background can show through more naturally.
- Added a standalone dashboard sidebar Sign out action that clears preview auth state and redirects to `/login`.
- Matched the standalone dashboard sidebar sizing to the shared host shell: 248px sidebar, 52px brand row aligned to the topbar, 32px logo, and compact 30px navigation rows.
- Removed `Join Room` from the dashboard sidebar because room joining is handled through the Rooms area.
- Removed the 360ms delayed sidebar navigation handoff so page changes from `/dashboard` feel immediate instead of stalled.
- Updated the structural glass shells to match the user's generator.ui.glass reference: menu shell, content shell, and topbar shell now use transparent `rgba(143,143,143,0)` fill, `backdrop-blur-0`, `backdrop-saturate-200`, 12px radius, and `rgba(255,255,255,0.125)` borders.
- Updated menu and topbar glass to the newer reference preset: `backdrop-blur-[10px]`, `backdrop-saturate-200`, `rgba(143,143,143,0.1)` fill, 12px radius, and `rgba(255,255,255,0.125)` borders.
- Updated dashboard content cards to the user's content-card glass preset: `backdrop-blur-[15px]`, `backdrop-saturate-200`, `rgba(143,143,143,0.15)` fill, 12px radius, and `rgba(255,255,255,0.125)` borders.

## Why It Changed

The provided `shadcn-dashboard-landing-template` includes useful dashboard patterns, but many examples are sales or ecommerce oriented. The dashboard was adapted to WarpTalk's domain so the page remains useful for hosts managing translation rooms.

## Files Affected

- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/components/meeting-actions.tsx`
- `src/app/(app)/layout.tsx`
- `src/components/layout/host-sidebar.tsx`
- `src/components/layout/topbar.tsx`
- `public/assets/backgrounds/dashboard-light-rays.jpg`
- `public/assets/backgrounds/dashboard-nebula.png`
- `public/assets/backgrounds/dashboard-glass-motion.mp4`
- `package.json`
- `package-lock.json`
- `.agents/page-docs/dashboard.md`
- `.agents/page-docs/dashboard-inner-pages.md`

## Current Data Flow

- `useTranslationRooms({ pageSize: 100 })` loads current room records when the backend is available.
- `useRoomHistory()` loads ended-room history when the backend adapter is available.
- When either API returns no data, the dashboard falls back to domain-specific preview data so the shadcn dashboard layout can be evaluated visually.
- Dashboard quick links remain frontend-only in preview mode:
  - Create room routes to `/rooms/create`.
  - View history routes to `/history`.

## Template Mapping

Adopted from the template:

- Metric card structure from `dashboard/components/section-cards.tsx` and `dashboard-2/components/metrics-overview.tsx`.
- Header and action layout from `dashboard-2/page.tsx`.
- Recent-list card pattern from `dashboard-2/components/recent-transactions.tsx`.
- Operational focus panel inspired by the template's quick summary/sidebar cards.
- App shell/sidebar/header behavior from `app/(dashboard)/layout.tsx`, `components/app-sidebar.tsx`, `components/nav-main.tsx`, `components/site-header.tsx`, and `components/command-search.tsx`.
- Latest visual direction uses a custom dark glassmorphism shell with compact shadcn dashboard density: translucent dark panels, soft borders, inset highlights, dense sidebar navigation, low-height topbar, metric cards, and a dark table surface.

Not adopted directly:

- Sales, revenue, order, conversion, customer insight, and product panels because they do not match WarpTalk room operations.
- Recharts-based chart components because `warptalk-web` does not currently include `recharts` or the template chart UI dependency path.
- TanStack data-table sections because the current dashboard does not need a dense admin table and adding the template table would require extra dependencies and domain remapping.
- Theme customizer and upgrade-to-pro floating widgets because they are template product features, not WarpTalk product features.

## Important UI Behavior

- `/dashboard` can be opened directly during frontend review because `DISABLE_AUTH_GUARD` is temporarily enabled in middleware.
- `/dashboard` bypasses the shared app shell and renders its own full-viewport dark shell from `src/app/(app)/layout.tsx`.
- The page intentionally follows the compact rhythm of `/rooms`: small topbar, dense sidebar rows, 4-column metric cards, and table-first dashboard content instead of a large hero dashboard.
- The dashboard is optimized to fit a standard 100% desktop viewport without visible page scrolling; lower-priority history cards are intentionally omitted from this screen to keep the operational table and signal panels in view.
- Sidebar menu rows are intentionally compact with tight group spacing to avoid a vertical nav scrollbar. The selected row uses a 40px in-row glass highlight, 8px radius, compact icon/text sizing, subtle backdrop blur, internal reflective highlight layers, and a slim glowing vertical white indicator on the right edge.
- Sidebar and topbar horizontal dividers are intentionally aligned at 52px so `/dashboard` and the other host pages feel like one consistent shell.
- Dashboard sidebar Sign out mirrors the shared host sidebar behavior and returns the user to `/login`.
- Dashboard sidebar navigation uses regular Next links with only immediate active-state feedback; it no longer holds routing for the GSAP highlight animation.
- The selected sidebar state is rendered as one absolutely positioned glass card. GSAP animates its x/y/width/height when a menu link is clicked, with `power3.out` easing and a reduced-motion fallback.
- The dashboard background stack now uses `/assets/backgrounds/dashboard-glass-motion.mp4` as the primary full-screen background, followed by subtle readability overlays and the glassmorphism dashboard content.
- The video is intentionally unblurred and no longer uses `mix-blend-screen`, because it is the main background rather than a secondary overlay.
- Large structural containers intentionally use clearer glass than content cards. Metric cards, room table, and signal panels keep stronger contrast; sidebar/main empty space stays more transparent so the background remains visible.
- Structural shells and content cards are intentionally separated: menu/topbar/content shells use zero-blur transparent glass, while smaller dashboard data cards keep stronger `GlassPanel` contrast for readability.
- Current glass presets are separated by role: menu/topbar use the 10px blur preset, content data cards use the 15px blur preset, and the content shell remains a transparent structural frame.
- The dashboard shows preview data by default when backend APIs are missing so visual QA is not blocked by empty states.
- Empty, loading, and error states are shown separately for current rooms and history.
- Recent history cards link to `/history`.
- The new dashboard uses Tailwind glass utilities and local shadcn primitives such as Badge, Input, and Table.

## Known Limitations

- Backend APIs are not required for first-pass visual review. Room and history sections may show loading/error/empty states until services are available.
- The dashboard sidebar collapse button is visual-only for now.
- Metrics depend on the current room and history APIs returning complete participant and duration data.
- The quick create action routes to the create-room page instead of posting to the backend in preview mode.
- AI follow-up is summarized from ready artifacts; dedicated AI summary metrics can be added when those APIs are exposed.

## Testing Checklist

- [ ] `/dashboard` renders inside its standalone dark glass shell.
- [ ] The nebula image is visible behind the dashboard.
- [ ] The blurred video overlay plays behind the glass UI without reducing readability.
- [ ] Metric cards render with empty API results.
- [ ] Loading and error states do not break the layout.
- [ ] Create room action routes to `/rooms/create`.
- [ ] Recent history cards link to `/history`.
- [ ] The dashboard remains readable at tablet and desktop widths.
- [ ] At 100% desktop zoom, `/dashboard` does not show visible vertical page scrollbars or a horizontal table scrollbar.
- [ ] Clicking sidebar items animates the glass active card before routing to the selected page.
