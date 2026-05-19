# WT-106 Module 1 Demo Flow

## Linear Linkage

- Parent flow ticket: WT-106 - FE 1.9 Connect Module 1 Frontend with APIs and Demo Flow.
- Child frontend tickets covered by this integration pass: WT-91 room creation, WT-92 list/detail, WT-93 join, WT-94 participant management, WT-95 language configuration, WT-96 lifecycle controls, WT-97 history/artifacts, WT-98 feedback.

Ticket links:
- WT-91: https://linear.app/fpt-sep490-su26/issue/WT-91/fe-11-build-room-creation-and-scheduling-ui
- WT-92: https://linear.app/fpt-sep490-su26/issue/WT-92/fe-12-build-room-list-and-room-detail-ui
- WT-93: https://linear.app/fpt-sep490-su26/issue/WT-93/fe-13-build-join-room-ui
- WT-94: https://linear.app/fpt-sep490-su26/issue/WT-94/fe-14-build-participant-management-ui
- WT-95: https://linear.app/fpt-sep490-su26/issue/WT-95/fe-15-build-language-configuration-ui
- WT-96: https://linear.app/fpt-sep490-su26/issue/WT-96/fe-16-build-room-lifecycle-controls-ui
- WT-97: https://linear.app/fpt-sep490-su26/issue/WT-97/fe-17-build-room-history-and-artifact-ui
- WT-98: https://linear.app/fpt-sep490-su26/issue/WT-98/fe-18-build-room-feedback-ui
- WT-106: https://linear.app/fpt-sep490-su26/issue/WT-106/fe-19-connect-module-1-frontend-with-apis-and-demo-flow

## Demo Navigation

1. Host opens `/rooms/create`, configures meeting basics and room setup, then submits to the real backend `POST /translationRooms` endpoint.
2. Successful creation stores the returned room in the typed Module 1 demo cache and navigates to `/rooms`.
3. `/rooms` shows the existing schedule UI plus a WT-106 demo-flow room list sourced from the typed mock list adapter and local cache.
4. The user can open `/room/{id}` for room detail/live experience, or `/join?code={id}` to enter the join preflight.
5. `/join` maps to mockup #1. A GUID room id uses real `GET /translationRooms/{id}` plus real `POST /translationRooms/{id}/join`; short room codes remain typed mock because the backend has no join-by-code lookup.
6. The preparing screen maps to mockup #4 and appears between a successful preflight join and the room route.
7. `/room/{id}` maps to mockups #2/#3 for the in-meeting transcript, participant, AI/right-panel variants, language state, lifecycle controls, and SignalR events.
8. Ended rooms expose links to `/history` for artifacts and `/feedback?roomId={id}` for post-room feedback.

## Real Backend Contracts Wired

- `POST /translationRooms` via `translationRoomService.create`.
- `GET /translationRooms/{id}` via `translationRoomService.get`.
- `POST /translationRooms/{id}/join` via `translationRoomService.join`.
- `POST /translationRooms/{id}/end` via `translationRoomService.end`.
- Transcript service remains wired through `POST /transcripts`, `GET /transcripts/{id}`, `POST /transcripts/{id}/audio`, and `POST /transcripts/{id}/finalize`.
- SignalR room hub uses `/hubs/translationRoom` with `JoinTranslationRoom`, `LeaveTranslationRoom`, `ToggleMute`, `SendAudioChunk`, and event handlers for participant, transcript, translation text, and room ended notifications.

## Typed Mock Adapters Kept Intentionally

- `translationRoomService.list`: TODO backend contract `GET /translationRooms?workspaceId=&status=&cursor=` returning rooms accessible to the authenticated user.
- `translationRoomService.start`: TODO backend contract `POST /translationRooms/{id}/start -> TranslationRoomDto`.
- `translationRoomService.cancel`: TODO backend contract `POST /translationRooms/{id}/cancel -> TranslationRoomDto`.
- `translationRoomService.joinByCode` for non-GUID codes: TODO backend contract to resolve `translationRoomCode` to a room id or provide `POST /translationRooms/join-by-code`.
- `roomHistoryService.listEndedRooms`: TODO backend contracts `GET /translationRooms/history?status=ended` and `GET /translationRooms/{id}/artifacts`.
- `translationRoomService.getFeedbackState` and `submitFeedback`: TODO backend contracts `GET/POST /translationRooms/{id}/feedback`.
- Host remote mute/remove actions are UI-only until participant management endpoints are available.

## Permission And State Rules

- `/rooms/create` blocks participant-only users and directs them to the join preflight.
- Room lifecycle controls are visible only for host-role users or the room host, and not for users who entered through participant preflight.
- Participant controls show disabled states for non-host users.
- Feedback is locked unless the room is `ended` or `archived`, and duplicate submission is blocked by the feedback mock state.
- History supports loading, empty, permission denied, error, expired artifact, missing artifact, and ready states.

## Known Limitations

- The backend currently requires auth for real room create/get/join/end, so unauthenticated local demos use mock preflight and contract preview states.
- The backend does not expose list/start/cancel/artifact/feedback APIs yet; those are kept as typed mocks with contract TODOs in code.
- The real backend joins by room id, not display room code. `/join?code={guid}` exercises the real join path; `/join?code=GSS-7X2Q` exercises the mock code path.
- The room page uses SignalR when reachable and falls back to contract preview participants/transcripts when the hub is unavailable.
- Artifact downloads point to mock URLs until storage/export endpoints are implemented.
