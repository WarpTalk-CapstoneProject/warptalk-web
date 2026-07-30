# Dashboard Inner Pages

This document tracks the shadcn conversion for dashboard-adjacent internal pages.

## Routes Covered

- `/ai-summaries`
- `/ai-chat`
- `/rooms`
- `/history`
- `/terminology`
- `/feedback`
- `/workspace`
- `/admin`
- `/dev-test`

## Current Behavior

- `/rooms`, `/history`, `/ai-summaries`, `/ai-chat`, `/terminology`, and `/feedback` now inherit the light monochrome frosted-glass host shell used by `/dashboard`.
- The shared shell applies scoped frosted-white styling to shadcn cards, tables, tabs, inputs, and textareas without changing landing or auth pages.
- `/rooms` and `/history` now use `/dashboard` as the density baseline, with compact headings, metric cards, table rows, and reduced section spacing for 100% desktop zoom.
- `/ai-summaries` now renders a shadcn summary review page with metric cards, generated-summary cards, action items, and model notes.
- `/ai-chat` now renders a shadcn assistant workspace with prompt chips, conversation cards, and a chat input preview.
- `/terminology` now exists as a shadcn/glass preview page for glossary terms and language consistency workflows.
- Host sidebar sign out clears local auth state and redirects to `/login`.
- `/workspace` now renders inside a shadcn-style workspace shell with usage metrics, quota table, and department activity cards.
- `/admin` now renders inside a shadcn-style admin shell with platform metrics, service health tabs, and audit events.
- `/dev-test` remains a development-only diagnostics lab and is blocked with
  HTTP 404 by `src/proxy.ts` in production.

## Files Affected

- `src/app/(app)/ai-summaries/page.tsx`
- `src/app/(app)/ai-chat/page.tsx`
- `src/app/(app)/rooms/page.tsx`
- `src/app/(app)/history/page.tsx`
- `src/app/(app)/feedback/page.tsx`
- `src/app/(app)/terminology/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/globals.css`
- `src/components/layout/host-sidebar.tsx`
- `src/app/workspace/page.tsx`
- `src/app/workspace/layout.tsx`
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
- [ ] `/rooms`, `/history`, `/ai-summaries`, `/ai-chat`, `/terminology`, and `/feedback` render inside the dark glass host shell.
- [ ] `/ai-summaries` renders with summary cards and metrics.
- [ ] `/ai-chat` accepts local input and appends preview messages.
- [ ] Sidebar Sign out redirects to `/login`.
- [ ] `/workspace` renders with its workspace sidebar and active dashboard item.
- [ ] `/admin` renders with its admin sidebar and active dashboard item.
- [ ] `/dev-test` can add and clear preview logs.
- [ ] Command search includes dashboard, rooms, create room, history, AI pages, terminology, feedback, workspace, admin, and dev test.
