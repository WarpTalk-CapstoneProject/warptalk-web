# Workspace knowledge page (`/{workspaceSlug}/knowledge`)

## What changed (WT-843, 2026-09-30)

The page compared the workspace role with a bare `role?.toLowerCase()` read from
`useWorkspaceStore`, which reads as "not owner/admin" whenever the role has not loaded yet after
login. It now uses the shared `useWorkspaceRole()` hook (`src/hooks/use-workspace-role.ts`), like
the glossary page: canonical lowercase role, collapsing "not loaded" to `"member"`.

`isOwner = role === "owner"`; `isOwnerOrAdmin = isOwner || role === "admin"`.

## Files affected

- `src/app/(app)/[workspaceSlug]/knowledge/page.tsx`

## Testing checklist

- [ ] Owner and admin see the privileged controls; member does not.
- [ ] Fresh login / hard reload: controls appear once the role resolves.

## Notes

Prefer `useWorkspaceRole()` over reading the store role directly; use `useWorkspaceRoleLoaded()` when "not loaded" must be distinguished.
