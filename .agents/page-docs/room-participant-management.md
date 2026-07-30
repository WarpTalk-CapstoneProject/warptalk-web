# Room Participant Management

## Route

- Frontend route: `warptalk-web/src/app/(app)/room/[id]/page.tsx`
- Tickets: WT-94 participant management, WT-96 room lifecycle controls.
- Scope: participant management plus host lifecycle controls inside the translation room. WT-98 adds the handoff from ended rooms into `/feedback?roomId={id}`; the dedicated feedback form is documented in `feedback-flow.md`.

## UI Structure

The room page follows the meeting layout used in the WT-94 references:

- Persistent bottom meeting dock: logo/room identity is anchored left, Leave is anchored right, and the middle contains only evenly spaced circular feature icons for mic, live state, participants, camera/devices, translation, more, and share. There is no hover-revealed right-edge menu or enclosing pill/card around the whole dock.
- Main content: presentation area and video tile strip.
- Live translation is not duplicated in the main canvas; transcript content lives in the right panel.
- Right panel on desktop: tabbed side panel with Transcript as the primary tab, plus Chat and AI tabs.
- Right-side control drawer: clicking Live, Participants, Audio & camera, Translation, Share, or More from the bottom dock opens a drawer that slides in from the right. Device and translation settings are adjusted there instead of occupying permanent canvas space.
- Bottom toolbar: controls are always visible and intentionally minimal; it no longer relies on mouse hover to appear.
- Right panel AI input: the lower empty area of the right panel contains an AI question input with file and image attachment buttons.
- Meeting route chrome: `/room/[id]` bypasses the app sidebar/topbar so the page behaves as a full-screen meeting surface.
- Lifecycle controls: host-only actions live in the right-side Live controls drawer; participants do not see host lifecycle controls.

## Participant Fields

The participant row displays:

- Avatar/fallback initials.
- Display name and current-user marker.
- Role: `host`, `participant`, or `interpreter`.
- Status: `joined`, `connected`, `left`, or `removed`.
- Speak/listen language pair.
- Speak/listen language names are normalized through `src/lib/languages.ts` so query params, session payloads, backend codes, and readable names render consistently.
- Mute state separate from participant status.
- Voice clone indicator.

## Frontend Types

`ParticipantInfoDto` in `warptalk-web/src/types/realtime.ts` maps the SignalR payload from `WarpTalk.Gateway.Hubs.HubModels`.

Current backend fields:

- `userId`
- `displayName`
- `speakLanguage`
- `listenLanguage`
- `isMuted`
- `joinedAt`

Frontend optional enrichment fields used by the UI:

- `role`
- `status`
- `avatarUrl`
- `isUsingVoiceClone`

`TranslationRoomParticipantDto` in `warptalk-web/src/types/translationRoom.ts` maps the TranslationRoomService join response and the `translation_room.translation_room_participants` table shape. The UI expects optional `isMuted`, `isUsingVoiceClone`, and `avatarUrl` because these exist in the participant table/entity but are not fully returned by the current service DTO yet.

Room-level language policy in `TranslationRoomDto`:

- `sourceLanguage`: backend room source language.
- `targetLanguages`: backend room target languages string. The frontend parses comma-separated values into an array for display.

Participant-level language policy:

- `speakLanguage`: participant source language for speech/audio capture.
- `listenLanguage`: participant target language for transcript/audio output.

## Backend Mapping

Known backend references:

- `warptalk-backend/translation-room/src/WarpTalk.TranslationRoomService.Application/DTOs/TranslationRoomDtos.cs`
- `warptalk-backend/translation-room/src/WarpTalk.TranslationRoomService.Domain/Entities/TranslationRoomParticipant.cs`
- `warptalk-backend/gateway/src/WarpTalk.Gateway/Hubs/HubModels.cs`
- `warptalk-backend/gateway/src/WarpTalk.Gateway/Hubs/TranslationRoomHub.cs`

`translation_room.translation_room_participants` fields relevant to WT-94:

- `id`
- `translation_room_id`
- `user_id`
- `display_name`
- `role`
- `listen_language`
- `speak_language`
- `status`
- `is_muted`
- `is_using_voice_clone`
- `joined_at`
- `left_at`

`translation_room.translation_room_audio_routes` fields relevant to WT-95:

