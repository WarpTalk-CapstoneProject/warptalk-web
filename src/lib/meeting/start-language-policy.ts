/**
 * WT-708 — what Start says about the workspace's language whitelist.
 *
 * A meeting's languages (L2) are checked against the workspace whitelist (L1) when the room is
 * booked and when it is edited, and an admin can narrow L1 at any time after that. backend#511
 * makes Start (and re-Start of a running room) recompute L2 ∩ L1 and publish only that:
 *
 *   - Something survives: the room starts narrowed, and the Start response carries
 *     `languagePolicyNotice` ({ requested, effective, dropped, message }) — the host is the person
 *     looking at the screen at that moment, so this is where they are told.
 *   - No target survives: Start is refused with 403 FORBIDDEN and a sentence naming BOTH sets
 *     (TranslationRoomConstants.ErrorStartLanguagesNotAllowed).
 *
 * Both are read here, defensively, so every Start call site (room page, lobby, create dialog,
 * in-meeting Start, bridge controls) gets them through one hook rather than five catch blocks.
 *
 * Extensions on the imports on purpose: covered by a node --experimental-strip-types unit test.
 */
import { normalizeLanguageCode } from "../language/languages.ts";

export type RoomLanguagePolicyNotice = {
  /** L2 as booked — source plus targets, bare codes. */
  requested: string[];
  /** L2 ∩ L1 — what the meeting actually runs in. */
  effective: string[];
  /** L2 \ L1 — never empty when the notice is present. */
  dropped: string[];
  /** The server's own English sentence. */
  message: string;
};

function codeList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const codes = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeLanguageCode(item))
    .filter((code) => code.length > 0);
  return Array.from(new Set(codes));
}

/**
 * The notice off a Start response, or null when there is none (the common case: nothing was
 * narrowed) or when it is not the backend's shape. A notice with nothing dropped is not a notice.
 */
export function readLanguagePolicyNotice(room: unknown): RoomLanguagePolicyNotice | null {
  if (!room || typeof room !== "object") return null;
  const raw = (room as { languagePolicyNotice?: unknown }).languagePolicyNotice;
  if (!raw || typeof raw !== "object") return null;

  const notice = raw as Record<string, unknown>;
  const dropped = codeList(notice.dropped);
  if (!dropped || dropped.length === 0) return null;

  return {
    requested: codeList(notice.requested) ?? [],
    effective: codeList(notice.effective) ?? [],
    dropped,
    message: typeof notice.message === "string" ? notice.message : "",
  };
}

/** The two sets a refused Start names. */
export type StartLanguagesRefusal = {
  /** The meeting's own languages (L2). */
  meeting: string[];
  /** What the workspace allows now (L1). */
  allowed: string[];
};

// TranslationRoomConstants.ErrorStartLanguagesNotAllowed, verbatim up to the two lists:
// "This meeting's languages ({0}) are no longer allowed by your workspace, which now allows {1}. …"
const REFUSAL = /languages \(([^)]*)\) are no longer allowed by your workspace, which now allows ([^.]*)\./i;

function splitCodes(list: string): string[] {
  return list
    .split(",")
    .map((item) => normalizeLanguageCode(item.trim()))
    .filter((code) => code.length > 0);
}

/**
 * Whether a server sentence is Start's "no language left" refusal, and if so the two sets it
 * names. Matched on the backend's phrase, not on the status: a 403 from Start also means "not the
 * host" or "workspace out of credits", and those must keep their own sentences.
 */
export function readStartLanguagesRefusal(message: string | null | undefined): StartLanguagesRefusal | null {
  if (!message) return null;
  const match = REFUSAL.exec(message);
  if (!match) return null;
  const meeting = splitCodes(match[1]);
  if (meeting.length === 0) return null;
  return { meeting, allowed: splitCodes(match[2]) };
}

/**
 * The error a refused Start is rethrown as: the localized sentence as its message (what every
 * caller's `getErrorMessage(error, …)` shows for a non-axios Error), the original request failure
 * as its cause so nothing about the HTTP answer is lost.
 */
export class StartLanguagesRefusedError extends Error {
  readonly refusal: StartLanguagesRefusal;

  constructor(message: string, refusal: StartLanguagesRefusal, cause: unknown) {
    super(message, { cause });
    this.name = "StartLanguagesRefusedError";
    this.refusal = refusal;
  }
}
