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
- `npm run test:contracts` runs the existing contract suite and automatically invokes the plugin contract checks through `pretest:contracts`:
  - marketplace surface
  - confirmation surfaces
  - connection action
  - card lifecycle
  - plugin mention behavior

- CI (`.github/workflows/ci.yml`) runs `npm audit --omit=dev --audit-level=high` before lint; any high or critical advisory in a runtime dependency fails every PR, whatever the PR changes.

### 2026-09-30 Dependency security bump

- New advisories turned the audit step red on all branches: `next` 16.3.4 (critical, GHSA-vcvr-r3jv-pc5j, RCE in `next/og` ImageResponse) and `axios` 1.18.1 (high, a batch of prototype-pollution/ReDoS/SSRF advisories).
- Bumped to the patched versions, still pinned exactly: `next` 16.3.8, `axios` 1.20.0. `eslint-config-next` stays at 16.2.12 (dev-only, not audited).
- Verified locally: `npm audit --omit=dev --audit-level=high` reports 0 vulnerabilities; lint (0 errors), typecheck, `test:contracts`, `npm run build` and `test:routes` against the standalone server all pass.

## Files Affected

- `eslint.config.mjs`
- `package.json`, `package-lock.json` (dependency security bump)

## Important Notes

- Warnings should still be cleaned up incrementally when touching the related files.
- Build-blocking lint errors should be reserved for issues that are safe to enforce across the current codebase.

## Testing Checklist

- Run `npm run lint`.
- Run `npx tsc --noEmit` before Docker builds when TypeScript behavior changed.
- Run `npm run test:contracts` after merging feature branches that add contract scripts.
