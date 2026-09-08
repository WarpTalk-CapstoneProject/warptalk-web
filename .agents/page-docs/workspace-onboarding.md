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

## Logo URL length (Flow 1 sweep)

`/workspace/create` validated that the logo value parses as a URL and stopped there. A URL
carrying a query string or a data payload passes that check at any length, and `workspaces.logo_url`
is `varchar(500)` — so the column was the first thing to refuse one, as an unexplained server
error rather than a message about the field.

**Changed**

- `src/app/(app)/workspace/create/page.tsx` — `WORKSPACE_NAME_MAX` (100) and
  `WORKSPACE_LOGO_URL_MAX` (500) named at the top of the file, and `logoUrl` gains `.max()`.
- The name limit stays at 100, tighter than the server's 150. A workspace name is the basis of its
  URL slug and a value people read aloud. Loosening later is safe; tightening is not.

**The enforcing guard is server-side.** This form is not the only caller — the desktop app and
anything holding a token post to the same endpoint — so the real rules live in
`WorkspaceConstants` and are tested there. What is here exists so the person typing gets an
inline message instead of a failed request.

**Known dead code found while doing this:** `src/lib/workspace/create-workspace-payload.ts` is
imported by nothing but its own tests, despite its header describing itself as what the form sends.
The form builds its payload inline. Either wire it up or delete it — leaving it reads as the
module in charge of a decision it is not making.

**Testing checklist**

- [x] `npm run lint`, `npm run typecheck`, `npm run test:contracts`.
- [ ] Paste a >500-character URL into Logo URL → inline error naming the limit.
- [ ] Leave Logo URL empty → still accepted; it is optional.
