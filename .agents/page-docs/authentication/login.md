# Login Page Documentation

This document maintains the state, changes, and logic for the Login Page.

## Current Route

- Route: `/login`
- Source: `src/app/(auth)/login/page.tsx`
- Auth group layout still wraps the page, but the login page renders a fixed full-viewport surface so it can match the provided split-panel visual design without changing the register and forgot-password routes.

## Latest Changes

- Rebuilt the login UI to match the attached reference layout: a large centered rounded container on a neutral gray page, a white form panel on the left, and a dark blue visual panel on the right.
- Added a mockup-inspired right panel with layered gradients, animated glass ticket shards, a brand block, and bottom support/access copy.
- Preserved the existing login behavior: the form posts to `API.auth.login`, stores tokens with `useAuthStore`, writes the `access_token` cookie, and redirects to `callbackUrl` or `/dashboard`.
- Updated visible copy to English to align with the supplied design reference.

## UI Behavior

- The form includes email and password fields with leading icons, password visibility toggle, remember-me checkbox, Google-style secondary action, register link, forgot-password link, footer copyright, and language selector affordance.
- The right visual panel is displayed on large screens and hidden on smaller screens so the form remains usable and uncluttered on mobile.
- The visual ticket shards use existing global `animate-float` and `animate-sweep` utility animations.

## Known Limitations

- "Continue with Google", "Keep me logged in", and the language selector are presentational controls only; no OAuth, persistent remember-me setting, or language switching logic is currently wired here.
- Contact details in the visual panel are placeholder product copy and should be replaced with official support channels when available.

## Testing Checklist

- Run `npm run lint`.
- Open `http://localhost:3000/login` and verify the desktop layout matches the reference composition.
- Verify the mobile layout keeps the form readable without horizontal overflow.
- Submit invalid values to confirm validation messages render without shifting the layout unexpectedly.
