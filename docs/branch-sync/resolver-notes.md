# PR #74 Development Sync Resolver Notes

## Sources

- PR branch: `chore/update-auto-save-settings-pages`
- First merged source: `origin/development` at `56929a5`
- Second merged source: `origin/development` at `7290420`

## First Resolution

- Kept the PR's workspace `Invitations` navigation item.
- Kept the PR's owner-only `Manage access` settings navigation item.
- Adopted development's Platform navigation entries: Overview, Workspaces, Billing, and Global Glossary.
- Adopted the `exact` navigation option so `/admin` is not highlighted for every nested admin route.
- Consolidated imports to remove duplicate declarations introduced by the conflict.

## Second Resolution

- Resolved `package-lock.json` by keeping `shadcn` only in the root `devDependencies`, matching `package.json` and the locked `4.15.0` package.
- Adopted development's updated workspace invite dialog layout while preserving the existing invitation mutation, email validation, role selection, and pending-submit guard.
- Included the new development changes for the workspace join flow and translation-room API types.

## Validation

See `docs/branch-sync/quality-check.md` for commands and results.
