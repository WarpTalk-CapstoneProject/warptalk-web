# Room Lifecycle Controls

## Route

- Frontend route: `warptalk-web/src/app/(app)/room/[id]/page.tsx`
- Ticket: WT-96 - FE 1.6 Build Room Lifecycle Controls UI.

## Scope

WT-96 adds host-facing lifecycle controls for translation rooms. It is separate from participant management, language configuration, feedback, history, and module-demo integration work.

## Current Behavior

The room page now shows a Room lifecycle controls card above the language configuration panel.

The card displays:

- Current room state.
- Explanation of what that state means.
- Legal host actions for the current state.
- Confirmation UI for lifecycle-changing actions.
- Disabled action state while a mutation is running.

## Supported States

- `scheduled`: host can start or cancel.
- `waiting`: host can start or cancel.
- `active`: host can end.
- `in_progress`: host can end.
- `completed`: controls are locked.
- `ended`: controls are locked.
- `archived`: controls are locked.
- `cancelled`: controls are locked.

`live` is normalized to `in_progress` when encountered from realtime or future API payloads.

## Actions

- `start`: moves a scheduled or waiting room into `in_progress`.
- `end`: ends an active or in-progress room.
- `cancel`: cancels a scheduled or waiting room.

Start and cancel currently use typed frontend mock adapters because backend endpoints are not available yet. End calls the existing backend endpoint `POST /translationRooms/{id}/end`.

## Frontend Mapping

- `TranslationRoomLifecycleAction` lives in `src/types/translationRoom.ts`.
- `API.translationRooms.start` and `API.translationRooms.cancel` are defined for the expected backend shape.
- `translationRoomService.start` and `translationRoomService.cancel` are documented mock adapters.
- `useStartTranslationRoom`, `useEndTranslationRoom`, and `useCancelTranslationRoom` update React Query cache where possible.

## Backend Contracts Needed

Suggested endpoint shape:

- `POST /translationRooms/{id}/start` -> `TranslationRoomDto`
- `POST /translationRooms/{id}/cancel` -> `TranslationRoomDto`

Both endpoints should validate host ownership and legal transitions.

## Files Affected

- `src/app/(app)/room/[id]/page.tsx`
- `src/hooks/use-translationRooms.ts`
- `src/services/translationRoom.service.ts`
- `src/lib/api/endpoints.ts`
- `src/types/translationRoom.ts`
- `.agents/page-docs/room-lifecycle-controls.md`

## Testing Checklist

- Open `/room/{id}` and confirm the lifecycle card renders.
- Confirm scheduled/waiting states show Start and Cancel.
- Confirm active/in-progress states show End.
- Confirm ended/archived/cancelled states show no available action.
- Confirm action confirmation appears before start/end/cancel.
- Confirm successful start/cancel updates local room state.
- Confirm end attempts the backend endpoint and reports failure if the backend is unavailable.
