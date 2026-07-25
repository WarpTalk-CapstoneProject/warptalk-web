# App Layout Shell

## Purpose

The app layout shell defines the shared navigation and header surfaces used across the authenticated WarpTalk experience.

## Current Behavior

- The root app font stack uses Inter for the main UI and JetBrains Mono for monospace content through Next.js font variables.
- Authentication route guarding is temporarily disabled in `src/middleware.ts` so frontend pages can be reviewed directly while backend/auth is not available.
- The host app shell now uses the same light monochrome frosted-glass direction as the dashboard: bright full-screen motion video background, floating white sidebar, acrylic topbar, and scoped frosted styling for shadcn cards, inputs, tabs, and tables.
- Shared host pages now use the same three-layer shell as `/dashboard`: background video, large transparent rounded glass frame, then inner frosted sidebar/topbar/content surfaces.
- The topbar shows a glass sidebar trigger, separator, pathname breadcrumbs, command search (`Ctrl+K`), quick action icons for help, notifications, and theme, plus a compact Host profile control.
- `/dashboard` now uses the shared host sidebar/topbar shell instead of bypassing the app layout, so navigation state and active-pill motion stay mounted while switching between dashboard pages.
- Role sidebars use the WarpTalk primary logo when expanded and a compact `W` badge when collapsed.
- The host sidebar is a fixed-width light frosted navigation surface with Workspace, AI, and Configuration groups, a black active pill, and sign out.
- Host sidebar sizing follows the iDraft-style reference: 190px floating panel, taller brand row, black active pill, and compact 30px navigation rows.
- The shared host sidebar active state is one GSAP-positioned black pill layer that slides between menu rows on click, with active text pinned to white on hover for readability.
- Active-pill motion now uses a slower `0.82s` `power2.inOut` curve so the selected state moves visibly and consistently instead of snapping too quickly.
- Sidebar menu labels/icons no longer use `mix-blend-difference` because it made inactive labels unreadable on the light sidebar. The active text state is now driven by measured overlap with the moving black pill.
- The host shell is compact at normal 100% browser zoom while keeping the sidebar legible: smaller outer padding, 184px sidebar, 54px topbar, 32px navigation rows, and reduced content spacing.
- The sidebar help/preview notice card was removed from both the standalone dashboard sidebar and the shared host sidebar.
- The right-side host content shell card was removed to reduce nested glass layers. Content now sits directly inside the outer glass frame, matching the reference hierarchy: background -> outer glass frame -> sidebar card + floating content cards.
- The outer dashboard frame now uses the requested transparent glass preset: `rgba(255,255,255,0.05)`, 8px blur, 0.3 white border, inset highlights, and top/left edge shine pseudo-elements.
- Sidebar, topbar controls, and dashboard content cards now use the requested frosted surface preset: `rgba(255,255,255,0.23)`, 6px blur, white border, inset glow, and edge shine pseudo-elements.
- Shared host pages use `/assets/backgrounds/dashboard-light-motion.mp4` as the full-screen motion video background, matching `/dashboard`.
- The shared motion video background now keeps the provided light/white direction: full brightness grayscale video, light white overlay gradients, and no dark neutral wash.
- Host glass variables now use a readable white acrylic direction: structural frame around `rgba(255,255,255,0.18)`, sidebar/topbar/content surfaces around `rgba(255,255,255,0.9)`, and shadcn card/input scopes around `0.9`.
- Sign out clears the preview auth store and routes the user back to `/login`.
- The host sidebar keeps room creation as an in-page action instead of a dedicated navigation item; `/rooms/create` remains reachable from the `Create room` button and command search.
- Admin and workspace layouts now share the same muted content background, sticky topbar, and padded content wrapper used by the host dashboard shell.
- Admin, workspace, and participant sidebars keep their existing collapsible behavior while sharing the updated logo treatment.
- Command search now includes the full review route set: dashboard, rooms, create room, history, AI summaries, AI chat, terminology, feedback, workspace, admin, and dev test.
- `/rooms` and `/history` were compacted to match `/dashboard` density at 100% zoom: smaller section gaps, smaller headings, 82px metric cards, compact table rows, and tighter detail panels.
- The global `Ask WarpTalk` popover shows ambient page context as a Linear-style gray shell that is tall enough to wrap both the context row and the chat input when context is visible. The compact chat width is wider than before, and the input remains a white inset surface with a subtle shadow on a separate `z-10` layer. The gray shell/context row animates up/down when hidden or shown while the input stays in place. The context card includes the current page/entity label, status when available, a type-specific context icon, and an `x` control that disables sending page context for the active page/entity. The four-corner toolbar icon inside the composer toggles the gray page-context card; when the card is hidden, the outgoing assistant message sends `pageContext: null`. The header resize icon continues to resize the whole chat popover.

## Files Affected

- `src/app/layout.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/globals.css`
- `src/middleware.ts`
- `src/components/layout/topbar.tsx`
- `src/components/layout/host-sidebar.tsx`
- `src/app/(app)/terminology/page.tsx`
- `src/components/layout/admin-sidebar.tsx`
- `src/components/layout/workspace-sidebar.tsx`
- `src/components/layout/participant-sidebar.tsx`
- `src/components/layout/global-chatbot.tsx`
- `.agents/page-docs/dashboard-inner-pages.md`

## Important UI Notes

- The host sidebar intentionally uses the dashboard light frosted treatment instead of the former dark glass treatment, so internal host routes visually match `/dashboard`.
- `/dashboard` now imports and renders the same `HostSidebar` component as the other host pages, preventing sidebar drift between dashboard and inner routes.
- The dashboard route no longer renders its own duplicate background/sidebar/topbar shell; its page component now owns content only.
- Breadcrumb labels are derived from the current pathname. This keeps the header generic, but route-specific custom labels may need a mapping if future pages need friendlier names.
- Command search is frontend-only and navigates between available local app pages.
- The `.glass-dashboard-scope` class in `globals.css` scopes glass styling to authenticated host pages so landing and auth pages stay unchanged.
- The Host profile control is currently presentational in this layout pass. Account-menu behavior should be wired back in if the product requires profile or logout actions from the topbar.
- Removing the Ask WarpTalk page-context strip only suppresses the ambient `pageContext` payload for the current page/entity. Explicit `@` mention chips still send their selected entity references.

## Known Limitations

- `DISABLE_AUTH_GUARD` is set to `true` in middleware for frontend review. Restore auth redirects before connecting the app to production backend authentication.
- The topbar quick-action icons are visual controls only in the current implementation.
- The sidebar trigger is currently visual only; full sidebar collapse/offcanvas behavior can be added after the shadcn sidebar primitive is ported or installed.

## Testing Checklist

- Run ESLint against all edited layout files.
- Open representative host, admin, participant, and workspace routes to confirm the logo and navigation alignment.
- Verify active navigation states on nested routes.
- Check narrow desktop widths to ensure the fixed host sidebar and topbar actions do not overlap page content.
- Open Ask WarpTalk on a page with registered assistant context, confirm the softer gray shell wraps both the context row and the input, confirm toggling it animates only the gray shell/context row while the input stays fixed, confirm the strip uses a page-type icon instead of a generic green dot, confirm hidden context sends `pageContext: null`, and confirm the header resize icon still resizes the whole chat popover.
