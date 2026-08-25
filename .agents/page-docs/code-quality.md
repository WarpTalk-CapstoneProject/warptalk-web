# Code Quality Tooling

## Purpose

This document tracks project-wide code quality checks that affect local development and Docker builds.

## Current Behavior

- `npm run lint` runs ESLint with the Next.js `core-web-vitals` and TypeScript presets.
- The ESLint config keeps legacy migration issues visible as warnings instead of blocking builds:
  - explicit `any`
  - CommonJS `require`
  - hook-order checks in existing legacy pages
  - synchronous state updates in effects
  - manual memoization preservation
  - unescaped JSX entities
- Unused ESLint disable comments are reported as warnings.

## The contracts test chain

`npm run test:contracts` delegates to `scripts/run-contracts.mjs`, which **discovers** every `test:*`
script in `package.json` rather than listing them. Adding a `test:*` script is the whole job — there
is no chain to update. The chain used to be a single ~1,100-character line of `npm run … && npm run …`,
which two branches could not both extend without colliding on that exact line, and hand-resolving that
collision had already silently dropped `test:settings-validation` and `test:notification-center`.

`scripts/check-test-scripts-wired.mjs` guards the opposite failure: a test script nobody runs is a
claim of coverage that quietly stopped being true. Both scripts import the same discovery rule from
`scripts/contract-suites.mjs`, so they cannot disagree:

- A suite the runner picks up counts as wired.
- A suite the runner **excludes** (`EXCLUDED` in `contract-suites.mjs`) must be named by a GitHub
  workflow instead. `test:routes` is the only one, and `ci.yml` runs it after `npm run build`.

Do not re-expand `test:contracts` back into an explicit `npm run` chain, and do not add an exclusion
to `contract-suites.mjs` without both a reason in the comment and somewhere else that runs it.

## Files Affected

- `eslint.config.mjs`
- `scripts/contract-suites.mjs`
- `scripts/run-contracts.mjs`
- `scripts/check-test-scripts-wired.mjs`

## Important Notes

- Warnings should still be cleaned up incrementally when touching the related files.
- Build-blocking lint errors should be reserved for issues that are safe to enforce across the current codebase.
- Heavy browser-only export libraries should be loaded on demand. Excel workbook generation uses `src/lib/export/create-excel-workbook.ts` so `exceljs` does not increase first-load JavaScript for pages that only need export after a click.

## Testing Checklist

- Run `npm run lint`.
- Run `npx tsc --noEmit` before Docker builds when TypeScript behavior changed.
- Run `npm run build` after bundle-splitting changes and compare `.next/diagnostics/route-bundle-stats.json` for affected routes.
