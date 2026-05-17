# Join Page Documentation

This document tracks the current behavior and integration notes for the Join Meeting preflight flow at `/join`.

---

## WT-93 Join Room UI

**What changed:**
- Rebuilt `/join` as a web preflight screen matching the Join Meeting mockup.
- Added camera preview with camera readiness state and camera fallback styling.
- Added camera, microphone, speaker, and settings controls.
- Added room title/code, display name, Join Meeting, Back, and desktop translation prompt surfaces.
- Added speak/listen language pair controls to the desktop translation prompt so participants can select the language pair before joining.
- Added the dark preparing-meeting fallback while access is being checked or the app is routing into `/room/[id]`.
- Added typed join-by-code request/result types and a `useJoinTranslationRoomByCode` hook.
- Updated `/room/[id]` to read `displayName`, `speakLanguage`, and `listenLanguage` from the join flow instead of using the previous hard-coded demo values.
- Added typed supported language config in `src/lib/languages.ts` as a frontend mock adapter until the backend exposes a supported-languages endpoint.

**Files affected:**
- `src/app/join/page.tsx`
- `src/app/(app)/room/[id]/page.tsx`
- `src/types/translationRoom.ts`
- `src/services/translationRoom.service.ts`
- `src/hooks/use-translationRooms.ts`

## Frontend and Backend Mapping

**Backend currently available:**
- REST create: `POST /api/v1/translationRooms`
  - Frontend type: `CreateTranslationRoomRequest`
  - Service: `translationRoomService.create`
- REST get by id: `GET /api/v1/translationRooms/{id}`
  - Service: `translationRoomService.get`
- REST join by id: `POST /api/v1/translationRooms/{id}/join`
  - Frontend type: `JoinTranslationRoomRequest`
  - Service: `translationRoomService.join`
- SignalR join: `JoinTranslationRoom(Guid translationRoomId, string displayName, string speakLanguage, string listenLanguage)`
  - Called from `/room/[id]` after route entry.
- Participant language preferences:
  - `speakLanguage`: language the participant speaks into the room.
  - `listenLanguage`: language the participant wants to hear/read.
- Room language policy:
  - `sourceLanguage`: room-level default source language.
  - `targetLanguages`: room-level allowed target languages. Backend currently stores this as a string; frontend mock/preflight uses an array and serializes to comma-separated codes for create payloads.
- Audio routing relation:
  - Backend `translation_room_audio_routes.source_language` maps from a source participant `speakLanguage` or room `sourceLanguage`.
  - Backend `translation_room_audio_routes.target_language` maps to a target participant `listenLanguage`.

**Gap handled in WT-93 frontend:**
- The backend does not yet expose a room-code lookup or room-code join endpoint.
- `/join` therefore calls `translationRoomService.joinByCode`, which uses the real `GET /translationRooms/{id}` + `POST /translationRooms/{id}/join` path when the submitted value is a GUID.
- For human room codes such as `GSS-7X2Q`, `joinByCode` uses a typed mock adapter returning `JoinTranslationRoomResultDto`. This keeps the UI contract stable until the backend adds a code lookup/join endpoint.

**Future backend endpoint shape expected:**
- `POST /api/v1/translationRooms/code/{translationRoomCode}/join`
- Request body should extend `JoinTranslationRoomRequest` with any needed preflight fields.
- Response should match or map cleanly into `JoinTranslationRoomResultDto`.

## Access States

The page supports these access statuses:
- `loading`: validating access and preparing the meeting.
- `invalid_code`: code format or room code is invalid.
- `room_unavailable`: room is not active, not found, or the meeting service cannot be reached.
- `room_full`: participant capacity reached.
- `kicked`: user was removed and cannot rejoin.
- `rejected`: host rejected access or local validation rejected the request.
- `success`: session details are stored and the app routes to `/room/[id]`.

Mock adapter test codes:
- `GSS-7X2Q`: success.
- `BAD-CODE`: invalid code.
- `OFF-LINE`: room unavailable.
- `FULL-ROOM`: room full.
- `KICKED`: kicked state.
- `REJECTED`: rejected state.

## Important UI Behavior

- `/join` is a standalone preflight page and does not use the authenticated app shell.
- Successful join stores a small `warptalk.join.{roomId}` session payload so `/room/[id]` can initialize display name and language preferences.
- The session payload now includes `sourceLanguage`, `targetLanguages`, and `translationMode` when returned by preflight/mock data.
- The preparing screen shows meeting context, topics, key terms, Back, and Exit controls.
- Live translation is presented as desktop-only in web preflight, with the selected language pair visible before the user downloads or joins.

## Known Limitations

- Join-by-code is mocked until backend room-code lookup/join exists.
- The settings button is presentational in this ticket.
- The desktop translation download button is visual only.
- Language selection is local state and is sent to the typed join request, but room-code lookup remains mocked for human room codes.
- Camera preview depends on browser media permission; the fallback visual is used when permission is denied or unavailable.

## Testing Checklist

- [ ] `/join` renders the mockup-aligned preflight layout on desktop.
- [ ] Camera permission accepted shows the video preview and ready state.
- [ ] Camera permission denied shows the fallback preview and unavailable state.
- [ ] Camera, microphone, and speaker controls toggle On/Off.
- [ ] Empty or too-short display name shows validation feedback.
- [ ] Invalid room code shows `invalid_code`.
- [ ] Mock codes show unavailable, full, kicked, and rejected states.
- [ ] Successful join shows the preparing screen and routes to `/room/[id]`.
- [ ] `/room/[id]` shows the joined display name and language pair from the join flow.
