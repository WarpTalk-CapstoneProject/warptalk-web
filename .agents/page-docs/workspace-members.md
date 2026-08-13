# Workspace Members

The Members page is the workspace access-management surface for active members, outbound invitations, and inbound join requests.

## Current Behavior

- The `All` tab shows active joined members only. Pending invitations and join requests never appear as member rows.
- The Owner tab is intentionally hidden. Owners remain visible in `All` and are highlighted with owner styling at the top of the sorted member list.
- Member rows sort by access level: Owner, Admin, Internal Member, External Member.
- Member tabs are `All`, `Admin`, `Member`, `Internal`, and `External`.
- Member views render separate `Internal Members` and `External Members` tables when both groups are present.
- The Export button is visible only on member tabs and exports the currently visible active member rows. It is hidden on `Invitations` and `Join Requests`.
- Owners/Admins see the `Invitations` tab for outbound invitation tracking. Pending invitations expose a revoke action; settled invitations remain visible for tracking but cannot be revoked.
- Owners/Admins see the `Join Requests` tab for inbound requests. Requested rows expose approve/reject actions, and approve requires selecting the final membership type allowed by backend policy.
- Internal/External access is chosen explicitly in the shared invite dialog. The dialog reads backend invitation policy to preselect/disable options and sends `membershipType` in the invite request.

## Files Affected

- `src/app/(app)/[workspaceSlug]/members/page.tsx`
- `src/components/workspace/invite-member-dialog.tsx`
- `src/lib/workspace/member-directory.ts`
- `src/hooks/use-workspace.ts`
- `src/services/workspace.service.ts`
- `src/lib/api/endpoints.ts`
- `src/types/workspace.ts`
- `scripts/check-members-directory-contract.mjs`

## Testing Checklist

- [x] Active member directory excludes invited, requested, suspended, and removed rows.
- [x] Owner tab is hidden while owners remain highlighted in the active directory.
- [x] Member rows sort Owner -> Admin -> Internal Member -> External Member.
- [x] Member directory can group rows into internal and external tables.
- [x] Invitations and Join Requests use `kind=outbound|join-request` to match the backend query contract.
- [x] Invite dialog sends explicit `membershipType`.
- [x] Export is scoped to member tabs and hidden on queue tabs.

## Known Limitations

- Member export uses the rows currently loaded for the active tab. A full-directory export across every page would need either a larger server-side export endpoint or a deliberate all-pages client fetch.
