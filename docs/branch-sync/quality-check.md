# Branch Sync Quality Check

Run the smallest relevant set after each merge from `origin/development`.

## Minimum Checks

- `npm audit --omit=dev --audit-level=high`
- `npm run typecheck`

## When UI or routing files change

- `npm run build`

## When contract or behavior files change

- `npm run test:contracts`

## Branch Log

| PR | Branch | Checks Run | Result | Notes |
| --- | --- | --- | --- | --- |
| #66 | `chore/update-workspace-settings-and-access-governance-ui` | `npm audit --omit=dev --audit-level=high`; `npm run typecheck`; `npm run test:contracts`; `npm run lint`; `npm run build` | Pass | Audit found 0 vulnerabilities; typecheck/contracts passed; lint has 1 existing warning and no errors; production build compiled successfully with network access for Google Fonts. |
