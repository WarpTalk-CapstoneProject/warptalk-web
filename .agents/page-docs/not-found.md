# 404 And Error Experience

## Purpose

The root 404 and route error screens use a shared interactive experience so invalid routes and recoverable app errors do not render inside the dashboard shell or leave the sidebar/topbar in a broken state.

## Current Behavior

- `src/app/not-found.tsx` renders `Interactive404` for unknown routes.
- `src/app/error.tsx` renders the same `Interactive404` in error mode and passes the Next.js `reset` callback to the retry action.
- The page is full-screen and independent from the authenticated dashboard shell.
- The primary recovery path routes to `/dashboard` instead of relying on browser back, which reduces broken state after a bad dashboard route.

## Interaction Model

- The 404 cards are absolutely positioned inside one bounded frame.
- GSAP handles initial drop-in animation and per-frame transform updates through `gsap.ticker`.
- A lightweight local physics loop applies gravity, velocity damping, edge collision, rotation, and pointer collision.
- Users can grab a 404 card with pointer input and throw it; release velocity is preserved for inertia.
- Fast pointer movement pushes nearby cards away, making the 404 labels scatter within the frame.
- Pointer capture is guarded with `hasPointerCapture` checks to avoid interaction errors during fast drag/release.

## Files Affected

- `src/components/errors/interactive-404.tsx`
- `src/app/not-found.tsx`
- `src/app/error.tsx`

## Notes

- The implementation uses the existing `gsap` dependency already installed for dashboard sidebar motion.
- It does not use `InertiaPlugin` because that plugin is not part of the standard public GSAP package in this project; inertia is implemented locally.
