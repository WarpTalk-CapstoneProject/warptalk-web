# App Layout Shell

## Purpose

The app layout shell defines the shared navigation and header surfaces used across the authenticated WarpTalk experience.

## Current Behavior

- The root app font stack uses Inter for the main UI and JetBrains Mono for monospace content through Next.js font variables.
- Authentication route guarding is temporarily disabled in `src/middleware.ts` so frontend pages can be reviewed directly while backend/auth is not available.
- The host app shell now follows the provided shadcn dashboard template more closely: fixed 16rem sidebar, muted page background, sticky bordered topbar, sidebar-style navigation groups, and a command-search trigger.
- The topbar shows a template-style sidebar trigger, separator, pathname breadcrumbs, command search (`Ctrl+K`), quick action icons for help, notifications, and theme, plus a compact Host profile control.
- Role sidebars use the WarpTalk primary logo when expanded and a compact `W` badge when collapsed.
- The host sidebar is a fixed-width shadcn-style navigation surface with Workspace, AI, and Configuration groups, sign out, and a frontend preview notice.
- The host sidebar keeps room creation as an in-page action instead of a dedicated navigation item; `/rooms/create` remains reachable from the `Create room` button and command search.
- Admin and workspace layouts now share the same muted content background, sticky topbar, and padded content wrapper used by the host dashboard shell.
- Admin, workspace, and participant sidebars keep their existing collapsible behavior while sharing the updated logo treatment.
- Command search now includes the full review route set: dashboard, rooms, create room, history, AI summaries, AI chat, feedback, join, workspace, admin, and dev test.

## Files Affected

- `src/app/layout.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/globals.css`
- `src/middleware.ts`
- `src/components/layout/topbar.tsx`
- `src/components/layout/host-sidebar.tsx`
- `src/components/layout/admin-sidebar.tsx`
- `src/components/layout/workspace-sidebar.tsx`
- `src/components/layout/participant-sidebar.tsx`
- `.agents/page-docs/dashboard-inner-pages.md`

## Important UI Notes

- The host sidebar intentionally uses shadcn sidebar tokens (`sidebar`, `sidebar-primary`, `sidebar-accent`) instead of hard-coded WarpTalk-only styling.
- Breadcrumb labels are derived from the current pathname. This keeps the header generic, but route-specific custom labels may need a mapping if future pages need friendlier names.
- Command search is frontend-only and navigates between available local app pages.
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
