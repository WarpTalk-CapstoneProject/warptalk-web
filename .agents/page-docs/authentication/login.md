# Login Page Documentation

This document maintains the state, changes, and logic for the Login Page.

## Current Route

- Route: `/login`
- Source: `src/app/(auth)/login/page.tsx`
- Auth group layout still wraps the page, but the login page renders a fixed full-viewport surface so it can match the provided split-panel visual design without changing the register and forgot-password routes.

## Latest Changes

- Reworked `/login` into a cinematic full-screen auth hero using the reachable CloudFront hero video background `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260419_064822_f120e48a-d545-45dd-a02d-facb07829888.mp4`.
- Added shared `CinematicAuthShell` with a glassmorphism outer shell, angled left visual panel, frosted white form panel, language control, and cross-link to registration.
- Updated the login form to match the supplied astronaut-card reference: avatar circle, compact rounded inputs, forgot-password link, divider, Google button, and dark rounded primary login button.
- Refined the astronaut-card reference match by changing the shell to a white framed card, clipping the left video panel with `clip-path` for the diagonal edge, and reducing dark overlays so the supplied Cloudinary video remains visible instead of reading as a black panel.
- Added a cinematic CSS fallback behind both video layers and fades the video in only after it can play, preventing a black screen when the external video asset has not loaded or is inaccessible.
- Adjusted the video object position to `50% 76%` because the selected CloudFront video is portrait-oriented; this keeps the landscape/person portion visible inside the wide auth panel instead of cropping into the dark middle of the clip.
- Fixed the left visual card corner treatment by moving the diagonal `clip-path` from the whole `aside` to the internal media layer, preserving the rounded wrapper and bottom white padding.
- Split the video crop behavior: the page background now focuses higher on the star field (`50% 44%`) with lower opacity to avoid enlarged rocky foreground artifacts, while the left panel keeps the lower crop for the visible person/landscape composition.
- Added a bottom inset to the clipped media layer and increased the content bottom padding so the left video reads as an image inside the white frame instead of running flush to the bottom edge.
- Replaced the sharp polygon media mask with an SVG `clipPath` path that rounds the top-right and bottom-right slanted video corners to better match the supplied reference.
- Rebuilt the login UI to match the attached reference layout: a large centered rounded container on a neutral gray page, a white form panel on the left, and a dark blue visual panel on the right.
- Added a mockup-inspired right panel with layered gradients, animated glass ticket shards, a brand block, and bottom support/access copy.
- Refined the reference match by reducing the page/card scale, tightening typography and control heights, and replacing solid CSS ticket blocks with an inline SVG glass scene using translucent gradients, white strokes, shine streaks, blur-like layered shadows, and fine texture noise.
- Preserved the existing login behavior: the form posts to `API.auth.login`, stores tokens with `useAuthStore`, writes the `access_token` cookie, and redirects to `callbackUrl` or `/dashboard`.
- Updated visible copy to English to align with the supplied design reference.

## UI Behavior

- The form includes email and password fields with leading icons, password visibility toggle, remember-me checkbox, Google-style secondary action, register link, forgot-password link, footer copyright, and language selector affordance.
- The left cinematic video panel is displayed on large screens and hidden on smaller screens so the form remains usable and uncluttered on mobile.
- The CloudFront hero video is rendered both behind the page and inside the left panel to create depth while preserving the same auth flow.

## Known Limitations

- "Continue with Google", "Keep me logged in", and the language selector are presentational controls only; no OAuth, persistent remember-me setting, or language switching logic is currently wired here.
- Contact details in the visual panel are placeholder product copy and should be replaced with official support channels when available.

## Testing Checklist

- Run `npm run lint`.
- Open `http://localhost:3000/login` and verify the desktop layout matches the reference composition.
- Verify the mobile layout keeps the form readable without horizontal overflow.
- Submit invalid values to confirm validation messages render without shifting the layout unexpectedly.
