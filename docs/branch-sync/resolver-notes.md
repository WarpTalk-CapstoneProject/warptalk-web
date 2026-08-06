# Branch Sync Resolver Notes

Use this file to record each sync run that merges `origin/development` into an open PR branch.

## Branch

- PR:
- Head branch:
- Base branch:
- Sync date:

## Merge Result

- `git fetch`:
- `git merge origin/development`:
- Auto-merged files:
- Conflict files:

## Conflict Resolution Notes

- File:
- Decision:
- Reason:

## Push Result

- Commit SHA:
- `git push`:

## Follow-up

- Local checks run:
- Remaining risks:

---

## Branch

- PR: #66
- Head branch: `chore/update-workspace-settings-and-access-governance-ui`
- Base branch: `development`
- Sync date: 2026-08-04

## Merge Result

- `git fetch`: refreshed `origin/development` and the PR head branch.
- `git merge origin/development`: merged development changes; `package.json` and `src/lib/api/endpoints.ts` auto-merged.
- Auto-merged files: `package.json`, `src/lib/api/endpoints.ts` and the remaining development changes.
- Conflict files: `package-lock.json`.

## Conflict Resolution Notes

- File: `package-lock.json`
- Decision: regenerated the lockfile from the merged `package.json` with `npm install --package-lock-only --ignore-scripts`.
- Reason: preserve the merged manifest, including development's `shadcn` dev dependency and security overrides, without hand-editing generated dependency metadata.

## Push Result

- Commit SHA: pending
- `git push`: pending

## Follow-up

- Local checks run: `npm audit --omit=dev --audit-level=high`, `npm run typecheck`, `npm run test:contracts`, `npm run lint`, `npm run build`.
- Remaining risks: lint has one pre-existing React Hook Form compiler warning; the first sandboxed build could not fetch Google Fonts, while the network-enabled build compiled successfully.
