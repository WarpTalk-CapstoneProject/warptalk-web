# App Layout Shell

## Purpose

The app layout shell defines the shared navigation and header surfaces used across the authenticated WarpTalk experience.

## Current Behavior

- The root app font stack uses Inter for the main UI and JetBrains Mono for monospace content through Next.js font variables.
- Authentication route guarding is temporarily disabled in `src/middleware.ts` so frontend pages can be reviewed directly while backend/auth is not available.
- The host app shell now uses the same dark shadcn glassmorphism direction as the dashboard: full-screen motion video background, translucent sidebar, glass topbar, and scoped glass styling for shadcn cards, inputs, tabs, and tables.
- The topbar shows a glass sidebar trigger, separator, pathname breadcrumbs, command search (`Ctrl+K`), quick action icons for help, notifications, and theme, plus a compact Host profile control.
- `/dashboard` is now a special route that bypasses the default host sidebar/topbar and renders a standalone dark glassmorphism dashboard shell.
- Role sidebars use the WarpTalk primary logo when expanded and a compact `W` badge when collapsed.
- The host sidebar is a fixed-width dark glass navigation surface with Workspace, AI, and Configuration groups, sign out, and a frontend preview notice.
- Host sidebar sizing is aligned with the 52px topbar: 248px width, 52px brand row, 32px logo, and compact 30px navigation rows.
- Shared host structural shells follow the zero-blur transparent glass reference: sidebar, topbar, and content shell use transparent `rgba(143,143,143,0)` fill, `backdrop-blur-0`, `backdrop-saturate-200`, and `rgba(255,255,255,0.125)` borders.
- Shared host menu and topbar use the updated glass preset with `backdrop-blur-[10px]`, `backdrop-saturate-200`, `rgba(143,143,143,0.1)` fill, and `rgba(255,255,255,0.125)` borders.
- Sign out clears the preview auth store and routes the user back to `/login`.
- The host sidebar keeps room creation as an in-page action instead of a dedicated navigation item; `/rooms/create` remains reachable from the `Create room` button and command search.
- Admin and workspace layouts now share the same muted content background, sticky topbar, and padded content wrapper used by the host dashboard shell.
- Admin, workspace, and participant sidebars keep their existing collapsible behavior while sharing the updated logo treatment.
- Command search now includes the full review route set: dashboard, rooms, create room, history, AI summaries, AI chat, terminology, feedback, workspace, admin, and dev test.
- `/rooms` and `/history` were compacted to match `/dashboard` density at 100% zoom: smaller section gaps, smaller headings, 82px metric cards, compact table rows, and tighter detail panels.

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
- `.agents/page-docs/dashboard-inner-pages.md`

## Important UI Notes

- The host sidebar intentionally uses the dashboard glass treatment instead of the former light shadcn sidebar tokens, so internal host routes visually match `/dashboard`.
- Breadcrumb labels are derived from the current pathname. This keeps the header generic, but route-specific custom labels may need a mapping if future pages need friendlier names.
- Command search is frontend-only and navigates between available local app pages.
- The `.glass-dashboard-scope` class in `globals.css` scopes glass styling to authenticated host pages so landing and auth pages stay unchanged.
- The Host profile control is currently presentational in this layout pass. Account-menu behavior should be wired back in if the product requires profile or logout actions from the topbar.

## Known Limitations

- `DISABLE_AUTH_GUARD` is set to `true` in middleware for frontend review. Restore auth redirects before connecting the app to production backend authentication.
- The topbar quick-action icons are visual controls only in the current implementation.
- The sidebar trigger is currently visual only; full sidebar collapse/offcanvas behavior can be added after the shadcn sidebar primitive is ported or installed.

## Testing Checklist

- Run ESLint against all edited layout files.
- Open representative host, admin, participant, and workspace routes to confirm the logo and navigation alignment.
- Verify active navigation states on nested routes.
- Check narrow desktop widths to ensure the fixed host sidebar and topbar actions do not overlap page content.
