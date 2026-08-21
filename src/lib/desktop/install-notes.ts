/**
 * What a download page visitor is told when the operating system is about to refuse the file.
 *
 * Neither desktop artifact opens on a clean machine today, and both refusals name the app rather
 * than the missing signature — "WarpTalk is damaged", "Windows protected your PC" — so a visitor
 * with no note on the page concludes the app is broken, not unsigned. That is how the v0.3.2
 * macOS build was reported.
 *
 * The two halves are NOT symmetric, and that asymmetry is the reason this file exists instead of
 * two blocks of JSX:
 *
 *   macOS is temporary. warptalk-desktop PR #14 wired Developer ID signing and notarization; it
 *   activates the moment five repo secrets are added, and from that release the app opens on a
 *   plain double click. A note that outlives its cause is worse than no note — it tells people to
 *   expect a dialog they will never see and makes the download look sketchier than it is. So the
 *   macOS half is gated on MAC_NOTARIZED_FROM_VERSION below and deletes itself.
 *
 *   Windows is permanent. The installer carries no Authenticode signature at all (verified on the
 *   published v0.3.3 artifact: PE certificate table offset=0, size=0), but signing it would not
 *   end the warning either. Microsoft's own code-signing-options guidance is that OV and EV
 *   certificates alike now build SmartScreen reputation only over time; EV's instant bypass was
 *   removed in 2024. There is no version of WarpTalk where a fresh release stops warning, so the
 *   Windows half is written to be read for years, with no "yet" in it.
 *
 * Deliberately absent from both: `xattr -dr com.apple.quarantine`. It works, and it is in
 * warptalk-desktop/README.md for the team, but a public download page must not teach visitors to
 * disarm Gatekeeper by pasting shell commands at it. Open Anyway is one click more and leaves the
 * check on. `scripts/check-desktop-download-contract.mjs` fails the build if it ever appears here.
 *
 * No imports on purpose: the contract test runs this file under bare `node --experimental-strip-types`,
 * which has no bundler and cannot resolve `@/` paths.
 */

export type InstallNotePlatform = "mac" | "windows";

export interface InstallNote {
  platform: InstallNotePlatform;
  title: string;
  /** One sentence naming the cause, so the steps do not read as an apology. */
  summary: string;
  steps: string[];
  /** The honest limit of the steps above: what they do not fix, or what they do not turn off. */
  footnote: string;
  /** Optional way out when the steps cannot work at all. */
  link?: { label: string; href: string };
}

/**
 * The first desktop version that opens without a prompt on macOS, or null while none does.
 *
 * SETTING THIS IS THE WHOLE REMOVAL PROCEDURE. When a notarized build ships — the release whose
 * `spctl` verdict is `source=Notarized Developer ID` — put its version here and the macOS note
 * disappears from the page for that release and every later one, with no other edit. Until then it
 * stays null, which is the state that shows the note.
 *
 * Left as a version rather than a boolean because /download always describes ONE release. Flipping
 * a boolean the day notarization is switched on would strip the note from a page still offering
 * the previous, unnotarized build for however long it takes to cut the next one.
 */
export const MAC_NOTARIZED_FROM_VERSION: string | null = null;

/**
 * Semver-ish ordering, enough for the `0.3.3` / `1.0.0-beta.2` tags electron-builder produces.
 * Negative when `a` sorts first. A prerelease sorts before the release it leads to, so a
 * `1.0.0-rc.1` build does not inherit the "notarized from 1.0.0" promise.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (raw: string) => {
    const cleaned = raw.trim().replace(/^v/i, "");
    const [core = "", prerelease = ""] = cleaned.split("-", 2);
    const numbers = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
    return { numbers, prerelease };
  };

  const left = parse(a);
  const right = parse(b);

  const length = Math.max(left.numbers.length, right.numbers.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }

  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * Semver's dot-separated identifier rule, which a plain string compare gets backwards: `beta.10`
 * is a later build than `beta.2` but sorts before it alphabetically.
 */
function comparePrerelease(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const one = left[index];
    const other = right[index];
    if (one === undefined) return -1;
    if (other === undefined) return 1;
    if (one === other) continue;

    const oneIsNumeric = /^\d+$/.test(one);
    const otherIsNumeric = /^\d+$/.test(other);
    if (oneIsNumeric && otherIsNumeric) {
      return Number(one) < Number(other) ? -1 : 1;
    }
    // A numeric identifier always ranks below an alphanumeric one.
    if (oneIsNumeric !== otherIsNumeric) return oneIsNumeric ? -1 : 1;
    return one < other ? -1 : 1;
  }

  return 0;
}

/** Whether `version` is a build macOS opens on its own, i.e. one that needs no note. */
export function macBuildIsNotarized(version: string | null | undefined): boolean {
  if (!MAC_NOTARIZED_FROM_VERSION) return false;
  if (!version) return false;
  return compareVersions(version, MAC_NOTARIZED_FROM_VERSION) >= 0;
}

const MAC_NOTE: InstallNote = {
  platform: "mac",
  title: "First launch on macOS",
  summary:
    "WarpTalk is signed, but not notarized by Apple yet, so macOS asks you to confirm the first time you open it.",
  steps: [
    "Open the .dmg and drag WarpTalk into your Applications folder.",
    "Open WarpTalk from Applications. macOS says it could not verify the app is free of malware — click Done.",
    "Open System Settings › Privacy & Security, scroll down to Security, and click Open Anyway next to the message about WarpTalk. It appears there for about an hour after step 2.",
    "Confirm with Touch ID or your password, then choose Open Anyway once more. macOS asks only this once; updates open normally afterwards.",
  ],
  footnote:
    "Gatekeeper stays on throughout — you are approving this one app, not turning the check off.",
};

const WINDOWS_NOTE: InstallNote = {
  platform: "windows",
  title: "Installing on Windows",
  summary:
    "The installer carries no code-signing certificate, so SmartScreen warns about it. Expect this on new releases, not only the first one.",
  steps: [
    "Run the WarpTalk Setup .exe. Windows shows a blue “Windows protected your PC” screen.",
    "Click More info, just under that message.",
    "Click Run anyway, then continue through the installer as usual.",
  ],
  footnote:
    "On a PC managed by your workplace or school, SmartScreen can block the file outright with no Run anyway button. Nothing on this page gets past that — ask whoever administers the machine, or run WarpTalk in your browser instead.",
  link: { label: "Open WarpTalk in the browser", href: "/login" },
};

/**
 * The notes to render beside the download links, in platform order, for the release on offer.
 *
 * Keyed off the assets actually published rather than off the visitor's OS: /download lists every
 * platform to everyone and is server-rendered, so guessing the OS here would either flash the
 * wrong instructions or leave a Mac user reading Windows steps for the build they just clicked.
 * A platform with nothing to download gets no note.
 */
export function buildInstallNotes(release: {
  version: string | null;
  hasMacAsset: boolean;
  hasWindowsAsset: boolean;
}): InstallNote[] {
  const notes: InstallNote[] = [];
  if (release.hasMacAsset && !macBuildIsNotarized(release.version)) notes.push(MAC_NOTE);
  if (release.hasWindowsAsset) notes.push(WINDOWS_NOTE);
  return notes;
}
