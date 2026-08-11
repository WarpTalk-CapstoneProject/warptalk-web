# Authentication Overview

This document provides an overview of the authentication system, components, and logic used in the project.

## Current Auth UI Direction

- `/register` and `/forgot-password` share `src/components/auth/cinematic-auth-shell.tsx`.
- `/login` now owns a centered white halftone layout in `src/app/(auth)/login/page.tsx` and uses `src/components/auth/animated-halftone.tsx` behind the form.
- The shared shell implements the requested two-column auth interface with WarpTalk branding on the video side for the remaining shell-based auth routes.
- The large-screen left column uses a pure local background video with no overlay, gradient, or tint mask.
- Auth video source: `public/assets/videos/auth-investor-deck.mp4`, copied from `E:/KhoiDongDuAn/templateprompt/motionsites.ai/assets/videos/Investor_Deck_1.mp4`.
- `src/middleware.ts` excludes `mp4`, `webm`, and `ogg` assets from auth redirects so public video files are served as media instead of falling through to an HTML page.
- The previous Aurora label, "Join Aurora" copy, and three-step list have been removed from the video column.
- Google auth is the only social button shown, and it is placed below the primary form action behind an `Or` divider.
- GitHub social auth has been removed from the auth UI.
- `src/app/(auth)/layout.tsx` intentionally returns `children` directly so the shared shell can own the full viewport.
- `src/app/globals.css` and `src/app/layout.tsx` apply the requested global black body background, white text, Inter font, and antialiasing so auth screens do not expose a light page background.
- `src/components/auth/cinematic-auth-shell.tsx` has explicit `motion/react` variant typing so the shared auth shell passes production TypeScript builds with the current Motion package.
- `src/app/globals.css` includes login-scoped autofill rules so Chromium/Edge saved credentials do not repaint the white login fields gray.
- Authentication logic remains in each route page:
  - Login posts to `API.auth.login`.
  - Register posts to `API.auth.register`.
  - Forgot password posts to `/auth/forgot-password` and keeps email enumeration protection by showing success in both success and catch paths.
  - Login and register store auth state with `useAuthStore` and persist the `access_token` cookie.

## Current Limitations

- Google auth buttons are presentational.
- The left video-column branding uses the local monochrome WarpTalk icon asset with a lowercase `warptalk` wordmark.
- A CSS-only background could approximate the abstract lighting/noise if needed, but it will not reproduce the exact motion and texture of the video.
