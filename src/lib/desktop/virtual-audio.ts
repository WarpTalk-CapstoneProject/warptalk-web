/**
 * What the audio bridge panel says, and to whom.
 *
 * An EXTERNAL_BRIDGE meeting translates a call happening in someone else's app — Google Meet,
 * Zoom — by borrowing two virtual audio devices from the operating system. WarpTalk ships no
 * driver of its own on purpose: a macOS AudioServerPlugIn and a Windows WDM driver signed with an
 * EV certificate are not things this app can install for the user. So the devices come from
 * BlackHole on macOS or VB-Audio on Windows, and the desktop app detects them
 * (warptalk-desktop/src/main/virtual-audio.ts).
 *
 * TWO LEGS, PLATFORM-SPECIFIC DEVICES
 *
 * The bridge runs in both directions at the same time. WarpTalk writes the dubbed voice into the
 * OUTBOUND device and the user picks that as Meet's microphone. macOS reads the far side back
 * from a second virtual device; Windows primary reads it through per-process loopback scoped to
 * the meeting app, so a second paid cable is not part of the path.
 *
 * WHY THIS MODULE IS PURE
 *
 * Four separate things have to agree: a heading, a status line, a per-device list, and an action.
 * Derived independently at their own call sites they drift — a green "ready" heading above a list
 * showing a missing device is worse than either alone. One function returns all of them.
 *
 * A LADDER, NOT A SWITCH
 *
 * Which of the two legs a machine can run varies, so an external-bridge meeting has four possible
 * shapes rather than one. They live as a table in ./bridge-tiers.ts and arrive on the view as
 * `tier`, alongside — not instead of — `state`: `state` is about what is missing and whether the
 * user can fix it, `tier` is about what will run if they start a meeting right now. A machine with
 * one of two devices installed is honestly both "still needs setup" and "already able to speak
 * into the meeting", and the panel says both.
 *
 * THREE ABSENCES THAT MEAN DIFFERENT THINGS
 *
 *   no bridge      a browser tab, or a desktop build too old to answer. We do not know.
 *   not supported  the desktop app has no detection for this platform.
 *   not ready      we looked, and at least one device is not installed.
 *
 * Collapsing these would produce the worst possible sentence: telling somebody on Windows to
 * install a device that WarpTalk cannot yet detect there, or telling a browser user their audio
 * setup is broken when nothing was ever checked.
 */

// Explicit extension: this module is exercised by `node --test --experimental-strip-types`, which
// does no extension resolution. Matches the other runtime-imported modules under src/lib.
import { selectBridgeTier, type BridgeTier } from "./bridge-tiers.ts";
import type { VirtualAudioDevice, VirtualAudioStatus } from "./bridge";

export type AudioBridgeState =
  /** Not running in the desktop app, or it could not answer. The panel renders nothing. */
  | "unavailable"
  /** Running in desktop, but this platform has no detection yet. */
  | "unsupported-platform"
  /** Both devices present. */
  | "ready"
  /** The mixer/driver is installed, but the engine control leg is not running yet. */
  | "installed-not-running"
  /** The outbound leg can run, but inbound still needs the Windows loopback leg. */
  | "outbound-only"
  /** A driver exists, but this machine cannot run the Windows audio bridge path yet. */
  | "caption-only"
  /** At least one device missing, and this platform can do something about it. */
  | "missing";

export interface AudioBridgeDeviceView {
  leg: "outbound" | "inbound";
  /** The exact string to look for in the other app's device picker. */
  deviceName: string;
  installed: boolean;
  providerName?: string;
  providerRole?: "primary" | "backup";
  /** Which slot this device goes in, phrased from inside Google Meet's settings. */
  role: string;
}

export interface AudioBridgeView {
  state: AudioBridgeState;
  /**
   * The rung of the fallback ladder this machine will actually run on, or null when nothing was
   * checked. See lib/desktop/bridge-tiers.ts.
   *
   * Deliberately NOT the same axis as `state`. `state` answers "what is missing and can the user
   * fix it"; `tier` answers "what happens if they start a bridge meeting right now". They differ
   * exactly where it matters most: a machine with one of two devices installed is `missing` — it
   * still has a full bridge to set up — and at the same time is already able to run rung 3. Fusing
   * them would force a choice between hiding the setup step and hiding what is running.
   */
  tier: BridgeTier | null;
  heading: string;
  /** One sentence under the heading, or null when the panel is not shown. */
  message: string | null;
  devices: AudioBridgeDeviceView[];
  /** Label for the install button, or null when there is nothing to press. */
  action: string | null;
  /** Other applications' virtual drivers, named so support conversations can end. */
  foreignDrivers: string[];
}

const EMPTY: AudioBridgeView = {
  state: "unavailable",
  tier: null,
  heading: "",
  message: null,
  devices: [],
  action: null,
  foreignDrivers: [],
};

/**
 * Which slot each leg occupies in the OTHER app's settings.
 *
 * Deliberately written from the user's side of the screen. `outbound` is WarpTalk's word for
 * "audio leaving WarpTalk", but the person is sitting in Google Meet's settings dialog looking
 * for a microphone, and "outbound" is not a label on anything they can see.
 */
const ROLE: Record<AudioBridgeDeviceView["leg"], string> = {
  outbound: "Choose as the microphone in your meeting app",
  inbound: "Choose as the speaker in your meeting app",
};

function toDeviceView(device: VirtualAudioDevice): AudioBridgeDeviceView {
  return {
    leg: device.leg,
    deviceName: device.deviceName,
    installed: device.installed,
    providerName: device.providerName,
    providerRole: device.providerRole,
    role: ROLE[device.leg],
  };
}

