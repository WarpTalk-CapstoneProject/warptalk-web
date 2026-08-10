/**
 * The IANA time zones this app offers, read from the platform rather than listed by hand.
 *
 * The workspace setting used to be a four-item dropdown — UTC, Asia/Ho_Chi_Minh, Asia/Tokyo,
 * America/New_York — which is not a short list so much as a guess about where customers are.
 * A workspace in Singapore, Sydney or Berlin had no way to say so, and the nearest wrong
 * answer silently shifts every scheduled meeting the workspace books.
 *
 * `Intl.supportedValuesOf` is ES2022 and present in every browser this app supports, but it is
 * absent in older runtimes and in some server contexts, so the fallback is a real list rather
 * than an empty one — losing the picker entirely would be worse than offering a short one.
 */

/** Kept only for the fallback path. Deliberately spread across regions, not around one office. */
const FALLBACK_ZONES = [
  "UTC",
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];

/**
 * The platform's canonical id for a zone, or null if it does not recognise it.
 *
 * IANA carries Links as well as Zones — two names for one place — and platforms disagree on
 * which is canonical. This one answers `Asia/Saigon` for `Asia/Ho_Chi_Minh`, and its zone list
 * contains only the former. That matters because the accounts database defaults every user to
 * `Asia/Ho_Chi_Minh`, so a picker built from the platform list would not contain the value
 * almost every account already holds, and would render as though nothing were selected.
 */
export function canonicalTimeZone(zone: string): string | null {
  if (!zone) return null;
  try {
    return Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Whether two zone ids name the same place, across Zone/Link spellings. */
export function isSameTimeZone(a: string, b: string): boolean {
  if (a === b) return true;
  const canonicalA = canonicalTimeZone(a);
  return canonicalA !== null && canonicalA === canonicalTimeZone(b);
}

/**
 * Every offerable zone, with `include` guaranteed present.
 *
 * `include` is the value already stored for this workspace or user. It is added when the
 * platform's list does not carry that spelling, so an existing setting is never silently
 * dropped from the control that edits it.
 */
export function supportedTimeZones(include?: string | null): string[] {
  let zones: string[] = FALLBACK_ZONES;

  try {
    const intl = Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    };
    const platformZones = intl.supportedValuesOf?.("timeZone");
    if (platformZones && platformZones.length > 0) zones = platformZones;
  } catch {
    // fall through to the fallback list
  }

  // UTC is not in the IANA list on every platform, and it is the one entry a workspace that
  // spans zones actually wants.
  const withUtc = zones.includes("UTC") ? zones : ["UTC", ...zones];

  if (!include) return withUtc;
  const alreadyOffered = withUtc.some((zone) => isSameTimeZone(zone, include));
  return alreadyOffered ? withUtc : [include, ...withUtc];
}

/**
 * The browser's own zone, or null when the platform cannot say.
 *
 * Null rather than a guess: a caller that needs a default can pick one knowing it is picking,
 * where a returned "Asia/Ho_Chi_Minh" is indistinguishable from a detected one and quietly
 * schedules a host in Berlin seven hours off.
 */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * "Asia/Ho_Chi_Minh (UTC+07:00)" — the offset comes from the zone and the given instant, so a
 * zone that observes DST reads correctly in summer and in winter. Hardcoding "(+7)" beside a
 * label, as the old dropdown did for its four entries, is wrong for half the year in any zone
 * that shifts.
 */
export function describeTimeZone(zone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value;
    return offset ? `${zone.replace(/_/g, " ")} (${offset})` : zone.replace(/_/g, " ");
  } catch {
    return zone.replace(/_/g, " ");
  }
}
