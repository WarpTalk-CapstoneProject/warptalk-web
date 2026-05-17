# Post-room Feedback Flow

## Route

- Frontend route: `warptalk-web/src/app/(app)/feedback/page.tsx`
- Entry point from ended room: `warptalk-web/src/app/(app)/room/[id]/page.tsx` links to `/feedback?roomId={id}` when room status is `ended` or `archived`.
- Local UI preview without backend data: `/feedback?roomId=wt-98-feedback-demo`.
- Ticket: WT-98 FE 1.8 Build Room Feedback UI.

## Product Scope

WT-98 is a post-room feedback submission flow. It is not the feedback management, analytics, or admin review dashboard.

Workflow:

1. A translation room moves to `ended` or `archived`.
2. The room detail/list/history entry links to `/feedback?roomId={id}`.
3. The participant or host submits one feedback record for that room.
4. Duplicate submission is blocked by the backend contract or the current typed mock adapter.
5. Future management/reporting screens can read stored feedback, but that is outside WT-98.

## UI Scope

The feedback page is an authenticated dashboard-style screen, not a landing page. It uses compact cards, badges, alerts, rating buttons, textarea comments, and submit state consistent with the room/dashboard UI palette:

- `#fdfcf6` for soft panels.
- `#003476` for primary actions and selected rating buttons.
- `#e4eef9` for light borders and secondary emphasis.
- Black, white, and neutral slate for base text and surfaces.

## Feedback Availability

Feedback is available only for completed room states:

- `ended`
- `archived`

Compatibility aliases normalized by the page:

- `completed` maps to `ended`.
- `active` and `live` map to `in_progress`.

Locked states show an empty/locked state instead of the form:

- `scheduled`
- `waiting`
- `in_progress`
- `cancelled`

## Form Fields

Frontend form fields map to `translation_room.translation_room_feedback`:

- `overallRating` -> `overall_rating` and is required.
- `translationQuality` -> `translation_quality`.
- `audioQuality` -> `audio_quality`.
- `voiceCloneQuality` -> `voice_clone_quality`.
- `aiSummaryQuality` -> `ai_summary_quality` when an AI summary exists or the user chooses to rate it.
- `comments` -> `comments`.
- `communicationInsights` is populated by the mock adapter with lightweight metadata until backend defines the exact JSON shape.

Ratings use 1-5 button controls. Optional quality dimensions can be left blank. Comments use `Textarea`.

## Duplicate Prevention

The page calls `useTranslationRoomFeedbackState(roomId, userId)` before enabling submission.

Current implementation is a typed mock adapter in `warptalk-web/src/services/translationRoom.service.ts`:

- Reads `localStorage` key `warptalk.feedback.{roomId}.{userId}`.
- Returns `hasSubmitted: true` after the first successful mock submission.
- Disables the form and submit button when feedback already exists.

This mirrors the database unique index on `(translation_room_id, user_id)`.

## States

The page covers:

- Empty: no `roomId` query parameter.
- Loading: room and feedback state are being fetched.
- Error: room cannot be loaded.
- Locked: room is not in an ended/completed state.
- Ready: form is available.
- Submitting: submit button shows loading state.
- Success/submitted: duplicate submission is blocked.
- Error on submit: destructive alert and toast.

## Frontend Contract

Files added or updated for WT-98:

- `src/app/(app)/feedback/page.tsx`
- `src/app/(app)/room/[id]/page.tsx`
- `src/types/translationRoom.ts`
- `src/services/translationRoom.service.ts`
- `src/hooks/use-translationRooms.ts`
- `src/lib/api/endpoints.ts`

## Backend Contract Gap

Current TranslationRoom backend controller supports:

- `POST /translationRooms/{id}/end`

Feedback endpoints are not implemented yet. Proposed contract:

- `GET /translationRooms/{id}/feedback` -> `TranslationRoomFeedbackStateDto`
- `POST /translationRooms/{id}/feedback` -> `TranslationRoomFeedbackDto`

The POST endpoint should:

- Require JWT.
- Use authenticated user id as `user_id`.
- Accept only rooms with status `ended` or `archived`.
- Reject duplicate `(translation_room_id, user_id)` submissions.
- Persist fields matching `translation_room.translation_room_feedback`.

## Backend Schema References

Infrastructure DB schema includes:

- `overall_rating`
- `translation_quality`
- `audio_quality`
- `voice_clone_quality`
- `ai_summary_quality`
- `comments`
- `communication_insights`
- `created_at`

Current EF entity `TranslationRoomFeedback` is missing `AiSummaryQuality` even though infrastructure schema has `ai_summary_quality`; backend should reconcile the entity with the schema before implementing the endpoint.
