/**
 * WT-852 — what a saved room edit looks like before the server is asked again.
 *
 * "Room updated successfully." used to arrive over the OLD page: the toast fired as soon as the
 * PUT returned, and the page waited on a background refetch — while two of its surfaces (the
 * notes editor and the recurrence line) did not follow the refetch at all. The edit is applied
 * to the cached room first, so the page shows exactly what was saved the moment the save
 * succeeds, and the refetch that follows only confirms it.
 *
 * Mirrors the server's own merge in UpdateTranslationRoomSettingsAsync, field for field:
 * a blank title is ignored, a description is taken as sent (so "" clears it), languages are
 * replaced only when a non-empty list is sent, and `settings` is a partial patch over the
 * existing blob. Invitations are not part of the room DTO and are left to their own query.
 *
 * Pure and dependency-free: node-run tests import it without a bundler.
 */

type PatchableRoom = {
  title: string;
  description?: string;
  maxParticipants: number;
  scheduledAt?: string;
  sourceLanguage?: string;
  targetLanguages: string[];
  settings?: object;
};

type RoomSettingsPatch = {
  title?: string;
  description?: string;
  maxParticipants?: number;
  scheduledAt?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  settings?: Record<string, unknown>;
};

export function applyRoomSettingsPatch<T extends PatchableRoom>(room: T, patch: RoomSettingsPatch): T {
  const next: T = { ...room };
  if (patch.title !== undefined && patch.title.trim()) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.maxParticipants !== undefined) next.maxParticipants = patch.maxParticipants;
  if (patch.scheduledAt !== undefined) next.scheduledAt = patch.scheduledAt;
  if (patch.sourceLanguage !== undefined && patch.sourceLanguage.trim()) {
    next.sourceLanguage = patch.sourceLanguage;
  }
  if (patch.targetLanguages && patch.targetLanguages.length > 0) {
    next.targetLanguages = [...patch.targetLanguages];
  }
  if (patch.settings) {
    next.settings = { ...(room.settings ?? {}), ...patch.settings } as T["settings"];
  }
  return next;
}
