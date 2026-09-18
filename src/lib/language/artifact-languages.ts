/**
 * WT-705 — which languages a post-meeting picker may offer.
 *
 * Languages narrow at every level: workspace (L1) ⊇ meeting (L2) ⊇ artifact (L3). After a
 * meeting, two questions must never be confused:
 *
 * - READING content that already exists is never re-filtered. A summary produced in French
 *   stays readable even if the workspace later dropped French.
 * - GENERATING new language content is allowed only in the set the server computes
 *   (`room.artifactLanguages.generatable`, WT-703): the meeting's L2 snapshot intersected with
 *   the workspace's current L1. "As spoken" is always available and is not part of that set.
 *
 * When the server does not say (an older backend, or a room still running) the meeting's own
 * language set is the best available approximation. When a FINISHED room comes back with
 * `null` the server tried and failed, so this fails closed and offers nothing to generate.
 */

import type { RoomArtifactLanguagesDto } from "@/types/translationRoom";

import { meetingLanguageSet, normalizeLanguageCode } from "./languages.ts";

export type ArtifactLanguageRoom = {
  status?: string | null;
  sourceLanguage?: string | null;
  targetLanguages?: readonly string[] | null;
  artifactLanguages?: RoomArtifactLanguagesDto | null;
};

/**
 * Where the generatable set came from:
 * - "server" — the WT-703 set, authoritative.
 * - "meeting-fallback" — the server did not provide one; the meeting's languages are used.
 * - "unavailable" — no room, or a finished room whose set the server could not compute.
 */
export type GeneratableSource = "server" | "meeting-fallback" | "unavailable";

const TERMINAL_STATUSES = new Set(["ended", "cancelled", "expired", "failed", "timeout"]);

function isTerminalStatus(status?: string | null): boolean {
  return Boolean(status) && TERMINAL_STATUSES.has(String(status).trim().toLowerCase());
}

/** Normalizes to bare codes, dropping empties and duplicates, keeping first-seen order. */
function normalizeUnique(values: readonly (string | null | undefined)[]): string[] {
  const unique: string[] = [];
  for (const value of values) {
    const code = normalizeLanguageCode(value ?? undefined);
    if (code && !unique.includes(code)) unique.push(code);
  }
  return unique;
}

/** The bare language codes new artifact content may be generated in for this room. */
export function resolveGeneratableLanguages(room?: ArtifactLanguageRoom | null): {
  codes: string[];
  source: GeneratableSource;
} {
  if (!room) return { codes: [], source: "unavailable" };

  const { artifactLanguages } = room;
  if (artifactLanguages && typeof artifactLanguages === "object") {
    return { codes: normalizeUnique(artifactLanguages.generatable ?? []), source: "server" };
  }

  if (artifactLanguages === null && isTerminalStatus(room.status)) {
    // The room is finished and the server still could not compute the set: fail closed.
    return { codes: [], source: "unavailable" };
  }

  return {
    codes: normalizeUnique(meetingLanguageSet(room.sourceLanguage, room.targetLanguages)),
    source: "meeting-fallback",
  };
}

/**
 * Splits a picker's options into what can be READ (already exists — never filtered) and what can
 * additionally be GENERATED (generatable minus existing). Both lists are bare, deduped codes.
 *
 * Callers must not pass "as-spoken" here: `normalizeLanguageCode` would fold it to "as"
 * (Assamese). The "as spoken" option is always offered separately.
 */
export function artifactLanguageGroups(
  existing: readonly (string | null | undefined)[],
  generatable: readonly string[],
): { existing: string[]; generatable: string[] } {
  const existingCodes = normalizeUnique(existing);
  return {
    existing: existingCodes,
    generatable: normalizeUnique(generatable).filter((code) => !existingCodes.includes(code)),
  };
}

/** Whether new content may be generated in `code`. Compares normalized codes. */
export function canGenerateIn(
  code: string | null | undefined,
  generatable: readonly string[],
): boolean {
  const normalized = normalizeLanguageCode(code ?? undefined);
  return Boolean(normalized) && normalizeUnique(generatable).includes(normalized);
}
