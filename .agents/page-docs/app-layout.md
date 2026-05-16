# App Layout Shell

## Purpose

The app layout shell defines the shared navigation and header surfaces used across the authenticated WarpTalk experience.

## Current Behavior

- The root app font stack uses Inter for the main UI and JetBrains Mono for monospace content through Next.js font variables.
- The topbar shows pathname-based breadcrumbs starting from WarpTalk, quick action icons for help, notifications, and theme, plus a compact Host profile control.
- Role sidebars use the WarpTalk primary logo when expanded and a compact `W` badge when collapsed.
- The host sidebar is a fixed-width navigation surface with Rooms as the primary meeting entry, grouped AI and configuration links, sign out, and a small help-center widget.
- Admin, workspace, and participant sidebars keep their existing collapsible behavior while sharing the updated logo treatment.

## Files Affected

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/layout/topbar.tsx`
- `src/components/layout/host-sidebar.tsx`
- `src/components/layout/admin-sidebar.tsx`
- `src/components/layout/workspace-sidebar.tsx`
- `src/components/layout/participant-sidebar.tsx`

## Important UI Notes

- The host sidebar intentionally uses the existing WarpTalk blue and white visual language so it stays aligned with the Rooms and Create Room screens.
- Breadcrumb labels are derived from the current pathname. This keeps the header generic, but route-specific custom labels may need a mapping if future pages need friendlier names.
- The Host profile control is currently presentational in this layout pass. Account-menu behavior should be wired back in if the product requires profile or logout actions from the topbar.

## Known Limitations

- The topbar quick-action icons are visual controls only in the current implementation.
- The host sidebar does not collapse, unlike the admin, participant, and workspace sidebars.

## Testing Checklist

- Run ESLint against all edited layout files.
- Open representative host, admin, participant, and workspace routes to confirm the logo and navigation alignment.
- Verify active navigation states on nested routes.
- Check narrow desktop widths to ensure the fixed host sidebar and topbar actions do not overlap page content.
