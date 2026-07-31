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
- `record`: the active host can start or stop LiveKit RoomComposite Egress from the
  meeting control bar.

Only the actual room host (original or current promoted Live host) receives the end-for-all
control. Workspace Owner/Admin membership by itself does not authorize a provider-room end.

Leaving or navigating Back only disconnects that participant. A natural LiveKit
`room_finished` event from an empty provider room does not finish the WarpTalk meeting; the
TranslationRoom idle worker owns the five-minute empty-room grace period.

## Meeting Duration

- Duration is derived at display time; it is not persisted when the room ends.
- An active meeting uses `now - createdAt` and the in-meeting timer updates every second.
- An ended meeting uses `endedAt - createdAt` and remains frozen after ending.
- History, AI Summary, and Room Detail consume the same frontend calculation and ignore the
  legacy `durationSeconds` response as a source of actual meeting duration.

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

## Recording Control

- The host sees one record control in the floating meeting control bar.
- The control starts recording when inactive and stops the active Egress when recording.
- While the API request is pending, the control is disabled and pulses so repeated clicks
  cannot start duplicate Egress jobs.
- A successful response updates the caller immediately; `RecordingStateChanged` remains the
  authoritative SignalR broadcast for every other participant.
- The red "This meeting is being recorded" banner is visible to everyone while active.
- Failures keep the prior state and show a start/stop-specific toast.
- Cloud Egress writes to the S3-compatible HTTPS destination configured by the backend.
- LiveKit `DeleteRoom` uses the `roomCreate` grant, while participant removal keeps the
  room-scoped `roomAdmin` grant. MeetingService persists `FINISHED` only after provider
  deletion succeeds.

## LiveKit Cloud Media Effects

- The room still requests browser `echoCancellation` and `noiseSuppression` during capture.
- Krisp enhanced noise suppression is applied asynchronously after the local mic publishes.
- If Krisp authentication or processor setup fails, the preference is turned off, the user
  receives a toast, and browser-level noise suppression remains active instead of leaving an
  unhandled promise rejection.

## Files Affected

- `src/app/(app)/room/[id]/page.tsx`
- `src/hooks/use-translationRooms.ts`
- `src/services/translationRoom.service.ts`
- `src/lib/api/endpoints.ts`
- `src/types/translationRoom.ts`
- `src/components/rooms/live/meeting-control-bar.tsx`
- `src/components/rooms/live/meeting-timer.tsx`
- `src/lib/meeting-duration.ts`
- `src/services/roomHistory.service.ts`
- `src/hooks/use-meeting.ts`
- `src/hooks/use-track-processors.ts`
- `src/services/meeting.service.ts`
- `scripts/check-recording-control-contract.mjs`
- `scripts/check-track-processors-contract.mjs`
- `.agents/page-docs/room-lifecycle-controls.md`

## Testing Checklist

- Open `/room/{id}` and confirm the lifecycle card renders.
- Confirm scheduled/waiting states show Start and Cancel.
- Confirm active/in-progress states show End.
- Confirm ended/archived/cancelled states show no available action.
- Confirm action confirmation appears before start/end/cancel.
- Confirm successful start/cancel updates local room state.
- Confirm end attempts the backend endpoint and reports failure if the backend is unavailable.
- Confirm Back/Leave keeps the meeting rejoinable during the five-minute empty-room grace period.
- Confirm LiveKit DeleteRoom succeeds for the actual host and provider failure does not persist `FINISHED`.
- Confirm the in-meeting WarpBot context reports `live` even if the fetched room status is stale.
- Confirm the meeting timer starts at `createdAt`, keeps ticking while active, and freezes at
  `endedAt` after the room ends.
- Run `npm run test:meeting-duration`.
- Confirm only the host sees the recording control.
- Confirm the record control disables while Start/Stop Egress is pending.
- Confirm all participants receive the recording banner through SignalR.
- Run `npm run test:recording-control`.
- Run `npm run test:track-processors`.
- Run `npm run test:2807-hotfix`.
