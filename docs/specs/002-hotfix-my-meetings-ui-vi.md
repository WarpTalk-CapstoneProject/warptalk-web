# SPEC: Hotfix My Meetings English UI And Layout

## Context

The `my-meetings` page exists on `development`, but the page needed a UI/layout hotfix:

- the page must render 100% English UI copy
- topbar breadcrumb must not fall back to the raw `my-meetings` route segment
- the left mini-calendar rail must not clip at desktop widths or browser zoom
- the calendar card background and spacing need to align with the page
- the page header needs a create-meeting action
- day headings should sit slightly outside the meeting-card column

## Scope

In scope:

- Keep visible My Meetings UI in English.
- Fix the app topbar breadcrumb for `/[workspaceSlug]/my-meetings`.
- Keep the sidebar item as `My Meetings`.
- Add a `Create meeting` header action using the shared create-room modal.
- Make the left mini-calendar panel more resilient to zoom/width changes.
- Offset day headings relative to meeting cards.
- Update page docs.

Out of scope:

- Backend query behavior.
- Artifact authorization/download behavior.
- New meeting statuses.
- Global app localization.

## Affected Files

- `src/app/(app)/[workspaceSlug]/my-meetings/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/components/layout/linear-sidebar.tsx`
- `.agents/page-docs/my-meetings.md`

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Manual checklist:

- Topbar shows `My Meetings`, not `my-meetings`.
- Sidebar shows `My Meetings`.
- My Meetings page visible labels are English.
- Header `Create meeting` button opens the shared create-room dialog.
- Mini calendar no longer clips horizontally.
- Day heading sits offset from meeting cards.
