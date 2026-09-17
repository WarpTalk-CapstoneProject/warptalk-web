/**
 * A readable name for a session's device, from the User-Agent the server stored.
 *
 * Deliberately small: browser family and OS, in the order a person would say them ("Chrome on
 * macOS"). Order matters inside each list — Edge and Opera carry "Chrome" in their UA, and Chrome
 * carries "Safari" — so the more specific token is tested first. Anything unrecognised falls back
 * to the raw string rather than guessing, and an empty value says so.
 */

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/WarpTalk|Electron/i, "WarpTalk desktop"],
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

export interface SessionDeviceDescription {
  /** "Chrome on macOS", or the raw value when it could not be read. */
  label: string;
  /** Whether the label is a phone or tablet, for the icon. */
  mobile: boolean;
}

export function describeSessionDevice(userAgent: string | null | undefined): SessionDeviceDescription {
  const raw = (userAgent ?? "").trim();
  if (!raw) return { label: "Unknown device", mobile: false };

  const browser = BROWSERS.find(([pattern]) => pattern.test(raw))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(raw))?.[1];
  const mobile = system === "iPhone" || system === "iPad" || system === "Android" || /Mobile/.test(raw);

  if (browser && system) return { label: `${browser} on ${system}`, mobile };
  if (browser || system) return { label: (browser ?? system)!, mobile };
  return { label: raw.length > 60 ? `${raw.slice(0, 57)}...` : raw, mobile };
}
