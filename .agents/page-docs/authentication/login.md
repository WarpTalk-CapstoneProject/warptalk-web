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

## WT-649 — Transport failures no longer read as "wrong password"

The catch block reached into `response.data.error` by hand, so it only ever saw a response BODY.
An API that was unreachable, rate-limited, or 502/504 therefore produced "Login failed. Please try
again." — which, on a sign-in form, reads as *your credentials are wrong*. The person retries the
one thing that cannot work, and may reset a password that was never the problem.

It now uses the shared `getErrorMessage` from `src/lib/api/errors.ts`, which already distinguishes
offline / 429 / 503 / 502 / 504 / 500 from a real refusal. The Google sign-in path had the same
shape and got the same fix.

The `ACCOUNT_PENDING` branch above it is untouched — it reads `code`, not the message, and is
still the first thing checked.

Found while sweeping Flow 1 for the defect class WT-649 reported on the registration screen.

**Testing checklist**

- [x] `npm run lint`, `npm run typecheck`, `npm run test:contracts` — clean.
- [ ] Stop the API, attempt sign-in → a transport message, not "Login failed".
- [ ] Sign in with a genuinely wrong password → still the server's own refusal message.
- [ ] Sign in with an unverified account → still redirects to /verify-email.
