# Room Participant Management

## Route

- Frontend route: `warptalk-web/src/app/(app)/room/[id]/page.tsx`
- Ticket: WT-94 - FE 1.4 Build Participant Management UI.

## Scope

WT-94 upgrades the host-facing participant surface inside a translation room. It focuses on participant visibility and management controls only. Lifecycle, feedback, history, and room list work should remain in separate tickets.

## UI Behavior

The room page now includes a dedicated participant panel that shows:

- Participant avatar or initials.
- Display name and a `You` marker for the current user.
- Role: `host`, `participant`, or `interpreter`.
- Status: `joined`, `connected`, `left`, or `removed`.
- Speak/listen language pair.
- Mute state.
- Voice clone readiness.
- A participant action menu.

Host actions currently include:

- View details.
- Mute/unmute.
- Remove.

Mute and remove actions are represented in frontend state while backend host moderation endpoints are pending. The current-user mute action attempts the existing SignalR `ToggleMute` call.

## Frontend Types

`ParticipantInfoDto` in `src/types/realtime.ts` keeps the backend-required fields and adds optional UI enrichment fields:

- `role`
- `status`
- `avatarUrl`
- `isUsingVoiceClone`

`TranslationRoomParticipantDto` in `src/types/translationRoom.ts` now allows optional participant UI fields:

- `isMuted`
- `isUsingVoiceClone`
- `avatarUrl`

## Realtime Handling

The room page listens for:

- `ParticipantJoined(participant: ParticipantInfoDto)`: upserts the participant into the roster.
- `ParticipantLeft(userId: string)`: marks the participant as `left` instead of removing the row immediately.
- `ParticipantMuteChanged(userId: string, isMuted: boolean)`: updates mute state independently from status.

`src/stores/translationRoom-store.ts` now exposes `updateParticipantMute(userId, isMuted)` and preserves left participants as inactive roster rows.

## Backend Gaps

Current backend support covers self mute through SignalR `ToggleMute`. Remote host mute and host remove/kick need dedicated backend contracts before the controls should be treated as authoritative.

Suggested future contracts:

- `POST /translationRooms/{roomId}/participants/{userId}/mute`
- `POST /translationRooms/{roomId}/participants/{userId}/remove`

## Files Affected

- `src/app/(app)/room/[id]/page.tsx`
- `src/types/realtime.ts`
- `src/types/translationRoom.ts`
- `src/stores/translationRoom-store.ts`

## Testing Checklist

- Open `/room/{id}` and confirm participant rows render with role, status, language pair, mute state, and voice clone indicator.
- Use the participant menu to view details.
- Toggle mute on the current participant and verify the UI updates.
- Toggle mute/remove on mock participants and verify rows update without removing unrelated participants.
- Confirm `ParticipantJoined`, `ParticipantLeft`, and `ParticipantMuteChanged` handlers update roster state when emitted by SignalR.
