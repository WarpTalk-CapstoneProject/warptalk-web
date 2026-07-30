# Post-room Feedback Flow

This document tracks `/feedback`.

## Current Behavior

- `/feedback` has been converted to a shadcn internal dashboard page.
- The page now uses frontend preview state instead of backend room lookup/submission so it can be reviewed without authentication or backend services.
- It includes score metric cards, four rating dimensions, host notes, operational signal cards, and a recent-feedback queue.
- Submitting validates the overall score and shows a local preview submitted state.

## Files Affected

- `src/app/(app)/feedback/page.tsx`

## Template Mapping

Adopted from `shadcn-dashboard-landing-template`:

- Page header actions.
- Metric cards.
- Bordered form cards.
- Right-side operational summary and queue cards.

Not adopted:

- Previous backend duplicate-prevention flow, because the current project stage explicitly does not require backend/auth.
- Template product analytics widgets that do not map to post-room quality review.

## Future Backend Notes

When backend feedback endpoints are available, reconnect:

- `GET /translationRooms/{id}/feedback-state`
- `POST /translationRooms/{id}/feedback`

The form fields still conceptually map to overall, translation quality, audio quality, AI summary quality, and comments.

## Testing Checklist

- [ ] `/feedback` renders inside the host shell.
- [ ] Rating buttons toggle selected states.
- [ ] Submit without overall score shows validation.
- [ ] Submit with overall score sets the captured state.
- [ ] Recent feedback queue renders with shadcn cards/badges.
