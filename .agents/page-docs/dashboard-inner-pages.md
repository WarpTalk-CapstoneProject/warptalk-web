# Dashboard Inner Pages

This document tracks the shadcn conversion for dashboard-adjacent internal pages.

## Routes Covered

- `/ai-summaries`
- `/ai-chat`
- `/workspace`
- `/admin`
- `/dev-test`

## Current Behavior

- `/ai-summaries` now renders a shadcn summary review page with metric cards, generated-summary cards, action items, and model notes.
- `/ai-chat` now renders a shadcn assistant workspace with prompt chips, conversation cards, and a chat input preview.
- `/workspace` now renders inside a shadcn-style workspace shell with usage metrics, quota table, and department activity cards.
- `/admin` now renders inside a shadcn-style admin shell with platform metrics, service health tabs, and audit events.
- `/dev-test` has been simplified from backend-heavy API calls into a shadcn preview API lab with mock endpoint actions, payload setup, and result logs.

## Files Affected

- `src/app/(app)/ai-summaries/page.tsx`
- `src/app/(app)/ai-chat/page.tsx`
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
- Real API mutation behavior on `/dev-test` because backend/auth is not required at this stage.

## Testing Checklist

- [ ] `/ai-summaries` renders with summary cards and metrics.
- [ ] `/ai-chat` accepts local input and appends preview messages.
- [ ] `/workspace` renders with its workspace sidebar and active dashboard item.
- [ ] `/admin` renders with its admin sidebar and active dashboard item.
- [ ] `/dev-test` can add and clear preview logs.
- [ ] Command search includes dashboard, rooms, create room, history, AI pages, feedback, join, workspace, admin, and dev test.
