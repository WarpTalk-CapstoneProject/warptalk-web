# Dashboard Inner Pages

This document tracks the shadcn conversion for dashboard-adjacent internal pages.

## Routes Covered

- `/ai-summaries`
- `/ai-chat`
- `/:workspaceSlug/rooms`
- `/:workspaceSlug/history`
- `/terminology`
- `/feedback`
- `/workspace`
- `/admin`
- `/dev-test`

## Current Behavior

- `/:workspaceSlug/rooms`, `/:workspaceSlug/history`, `/ai-summaries`, `/ai-chat`, `/terminology`, and `/feedback` now inherit the shared app shell styling.
- The shared shell applies scoped frosted-white styling to shadcn cards, tables, tabs, inputs, and textareas without changing landing or auth pages.
- `/:workspaceSlug/rooms` and `/:workspaceSlug/history` now use the dashboard density baseline, with compact headings, metric cards, table rows, and reduced section spacing for 100% desktop zoom.
- `/fpt-sep490-su26/rooms` includes a frontend-only AI summary seed room for testing the room detail Summary tab, transcript citation jumps, and artifact cards without backend/database seed records.
- `/ai-summaries` now renders a shadcn summary review page with metric cards, generated-summary cards, action items, and model notes.
- `/ai-chat` now renders a shadcn assistant workspace with prompt chips, conversation cards, and a chat input preview.
- `/terminology` now exists as a shadcn/glass preview page for glossary terms and language consistency workflows.
- Host sidebar sign out clears local auth state and redirects to `/login`.
- `/workspace` is the onboarding gateway for selecting, joining, or, when eligible, creating a workspace. Create is locked once the user already has an Internal workspace membership.
- `/admin` now renders inside a shadcn-style admin shell with platform metrics, service health tabs, and audit events.
- `/dev-test` remains a development-only diagnostics lab and is blocked with
  HTTP 404 by `src/proxy.ts` in production.

## Files Affected

- `src/app/(app)/ai-summaries/page.tsx`
- `src/app/(app)/ai-chat/page.tsx`
- `src/app/(app)/[workspaceSlug]/rooms/page.tsx`
- `src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx`
- `src/app/(app)/[workspaceSlug]/history/page.tsx`
- `src/lib/meeting/meeting-summary-seed.ts`
- `src/app/(app)/feedback/page.tsx`
- `src/app/(app)/terminology/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/globals.css`
- `src/components/layout/host-sidebar.tsx`
- `src/app/(app)/workspace/page.tsx`
- `src/app/(app)/workspace/create/page.tsx`
- `src/app/(app)/workspace/join/page.tsx`
- `src/lib/workspace/workspace-membership.ts`
- `src/app/admin/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/(app)/dev-test/page.tsx`
- `src/components/layout/topbar.tsx`
- `src/components/layout/workspace-sidebar.tsx`
- `src/components/layout/admin-sidebar.tsx`

## Template Mapping

Adopted from `shadcn-dashboard-landing-template`:

- Internal admin shell structure.
- Metric card rows.
- Tabs for alternate operational views.
- Tables for scan-heavy admin data.
- Command-search entries for all review routes.

Not adopted:

- Template landing/auth pages because the user explicitly excluded landing page, login, register, and forgot-password.
- Template ecommerce/revenue content because it does not match WarpTalk translation operations.
- Production exposure of `/dev-test`; the route is intentionally unavailable
  outside development.

## Testing Checklist

- [ ] Documents list/grid shows Uploader and Approver avatars/names when those actors are workspace members.
- [ ] An External uploader can still see an approved upload after refresh.
- [ ] `npm run test:2807-hotfix` and WorkspaceService document tests pass.
- [ ] `/:workspaceSlug/rooms`, `/:workspaceSlug/history`, `/ai-summaries`, `/ai-chat`, `/terminology`, and `/feedback` render inside the app shell.
- [ ] `/fpt-sep490-su26/rooms` can open `summary-seed-room-fpt-sep490-su26` and render the Summary tab.
- [ ] `/ai-summaries` renders with summary cards and metrics.
- [ ] `/ai-chat` accepts local input and appends preview messages.
- [ ] Sidebar Sign out redirects to `/login`.
- [ ] `/workspace` renders the onboarding gateway and locks Create for users with an existing Internal workspace membership.
- [ ] `/admin` renders with its admin sidebar and active dashboard item.
- [ ] `/dev-test` can add and clear preview logs.
- [ ] Command search includes dashboard, rooms, create room, history, AI pages, terminology, feedback, workspace, admin, and dev test.