- `source_participant_id`
- `target_participant_id`
- `source_language`
- `target_language`
- `voice_clone_enabled`
- `status`

Frontend mapping:

- Room bar source language prefers `room.sourceLanguage`, then join session `sourceLanguage`, then current participant `speakLanguage`.
- Room bar target languages prefer `room.targetLanguages`, then join session `targetLanguages`, then current participant `listenLanguage`.
- Current participant display prefers `/room/[id]?speakLanguage=&listenLanguage=` query params, then `warptalk.join.{roomId}` session storage, then auth defaults.

## Realtime Events

The room page listens to:

- `ParticipantJoined(participant: ParticipantInfoDto)`: upserts the participant into the roster.
- `ParticipantLeft(userId: string)`: marks the participant as `left` so the roster can reflect state instead of silently losing history.
- `ParticipantMuteChanged(userId: string, isMuted: boolean)`: updates mute state separately from status.
- `TranscriptSegmentReceived(segment: TranscriptSegmentDto)`: keeps the live translation panel populated.

The room page invokes:

- `JoinTranslationRoom(roomId, displayName, speakLanguage, listenLanguage)`
- `LeaveTranslationRoom(roomId)`
- `ToggleMute(roomId, isMuted)` for the current user mute state.
- `SendAudioChunk(roomId, base64Audio, chunkIndex, language)` from speech capture.

The `language` argument is the current participant `speakLanguage`; downstream audio route targeting should use participant `listenLanguage` or backend audio route records.

## Host Actions

The participant menu includes:

- View details: available to all users.
- Mute/unmute: visible in host UI. Current backend only supports `ToggleMute` for the caller, so remote participant mute is represented in UI state and documented as a backend contract gap.
- Remove: shown as disabled until a backend host kick/remove contract exists.

Controls are disabled through `canManageParticipants` when the current user is not a host or the room owner.

## Room Lifecycle Controls

WT-96 adds host-only lifecycle controls for these frontend/backend statuses:

- `scheduled`: host can start or cancel.
- `waiting`: host can start or cancel.
- `in_progress`: host can end.
- `ended`: no lifecycle action available.
- `archived`: no lifecycle action available.
- `cancelled`: no lifecycle action available.

Backward compatibility aliases are normalized in the room page:

- `active` and `live` map to `in_progress`.
- `completed` maps to `ended`.

Destructive lifecycle actions use confirmation dialogs:

- End room: available only from `in_progress`; calls the live backend endpoint `POST /translationRooms/{id}/end`.
- Cancel room: available only from `scheduled` or `waiting`; currently uses a typed frontend mock adapter because backend has no `POST /translationRooms/{id}/cancel` endpoint yet.

Start is not destructive, but it still opens a confirmation dialog because it moves participants into the live session. It currently uses a typed frontend mock adapter because backend has no `POST /translationRooms/{id}/start` endpoint yet.

The UI updates the React Query cache after successful actions:

- `start`: cache status becomes `in_progress` and `startedAt` is set when missing.
- `end`: cache status becomes `ended` and `endedAt` is set.
- `cancel`: cache status becomes `cancelled`.

Participant Leave is intentionally separate from host End/Cancel:

- Participants use the bottom-dock `Leave` action to exit their local meeting experience.
- Hosts also have `Leave`, but ending/cancelling the room remains a distinct lifecycle control inside the Live drawer with confirmation.
- Once the room status is `ended` or `archived`, leaving routes to `/feedback?roomId={id}`.

## Backend Lifecycle Mapping

Current backend support:

- `POST /translationRooms/{id}/end`: implemented in `TranslationRoomsController.EndTranslationRoom` and `TranslationRoomService.EndTranslationRoomAsync`; verifies host ownership and writes `status = "ended"`.

Implemented backend endpoints:

- `POST /translationRooms/{id}/start` returns `TranslationRoomDto` and performs the legal transition to `in_progress`.
- `POST /translationRooms/{id}/cancel` returns `TranslationRoomDto` and enforces lifecycle transition rules.

Frontend integration:

- `translationRoom.service.ts` calls the real `start`, `cancel` and `end` endpoints.
- Host controls surface provider/backend failures instead of simulating success.

## Missing-data behavior

The page uses the authenticated user, API participants and live SignalR state.
When data is unavailable it renders an explicit empty/error state; it does not
inject contract-preview participants.
