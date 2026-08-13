# Documents Page

Route: `src/app/(app)/[workspaceSlug]/documents/page.tsx`

The documents page is the workspace document library. It supports upload, search, category filters, list/grid views, sorting, archive/restore, permanent delete, and sending selected document context to WarpBot.

Detail route: `src/app/(app)/[workspaceSlug]/documents/[documentId]/page.tsx`

## Current UX

- The default list view mirrors the `voice-profiles` selection pattern: hover highlights a connected row block, click toggles selection, and the document name opens the detail page.
- The header keeps the first selection column empty, matching Voice Profiles. Select-all is available in the sticky selected-actions card, not beside the `Name` header.
- When one or more documents are selected, a sticky bottom action card appears with selected count, select-all toggle, Ask AI, archive/restore, delete, and clear selection controls.
- The selected action card must keep the same wrapper model, height, width, padding, and sticky placement as Voice Profiles: the filter bar, table section, and card live in the same `relative flex min-h-0 flex-1 flex-col overflow-y-auto` container, and the card uses `bottom-5`, `h-10`, and `w-[344px]`.
- Actor metadata is shown in separate `Uploader` and `Approver` columns. Do not recombine them into a single `People` cell. The API already returns `uploadedBy` and `approvedBy`; `approvedBy` is derived by the workspace backend from the latest `ApproveDocument` audit entry, so this UI split does not require a database migration.
- Mutating actions are limited to documents the user can manage: workspace approvers, the uploader, or the owner.
- Grid view keeps the compact classification badge but does not replace the richer table workflow.

## Detail Page

- Do not show the raw document UUID in the visible header or metadata area.
- Keep only one visible download action, inside the `File information` panel.
- The main body is a 25/75 layout on large screens: the compact left column is only for file information and status, while the wider right column is for access policies and who can view the document.
- The detail page should fit inside the app viewport without creating a page-level scrollbar. Long access-member sets must scroll inside the user list controls instead.
- Detail-page surfaces should stay neutral: white, black, gray, borders, and muted surface tones only. Do not add green, blue, purple, orange, red, or other accent colors to file status, access rules, chips, or action controls.
- Access policy management must scale to larger workspaces: both `Allowed Users List` and `Blocked Users List` include member search, scrollable member rows, individual selection toggles, an `Add workspace` bulk action, and a `Clear all` bulk action for removing explicit rules in that list.
- `Allowed Users List` and `Blocked Users List` sit side by side in the access panel and should show about five visible users before internal scrolling.
- Do not allow manual allow/block overrides for workspace owners, workspace admins, or the uploader of the current document. Their access is governed by workspace/document ownership rules, not by per-document policy toggles.
- Avoid reintroducing separate metadata cards for status, size, and upload details unless the detail page is redesigned as a denser admin workspace.

## Classification Badges

The `Classification` column is intentionally text-only and neutral. Do not add colored badges or icons here.

- `Pending Approval`
- `Restricted`
- `Administrative`
- `AI Ready`
- `AI Failed`
- `Processing AI`
- `AI Context`

## Checks

Run these after changing this page:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