/**
 * Everything the audio bridge panel needs, from one status reading.
 *
 * `status` is null when there was no answer — see the three absences above.
 */
export function describeAudioBridge(status: VirtualAudioStatus | null): AudioBridgeView {
  if (!status) return EMPTY;

  const devices = (status.devices ?? []).map(toDeviceView);
  const foreignDrivers = status.foreignDrivers ?? [];
  // Chosen once, from the table, and carried into every branch below. Deriving it per branch is
  // how the heading and the thing that actually runs drift apart.
  const tier = selectBridgeTier(status);

  if (!status.supported) {
    return {
      state: "unsupported-platform",
      tier,
      heading: "Audio bridge not available on this system yet",
      // Names the platform gap rather than implying the user did something wrong, and does not
      // suggest an install: there is nothing WarpTalk can detect here even after one.
      message:
        "Translating a meeting in another app needs two virtual audio devices. WarpTalk can set " +
        "those up on macOS today; support for this system is still being built. Meetings held in " +
        "WarpTalk itself are unaffected.",
      devices: [],
      action: null,
      foreignDrivers,
    };
  }

  // `ready` comes from the desktop app, which computes it over the devices it actually checked.
  // Recomputing it here from `devices` would silently disagree the day the desktop app starts
  // reporting a device this build does not render.
  if (status.ready) {
    return {
      state: "ready",
      tier,
      heading: "Audio bridge ready",
      message:
        "Both virtual devices are installed. In your meeting app, pick them as shown below so " +
        "WarpTalk can hear the call and speak into it.",
      devices,
      action: null,
      foreignDrivers,
    };
  }

  // Keyed off the ladder rather than re-reading the capability flags: the rung's own predicate is
  // the single place that decides whether this machine can speak into the meeting. Scoped to
  // Windows because on macOS a not-ready bridge is a half-finished BlackHole install, and the
  // honest thing to show there is still the setup step.
  if (status.platform === "win32" && tier?.id === "outbound-only") {
    return {
      state: "outbound-only",
      tier,
      heading: "Audio bridge can speak into the meeting",
      // Says the loss out loud. Half a bridge that nobody was told about is the failure this
      // whole ladder exists to prevent, and "we found a cable" on its own reads as success.
      message:
        "Windows found the virtual cable WarpTalk plays into, so it can translate what you say " +
        "and send it to the meeting app. The other side is not translated yet — hearing the " +
        "meeting back through per-process loopback is the next bridge step. Captions and " +
        "WarpTalk-native meetings still work now.",
      devices,
      action: null,
      foreignDrivers,
    };
  }

  if (
    status.platform === "win32" &&
    status.bridgeMode === "caption-only" &&
    status.capabilities?.processLoopback === false &&
    devices.some((device) => device.providerRole === "primary" && device.installed)
  ) {
    return {
      state: "caption-only",
      tier,
      heading: "Audio bridge needs Windows process loopback",
      message:
        "VB-CABLE is installed, but this Windows build cannot use process loopback to capture " +
        "only the meeting app yet, and the cable on its own is not usable here. Live captions " +
        "still work, and so does a WarpTalk-native meeting.",
      devices,
      action: null,
      foreignDrivers,
    };
  }

  if (status.bridgeMode === "installed-not-running") {
    return {
      state: "installed-not-running",
      tier,
      heading: "Audio bridge engine is not running",
      message:
        "Voicemeeter is installed, but WarpTalk cannot use it until the Windows engine " +
        "lifecycle is wired. Use captions or a WarpTalk-native meeting for now.",
      devices,
      action: null,
      foreignDrivers,
    };
  }

  const missing = devices.filter((device) => !device.installed).length;

  return {
    state: "missing",
    tier,
    heading: "Audio bridge needs setup",
    // Says how many are missing, because the half-installed case is common and confusing: one
    // device present looks like success in the system sound settings, and the meeting then fails
    // in exactly one direction.
    message:
      missing === devices.length
        ? "Translating a meeting in another app needs two virtual audio devices. Neither is " +
          "installed yet."
        : `One of the two virtual audio devices is missing, so audio would only work in one ` +
          `direction. WarpTalk needs both.`,
    devices,
    action: "Set up audio bridge",
    foreignDrivers,
  };
}

/**
 * Whether the panel should appear at all.
 *
 * Kept separate so a caller can decide placement without reading the whole view, and so the
 * browser case stays a single obvious check rather than a truthiness test on a heading string.
 */
export function shouldShowAudioBridge(view: AudioBridgeView): boolean {
  return view.state !== "unavailable";
}

/**
 * What the user has to agree to before WarpTalk listens to their meeting on Windows.
 *
 * Written here, and tested, because the wording is the whole control. Windows can only scope a
 * capture to a process tree, so picking the meeting window does NOT narrow it to that window: every
 * other tab making sound in the same browser is captured too, and reaches the pipeline as if the
 * far side had said it. Measured, not assumed — two tabs playing different tones both arrived at
 * identical amplitude.
 *
 * A picker that says "choose your meeting window" and then takes the browser is asking for consent
 * to one thing and doing another. So the ask names the real scope, and names the one action that
 * actually helps: mute the other tabs. There is no flag that fixes this; only capturing from inside
 * the browser would, which is a different design.
 */
export const WINDOWS_CAPTURE_CONSENT = {
  title: "WarpTalk needs to listen to your browser",
  body:
    "To translate the other side of your meeting, WarpTalk listens to everything the chosen " +
    "browser is playing — not just the meeting tab. Anything else making sound in that browser, " +
    "like music or a video in another tab, is heard too and may end up in the transcript.",
  action: "Mute your other tabs before you start.",
  confirm: "Listen to this browser",
  decline: "Not now",
} as const;
