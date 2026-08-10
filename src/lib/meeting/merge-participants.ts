import type { ParticipantInfoDto } from "@/types/realtime";
import type { TranslationRoomParticipantDto } from "@/types/translationRoom";

/**
 * Combine the room's participant list from the API with the live roster the
 * TranslationRoom hub broadcasts.
 *
 * The two sources are not interchangeable. The API row is the participant's room
 * membership — it owns the participant id, the room id and the **role**. The live payload
 * (Gateway's `ParticipantInfoDto`) is a presence snapshot: user id, display name, the two
 * languages, mute state, joined-at. It has no role, no participant id and no room id.
 *
 * WT-192: this used to be `{...apiRow, ...liveRow}`, with the live row built as
 * `role: live.role ?? "participant"`. Because the live spread came second, that fallback
 * overwrote the API's real `"host"` — so a room's own creator was labelled "Participant"
 * the moment they were in the call, while still showing "Host" outside it. Live values now
 * fill only the fields the live payload actually owns; identity and role stay with the API.
 */
export function mergeParticipants(
  apiParticipants: TranslationRoomParticipantDto[],
  liveParticipants: ParticipantInfoDto[],
): TranslationRoomParticipantDto[] {
  const byUserId = new Map(
    apiParticipants.map((participant) => [participant.userId, participant]),
  );

  for (const live of liveParticipants) {
    const known = byUserId.get(live.userId);

    byUserId.set(live.userId, {
      // Identity: only the API knows the participant row id. Replacing it with the user id
      // (as the old spread did) breaks every host action keyed on it — admit, reject and
      // the audio toggle all post `participant.id`.
      id: known?.id ?? live.userId,
      translationRoomId: known?.translationRoomId ?? "",
      userId: live.userId,
      // Role: API first. `live.role` is optional and the Gateway DTO never populates it, so
      // it can only ever be a mirror; the literal fallback applies to a live-only person
      // the API list has not caught up with yet.
      role: known?.role ?? live.role ?? "participant",
      displayName: live.displayName || known?.displayName || "",
      // Presence and languages are what the live payload is for, so it wins here.
      listenLanguage: live.listenLanguage || known?.listenLanguage || "",
      speakLanguage: live.speakLanguage || known?.speakLanguage || "",
      status: live.status ?? "connected",
      isTranslationAudioEnabled: !live.isMuted,
      isUsingVoiceClone: live.isUsingVoiceClone ?? known?.isUsingVoiceClone,
      avatarUrl: live.avatarUrl ?? known?.avatarUrl,
      joinedAt: live.joinedAt ?? known?.joinedAt,
      // API-only, and not something a presence snapshot can speak to.
      isExternal: known?.isExternal,
    });
  }

  return Array.from(byUserId.values());
}
