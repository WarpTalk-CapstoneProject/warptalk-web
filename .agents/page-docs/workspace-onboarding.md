# Workspace Onboarding

## Current Routes

- `/workspace`
- `/workspace/create`
- `/workspace/join`
- `/<workspaceSlug>/...`

## Latest Changes

- Added shared workspace slug validation in `src/lib/workspace-slug.ts`.
- Workspace slugs are normalized to lowercase and must be plain slug values, not URLs, hosts, reserved app routes, or route-like strings.
- Reserved and invalid values such as `localhost`, `localhost:3000`, `workspace`, `/acme`, and `acme/team` are rejected.
- `useWorkspaceStore.setActiveWorkspace` validates slugs before writing `active_workspace_slug`; invalid slugs clear that cookie instead of persisting bad navigation state.
- `src/app/(app)/[workspaceSlug]/layout.tsx` rejects invalid route params before workspace lookup and redirects to `/workspace`.
- `src/middleware.ts` validates `active_workspace_slug` before redirecting authenticated users from auth/public routes.
- `/workspace/join` now parses workspace URLs through `parseWorkspaceSlugInput` and shows a validation error instead of navigating to broken dynamic routes.

## Important Behavior

- A valid remembered workspace opens `/<workspaceSlug>/home`.
- A missing or invalid remembered workspace falls back to `/workspace`.
- Local development hosts are allowed as URL hosts, for example `localhost:3000/workspace/acme` parses to `acme`.
- Localhost itself is never allowed as a workspace slug.

## Files Affected

- `src/lib/workspace-slug.ts`
- `src/lib/workspace-slug.test.ts`
- `src/lib/landing-redirect.ts`
- `src/stores/workspace-store.ts`
- `src/middleware.ts`
- `src/app/(app)/[workspaceSlug]/layout.tsx`
- `src/app/(app)/workspace/join/page.tsx`

## Testing Checklist

- [x] Verify `localhost`, `localhost:3000`, and reserved route names are rejected as workspace slugs.
- [x] Verify `localhost:3000/workspace/acme` and `https://warptalk.app/workspace/acme` parse to `acme`.
- [x] Verify invalid remembered slugs fall back to `/workspace`.
- [x] Run ESLint on the workspace slug guard, workspace store, middleware, workspace slug layout, workspace join page, and landing redirect files.
