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
2. Successful creation stores the returned room state and navigates to `/rooms`.
3. `/rooms` loads the authenticated user's rooms from the real list endpoint.
4. The user can open `/room/{id}` for room detail/live experience, or `/join?code={id}` to enter the join preflight.
5. `/join` maps to mockup #1 and resolves display codes through the real join-by-code endpoint.
6. The preparing screen maps to mockup #4 and appears between a successful preflight join and the room route.
7. `/room/{id}` maps to mockups #2/#3 for the in-meeting transcript, participant, AI/right-panel variants, language state, lifecycle controls, and SignalR events.
8. Ended rooms expose links to `/history` for artifacts and `/feedback?roomId={id}` for post-room feedback.

## Real Backend Contracts Wired

- `POST /translationRooms` via `translationRoomService.create`.
- `GET /translationRooms` via `translationRoomService.list`.
- `GET /translationRooms/{id}` via `translationRoomService.get`.
- `POST /translationRooms/join` via `translationRoomService.joinByCode`.
- `POST /translationRooms/{id}/start` and `/cancel`.
- `POST /translationRooms/{id}/end` via `translationRoomService.end`.
- `GET /translationRooms/history`, room artifacts and artifact download/consent.
- `GET/POST /translationRooms/{id}/feedback`.
- Participant admit/kick and audio controls.
- Transcript service remains wired through `POST /transcripts`, `GET /transcripts/{id}`, `POST /transcripts/{id}/audio`, and `POST /transcripts/{id}/finalize`.
- SignalR room hub uses `/hubs/translationRoom` with `JoinTranslationRoom`, `LeaveTranslationRoom`, `ToggleMute`, `SendAudioChunk`, and event handlers for participant, transcript, translation text, and room ended notifications.

## Deliberate Preview States

- Loading, empty, permission-denied and error states remain deterministic UI
  fixtures for visual testing; successful product paths use real service
  contracts.

## Permission And State Rules

- `/rooms/create` blocks participant-only users and directs them to the join preflight.
- Room lifecycle controls are visible only for host-role users or the room host, and not for users who entered through participant preflight.
- Participant controls show disabled states for non-host users.
- Feedback is locked unless the room is `ended` or `archived`, and duplicate submission is blocked by backend feedback state.
- History supports loading, empty, permission denied, error, expired artifact, missing artifact, and ready states.

## Known Limitations

- Product API paths require authentication; unauthenticated component previews
  may render deterministic visual states but cannot claim a successful backend
  operation.
- The room page uses SignalR for live state and reports transport failure
  instead of presenting preview data as a successful live connection.
- Artifact downloads use backend content or signed storage URLs and remain
  subject to retention and consent policy.
