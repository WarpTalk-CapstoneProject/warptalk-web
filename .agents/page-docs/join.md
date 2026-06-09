# Join Page Documentation

This document tracks the standalone Join Room preflight flow at `/join`.

## Current Behavior

- `/join` has been rebuilt with shadcn UI patterns while staying outside the authenticated app shell.
- The page uses a dark video-preview card, preflight settings, language selects, device toggles, and a local ready state.
- Backend join-by-code and camera media access are intentionally skipped for the current no-backend review stage.
- Successful preview join stores `warptalk.join.preview` in `sessionStorage` and keeps the user on the preflight page with a ready state.

## Files Affected

- `src/app/join/page.tsx`

## Template Mapping

Adopted from `shadcn-dashboard-landing-template`:

- Card-based form composition.
- Compact badge/action header.
- Muted page background and token-based spacing.
- Device rows using shadcn switch controls.

Not adopted:

- Authenticated dashboard shell because join remains a public/standalone route.
- Backend room-code validation until the backend exists.
- Browser camera preview because this pass prioritizes deterministic UI review.

## Future Backend Notes

Expected future endpoint:

- `POST /api/v1/translationRooms/code/{translationRoomCode}/join`

The preview payload already captures display name, room code, speak/listen languages, and device preferences.

## Testing Checklist

- [ ] `/join` renders without authentication.
- [ ] Code query parameter pre-fills the room code.
- [ ] Language selects update the preview tile.
- [ ] Device switches update the preview pills.
- [ ] Join preview validates display name and code.
- [ ] Dashboard button routes back to `/dashboard`.
