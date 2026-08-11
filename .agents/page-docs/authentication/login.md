# Login Page Documentation

This document maintains the state, changes, and logic for the Login Page.

## Current Route

- Route: `/login`
- Source: `src/app/(auth)/login/page.tsx`
- Background component: `src/components/auth/animated-halftone.tsx`

## Latest Changes

- 2026-07-30: Landing Get Started now uses `/login?callbackUrl=%2Fworkspace` as the canonical guest entry point. When an `access_token` cookie and a valid `active_workspace_slug` cookie are present, landing skips login and opens `/<workspaceSlug>/home`. `/login` still accepts the legacy `redirect` parameter for existing callers, but new landing CTAs should use `callbackUrl`.
- 2026-08-11: `/login` uses a white, centered auth layout over the animated halftone background. The email and password inputs now use `login-auth-field`, and `globals.css` scopes a `:-webkit-autofill` override so filled values stay black on an opaque white field instead of Chromium's dim blue-gray autofill surface.
- The login page uses the WarpTalk header logo, a centered "Log in or sign up" heading, Google login, an `Or` divider, rounded email/password fields, a black primary action, account creation link, and terms/privacy footer.
- Removed the previous dark two-column auth shell from this route.
- The route owns its white page background directly, so it is isolated from the app-level theme class applied by `next-themes`.
- Preserved existing login behavior:
  - Post to `API.auth.login`
  - Store tokens with `useAuthStore`
  - Write `access_token` cookie
  - Redirect to a safe `callbackUrl`, legacy `redirect`, or `/workspace`
- The Google social mark is shared from `src/components/auth/cinematic-auth-shell.tsx`.

## Current Behavior

- The first step asks for email and advances to the password step only after the email validates.
- The second step shows the selected email in an opaque white pill, then asks for password with a show/hide password toggle, keep-me-logged-in checkbox, forgot-password link, and submit button.
- The Google social button calls Google OAuth when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is configured, otherwise it renders disabled.
- The animated halftone canvas is decorative and sits behind the form. Interactive form surfaces should remain opaque enough to keep text readable over the dots.
- `callbackUrl` is the preferred post-auth return parameter. It must be a same-origin path beginning with `/`; otherwise login falls back to `/workspace`.

## Known Limitations

- Keep-me-logged-in remains presentational.
- The root provider can apply a dark class from the system theme, so login-specific inputs force `color-scheme: light` and override Chromium autofill colors locally.

## Testing Checklist

- [x] Run ESLint.
- [x] Confirm `/login` responds locally.
- [x] Verify login field CSS forces light color scheme and white Chromium autofill surface.
- [ ] Open `/login` on desktop and verify the white halftone layout visually.
- [ ] Open `/login` below `lg` width and verify the form remains usable.
- [ ] Submit invalid values to confirm validation messages render cleanly.
- [ ] Confirm successful login redirects to the callback URL or `/workspace`.
