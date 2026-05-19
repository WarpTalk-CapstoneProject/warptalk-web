# Register Page Documentation

This document maintains the state, changes, and logic for the Register Page.

## Maintenance Notes

- The register page posts to `API.auth.register`, stores the returned auth state with `useAuthStore`, writes the `access_token` cookie, and redirects to `/dashboard`.
- Cookie persistence is handled through a helper outside the component render path so React lint rules do not flag cookie mutation or time calculations inside component logic.

## Latest Changes

- Reworked `/register` to use the same shared `CinematicAuthShell` as `/login`.
- The page now uses the reachable CloudFront hero video background, glassmorphism card treatment, angled large-screen visual panel, and frosted white registration form.
- Refined the shared shell to better match the supplied astronaut-card reference: the outer auth card is now white-framed, the left video panel uses a clipped diagonal edge, and the dark overlays were reduced so the Cloudinary video remains visible.
- Added the same cinematic fallback and video-ready fade behavior used by `/login` so `/register` does not render as a black screen if the external video is unavailable.
- The shared video uses a lower object position (`50% 76%`) to preserve the landscape/person area of the portrait CloudFront clip inside the wide desktop visual panel.
- The shared shell now clips only the internal media layer so the left visual panel keeps its rounded wrapper and bottom white padding.
- The page-level video uses a separate higher crop (`50% 44%`) and reduced opacity so the full-screen background emphasizes the star field rather than enlarged foreground rocks.
- The clipped media layer now stops above the bottom edge with matching content padding, creating the same white frame spacing below the visual panel as the top and left edges.
- Added a Google-style sign-up button while preserving the existing email/password registration flow.
- Updated validation and toast copy to English to match the new auth UI direction.

## UI Behavior

- Register keeps the same two-panel auth layout as login on desktop.
- On smaller screens the cinematic side panel is hidden and the registration form remains centered on the video-backed glass card.
- Form fields remain wired to the existing `API.auth.register` request and redirect to `/dashboard` on success.
