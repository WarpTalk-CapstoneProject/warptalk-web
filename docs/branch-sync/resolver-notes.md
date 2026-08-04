# PR #74 Development Sync Resolver Notes

## Source

- PR branch: `chore/update-auto-save-settings-pages`
- Merged source: `origin/development`
- Conflict file: `src/components/layout/linear-sidebar.tsx`

## Resolution

- Kept the PR's workspace `Invitations` navigation item.
- Kept the PR's owner-only `Manage access` settings navigation item.
- Adopted development's Platform navigation entries: Overview, Workspaces, Billing, and Global Glossary.
- Adopted the `exact` navigation option so `/admin` is not highlighted for every nested admin route.
- Consolidated imports to remove duplicate declarations introduced by the conflict.

## Validation

See `docs/branch-sync/quality-check.md` for commands and results.
