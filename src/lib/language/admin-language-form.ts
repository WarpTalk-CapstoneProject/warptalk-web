/**
 * WT-691: the admin language catalog form — the same rules the server applies, run first in the
 * browser so a typo is caught before it becomes a 400. The server stays the authority.
 */

import { primarySubtag } from "./catalog-drift.ts";

const CODE = /^([A-Za-z]{2,3})(?:[-_]([A-Za-z]{2}))?$/;
export const MAX_LANGUAGE_NAME = 100;

/** "KO", "ko_kr", " ko-KR " → "ko" / "ko-KR"; null for anything the server would refuse. */
export function normalizeLanguageCode(raw: string): string | null {
  const match = CODE.exec(raw.trim());
  if (!match) return null;
  const language = match[1].toLowerCase();
  return match[2] ? `${language}-${match[2].toUpperCase()}` : language;
}

export type LanguageDraftError =
  | "codeInvalid"
  | "codeTaken"
  | "codeCovered"
  | "nameRequired"
  | "nameTooLong"
  | "nativeNameTooLong";

export interface LanguageDraft {
  code: string;
  name: string;
  nativeName: string;
}

/**
 * The first problem with a draft, or null. `existing` is the catalog: room validation matches on
 * the primary subtag, so "en-GB" beside "en-US" is the same language and is refused as covered.
 * `editing` skips the code checks — the code of an existing row never changes.
 */
export function validateLanguageDraft(
  draft: LanguageDraft,
  existing: { code: string }[],
  editing = false,
): { error: LanguageDraftError; coveredBy?: string } | null {
  if (!editing) {
    const code = normalizeLanguageCode(draft.code);
    if (!code) return { error: "codeInvalid" };
    const clash = existing.find((row) => primarySubtag(row.code) === primarySubtag(code));
    if (clash) {
      return clash.code.toLowerCase() === code.toLowerCase()
        ? { error: "codeTaken" }
        : { error: "codeCovered", coveredBy: clash.code };
    }
  }
  const name = draft.name.trim();
  if (!name) return { error: "nameRequired" };
  if (name.length > MAX_LANGUAGE_NAME) return { error: "nameTooLong" };
  if (draft.nativeName.trim().length > MAX_LANGUAGE_NAME) return { error: "nativeNameTooLong" };
  return null;
}

export type DisableDecision =
  /** A live meeting uses it: the server refuses. Say so instead of offering the button. */
  | { kind: "blocked"; live: number }
  /** Scheduled meetings use it: allowed, but only with an explicit confirmation. */
  | { kind: "confirm"; upcoming: number }
  /** The last enabled language: the server refuses — no room could be created at all. */
  | { kind: "last" }
  | { kind: "free" };

export function disableDecision(
  row: { isActive: boolean; liveMeetings?: number; upcomingMeetings?: number },
  activeCount: number,
): DisableDecision {
  const live = row.liveMeetings ?? 0;
  const upcoming = row.upcomingMeetings ?? 0;
  if (live > 0) return { kind: "blocked", live };
  if (row.isActive && activeCount <= 1) return { kind: "last" };
  if (upcoming > 0) return { kind: "confirm", upcoming };
  return { kind: "free" };
}
