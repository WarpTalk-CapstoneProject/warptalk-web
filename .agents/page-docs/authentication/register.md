# Register Page Documentation

This document maintains the state, changes, and logic for the Register Page.

## Current Route

- Route: `/register`
- Source: `src/app/(auth)/register/page.tsx`
- Shared shell: `src/components/auth/cinematic-auth-shell.tsx`

## Latest Changes

- Rebuilt `/register` into the requested dark two-column registration interface.
- The large-screen left column is exactly `w-[52%]`, hidden below `lg`, and uses the local Investor Deck video source:
  - `public/assets/videos/auth-investor-deck.mp4`
- No dark overlay, gradient, or tint mask is placed over the video.
- Added motion reveal for the left brand content.
- The left video column now contains only the WarpTalk monochrome icon and lowercase `warptalk` wordmark; the previous Aurora label, heading, description, and steps are removed.
- Removed the GitHub social button.
- Moved the single Google button below the registration form and login link, separated by an `Or` divider.
- Added reusable auth components in the shared shell:
  - `StepItem`
  - `SocialButton`
  - `InputGroup`
- The auth route group layout now returns children directly so the shared auth shell can occupy the full viewport.
- Global body styling in `globals.css` and the root body class in `src/app/layout.tsx` now use a black background and white text to match the requested auth design and avoid light background gaps.
- Updated registration fields to match the dark auth form:
  - First Name
  - Last Name
  - Email
  - Password with visibility toggle
- The submit handler maps `firstName + lastName` into the existing backend `fullName` field.
- The Google social button is visual only and uses the shared Google mark from `src/components/auth/cinematic-auth-shell.tsx`.

## Current Behavior

- Form posts to `API.auth.register`.
- On success, the page stores auth state with `useAuthStore`, writes the `access_token` cookie, and redirects to `/dashboard`.
- Password validation currently requires at least 8 characters to match the requested helper copy.

## Known Limitations

- Google social registration is presentational only.
- The video-column brand block uses `public/assets/logos/warptalk-icon-1k.jpg` inverted to white on the dark video.
- A CSS-only background could approximate the abstract lighting/noise if needed, but it will not reproduce the exact motion and texture of the video.

## Testing Checklist

- [x] Run ESLint on register and auth shell files.
- [x] Open `/register` on desktop and verify the two-column dark layout.
- [x] Verify GitHub is removed and the Google button is below the form.
- [ ] Open `/register` below `lg` width and verify the video column is hidden.
- [ ] Verify password show/hide works.
- [ ] Confirm successful registration redirects to `/dashboard`.
