# Forgot Password Page Documentation

This document maintains the state, changes, and logic for the Forgot Password page.

## Current Route

- Route: `/forgot-password`
- Source: `src/app/(auth)/forgot-password/page.tsx`
- Shared shell: `src/components/auth/cinematic-auth-shell.tsx`

## Latest Changes

- Rebuilt `/forgot-password` from the old shadcn `Card` layout into the shared dark two-column WarpTalk auth shell.
- The page now matches `/login` and `/register` with the same local Investor Deck video column, WarpTalk monochrome brand block, black form surface, rounded inputs, and full-width white primary action.
- Removed GitHub social auth from the page.
- Added one presentational Google button below the reset form and login link, separated by an `Or` divider.

## Current Behavior

- The form accepts one email address.
- Submitting posts to `/auth/forgot-password`.
- The backend endpoint is still marked as not fully implemented in code.
- The catch path still shows a success message and redirects to `/login` to avoid email enumeration.

## Known Limitations

- Google social auth is presentational only.
- The password reset backend endpoint still needs production implementation.
- The video source is `public/assets/videos/auth-investor-deck.mp4`.

## Testing Checklist

- [x] Run ESLint on the forgot-password page and shared auth shell.
- [x] Open `/forgot-password` on desktop and verify it matches the shared auth layout.
- [x] Verify GitHub is absent and the Google button is below the reset form.
- [ ] Open `/forgot-password` below `lg` width and verify the video column is hidden.
- [ ] Submit an invalid email and confirm validation renders cleanly.
- [ ] Submit a valid email and confirm redirect behavior remains intentional.
