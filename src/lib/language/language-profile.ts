/**
 * What languages to assume for somebody joining a meeting, and whether to ask at all.
 *
 * The picker opened on every join and started from the room's defaults, so the same person
 * answered the same question every time and their answer was thrown away when they left.
 * `defaultSpeakLanguage` and `defaultListenLanguage` have existed on user settings the whole
 * time; nothing read them and nothing wrote them.
 *
 * ON IP GEOLOCATION
 *   The request was to guess from the IP address. The browser's own language list is both
 *   more accurate and cheaper: a Vietnamese speaker in Singapore has `vi` at the top of
 *   navigator.languages and a Singaporean IP, and only one of those two facts is about them.
 *   IP tells you where a packet came from; the locale list is the user's own declaration.
 *   So the locale is used, and no IP lookup is made.
 *
 * Pure so the ranking can be tested without a meeting.
 */

export type LanguageProfileSuggestion = {
  speak: string;
  listen: string;
  /** Which signal decided `speak`. Shown to nobody; useful when this is wrong in the wild. */
  source: "settings" | "history" | "locale" | "room";
};

export type LanguageProfileSignals = {
  /** What the user last confirmed, from their account settings. */
  settingsSpeak?: string | null;
  settingsListen?: string | null;
  /** Speak languages this user chose in past meetings, most recent first. */
  historySpeak?: readonly string[];
  /** navigator.languages, most preferred first. */
  locales?: readonly string[];
  /** The room's own defaults — the last resort, and what the picker used to start from. */
  roomSpeak?: string | null;
  roomListen?: string | null;
  /** Language codes the room actually offers. An unavailable suggestion is worse than none. */
  available: readonly string[];
};

/** "vi-VN" and "VI" are the same language as far as a picker is concerned. */
export function normalizeLanguage(value: string | null | undefined): string | null {
  const base = (value ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return base || null;
}

function firstAvailable(
  candidates: readonly (string | null | undefined)[],
  available: readonly string[],
): string | null {
  const offered = new Set(
    available.map((code) => normalizeLanguage(code)).filter(Boolean) as string[],
  );
  for (const candidate of candidates) {
    const code = normalizeLanguage(candidate);
    if (code && (offered.size === 0 || offered.has(code))) return code;
  }
  return null;
}

/** The language this user picked most often, ties broken by whichever was most recent. */
export function mostChosen(history: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const entry of history) {
    const code = normalizeLanguage(entry);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best: string | null = null;
  let bestCount = 0;
  // history is most-recent-first, so iterating it (not the map) makes recency the tiebreak.
  for (const entry of history) {
    const code = normalizeLanguage(entry);
    if (!code) continue;
    const count = counts.get(code) ?? 0;
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

export function suggestLanguageProfile(
  signals: LanguageProfileSignals,
): LanguageProfileSuggestion {
  const {
    settingsSpeak,
    settingsListen,
    historySpeak = [],
    locales = [],
    roomSpeak,
    roomListen,
    available,
  } = signals;

  const historyBest = mostChosen(historySpeak);

  // Order is deliberate. A setting is a decision this person made on purpose; history is a
  // pattern they did not necessarily intend; a locale is a guess about them; the room's
  // default is not about them at all.
  const speakBySettings = firstAvailable([settingsSpeak], available);
  const speakByHistory = firstAvailable([historyBest], available);
  const speakByLocale = firstAvailable(locales, available);
  const speakByRoom = firstAvailable([roomSpeak, available[0]], available);

  const speak = speakBySettings ?? speakByHistory ?? speakByLocale ?? speakByRoom ?? "en";
  const source: LanguageProfileSuggestion["source"] = speakBySettings
    ? "settings"
    : speakByHistory
      ? "history"
      : speakByLocale
        ? "locale"
        : "room";

  // Listen follows speak unless this user has said otherwise ON PURPOSE.
  //
  // This used to end with "pick anything BUT their speak language", on the reasoning that
  // "defaulting both to Vietnamese for a Vietnamese speaker would turn translation off without
  // being asked". That reasoning reads listen==speak as "no translation", which is only true
  // between two people who share a language: a Vietnamese speaker whose listen language is
  // Vietnamese still has everyone ELSE translated into Vietnamese for them. Nothing is turned
  // off; that is the product working.
  //
  // What it actually did was manufacture a split — silently, on join, before anybody touched a
  // control — for every user with no stored listen preference. That is the third of three places
  // that produced a pair nobody chose (the other two: the room default in
  // participant-language-preference.ts, and the two-question join modal), and it is the one that
  // fired without any UI at all. A suggestion is allowed to guess; it is not allowed to guess a
  // configuration the pickers can no longer express.
  //
  // `roomListen` is deliberately NOT consulted any more, for the same reason: it is a property of
  // the room, not of this person. Only `settingsListen` — which is written by their own confirmed
  // pick — can still separate the two.
  const listen = firstAvailable([settingsListen], available) ?? speak;

  return { speak, listen, source };
}

/**
 * Whether to interrupt the join with the picker.
 *
 * Only when the user has never told us. A remembered answer is applied silently — being asked
 * again is the product forgetting, and the complaint that started this.
 */
export function shouldAskForLanguages(signals: {
  settingsSpeak?: string | null;
  settingsListen?: string | null;
}): boolean {
  return !normalizeLanguage(signals.settingsSpeak) || !normalizeLanguage(signals.settingsListen);
}
