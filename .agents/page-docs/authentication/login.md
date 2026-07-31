# Login Page Documentation

This document maintains the state, changes, and logic for the Login Page.

## Current Route

- Route: `/login`
- Source: `src/app/(auth)/login/page.tsx`
- Shared shell: `src/components/auth/cinematic-auth-shell.tsx`

## Latest Changes

- 2026-07-30: Landing Get Started now uses `/login?callbackUrl=%2Fworkspace` as the canonical guest entry point. When an `access_token` cookie and a valid `active_workspace_slug` cookie are present, landing skips login and opens `/<workspaceSlug>/home`. `/login` still accepts the legacy `redirect` parameter for existing callers, but new landing CTAs should use `callbackUrl`.
- Rebuilt `/login` to share the new dark two-column auth visual system with `/register`.
- The login page uses the same two-column shell, local Investor Deck background video, black form surface, social button, and rounded input styling.
- The left video column now contains only the WarpTalk monochrome icon and lowercase `warptalk` wordmark; the previous Aurora label, heading, description, and steps are removed.
- Removed the GitHub social button.
- Moved the single Google button below the primary login form and account link, separated by an `Or` divider.
- The route group layout now lets the page fill the viewport without the previous centered `max-w-md` wrapper.
- Global body styling in `globals.css` and the root body class in `src/app/layout.tsx` now use a black background and white text to match the dark auth surface and avoid light background gaps.
- Preserved existing login behavior:
  - Post to `API.auth.login`
  - Store tokens with `useAuthStore`
  - Write `access_token` cookie
  - Redirect to a safe `callbackUrl`, legacy `redirect`, or `/workspace`
- The Google social mark is shared from `src/components/auth/cinematic-auth-shell.tsx`.

## Current Behavior

- The form includes email, password, show/hide password toggle, keep-me-logged-in checkbox, forgot-password link, and submit button.
- The Google social button is presentational only.
- The left video column is hidden below `lg` width.
- `callbackUrl` is the preferred post-auth return parameter. It must be a same-origin path beginning with `/`; otherwise login falls back to `/workspace`.

## Known Limitations

- Google/GitHub login is not wired to OAuth.
- Keep-me-logged-in remains presentational.
- The video-column brand block uses `public/assets/logos/warptalk-icon-1k.jpg` inverted to white on the dark video.
- The video source is `public/assets/videos/auth-investor-deck.mp4`.

## Testing Checklist

- [x] Run ESLint on login and auth shell files.
- [x] Open `/login` on desktop and verify the dark two-column layout.
- [x] Verify GitHub is removed and the Google button is below the form.
- [ ] Open `/login` below `lg` width and verify the form remains usable.
- [ ] Submit invalid values to confirm validation messages render cleanly.
- [ ] Confirm successful login redirects to the callback URL or `/workspace`.
