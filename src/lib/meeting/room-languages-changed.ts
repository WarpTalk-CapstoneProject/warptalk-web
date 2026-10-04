/**
 * WT-709 — the host added a language to a meeting that is already running.
 *
 * The Gateway relays `RoomLanguagesChanged` to the room group AND its lobby with the meeting's
 * WHOLE declared set, `{ sourceLanguage, targetLanguages }` (TranslationRoomService
 * .PublishRoomLanguagesChangedAsync, camelCase, forwarded untouched). The whole set rather than
 * the one added code, so a client that missed an earlier change repaints correctly from this one.
 *
 * The in-meeting language picker builds its options from the room DTO (the room query), and the
 * hub now refuses any language outside that set. So until this event is applied, a language the
 * host has just added is one the participant cannot pick — the server would accept it, the menu
 * simply does not offer it until the next room fetch.
 *
 * Extension included on the import on purpose: this module is exercised by
 * node --experimental-strip-types, which does not resolve extensionless relative imports.
 */
import { normalizeLanguageCode } from "../language/languages.ts";

export type RoomLanguages = {
  sourceLanguage: string;
  targetLanguages: string[];
};

type RoomWithLanguages = {
  sourceLanguage?: string;
  targetLanguages: string[];
};

/**
 * The payload, or null when it is not the shape the backend sends.
 *
 * Hub payloads are untrusted input like any other: a malformed one must not blank the picker by
 * writing `undefined` over the room's languages. The caller refetches the room instead.
 */
export function parseRoomLanguages(payload: unknown): RoomLanguages | null {
  if (!payload || typeof payload !== "object") return null;
  const { sourceLanguage, targetLanguages } = payload as Record<string, unknown>;
  if (typeof sourceLanguage !== "string") return null;
  if (!Array.isArray(targetLanguages)) return null;
  if (!targetLanguages.every((code) => typeof code === "string")) return null;
  return { sourceLanguage, targetLanguages: targetLanguages as string[] };
}

function sameLanguageSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a.map(normalizeLanguageCode).filter(Boolean));
  const right = new Set(b.map(normalizeLanguageCode).filter(Boolean));
  return left.size === right.size && [...left].every((code) => right.has(code));
}

/**
 * The room with the meeting's languages replaced by the broadcast set.
 *
 * Compared after normalising, because the two sides do not spell codes alike: the broadcast is
 * normalised server-side ("vi"), while the room DTO carries whatever was stored ("vi-VN"). When
 * nothing actually changed the SAME object comes back, so React Query keeps its reference and
 * nothing downstream re-renders or re-runs its effects for a no-op.
 *
 * The room's own spelling of the source is kept unless the source really changed. Adding a
 * language never changes it, and rewriting "vi-VN" to "vi" under the session would be a change
 * nobody asked for in a value several effects compare against.
 */
export function applyRoomLanguages<T extends RoomWithLanguages>(
  room: T,
  languages: RoomLanguages,
): T {
  const sourceChanged =
    Boolean(languages.sourceLanguage) &&
    normalizeLanguageCode(room.sourceLanguage) !==
      normalizeLanguageCode(languages.sourceLanguage);
  const targetsChanged = !sameLanguageSet(room.targetLanguages ?? [], languages.targetLanguages);

  if (!sourceChanged && !targetsChanged) return room;

  return {
    ...room,
    sourceLanguage: sourceChanged ? languages.sourceLanguage : room.sourceLanguage,
    targetLanguages: targetsChanged ? languages.targetLanguages : room.targetLanguages,
  };
}
