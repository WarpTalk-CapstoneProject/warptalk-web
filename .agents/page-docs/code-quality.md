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

## Files Affected

- `eslint.config.mjs`

## Important Notes

- Warnings should still be cleaned up incrementally when touching the related files.
- Build-blocking lint errors should be reserved for issues that are safe to enforce across the current codebase.

## Testing Checklist

- Run `npm run lint`.
- Run `npx tsc --noEmit` before Docker builds when TypeScript behavior changed.
- Run `npm run test:contracts` after merging feature branches that add contract scripts.
