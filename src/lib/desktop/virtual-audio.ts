/**
 * What the audio bridge panel says, and to whom.
 *
 * An EXTERNAL_BRIDGE meeting translates a call happening in someone else's app — Google Meet,
 * Zoom — by borrowing two virtual audio devices from the operating system. WarpTalk ships no
 * driver of its own on purpose: a macOS AudioServerPlugIn and a Windows WDM driver signed with an
 * EV certificate are not things this app can install for the user. So the devices come from
 * BlackHole, and the desktop app detects them (warptalk-desktop/src/main/virtual-audio.ts).
 *
 * TWO DEVICES, NOT ONE
 *
 * The bridge runs in both directions at the same time. WarpTalk writes the dubbed voice into the
 * OUTBOUND device and the user picks that as Meet's microphone; Meet writes the far side's audio
 * into the INBOUND device and WarpTalk reads it back out. A single device cannot serve both,
 * because whatever is written to it is what is read from it — the user's own dubbed voice would
 * loop straight back into the pipeline.
 *
 * WHY THIS MODULE IS PURE
 *
 * Four separate things have to agree: a heading, a status line, a per-device list, and an action.
 * Derived independently at their own call sites they drift — a green "ready" heading above a list
 * showing a missing device is worse than either alone. One function returns all of them.
 *
 * THREE ABSENCES THAT MEAN DIFFERENT THINGS
 *
 *   no bridge      a browser tab, or a desktop build too old to answer. We do not know.
 *   not supported  the desktop app has no detection for this platform (Windows, Linux today).
 *   not ready      we looked, and at least one device is not installed.
 *
 * Collapsing these would produce the worst possible sentence: telling somebody on Windows to
 * install a device that WarpTalk cannot yet detect there, or telling a browser user their audio
 * setup is broken when nothing was ever checked.
 */

import type { VirtualAudioDevice, VirtualAudioStatus } from "./bridge";

export type AudioBridgeState =
  /** Not running in the desktop app, or it could not answer. The panel renders nothing. */
  | "unavailable"
  /** Running in desktop, but this platform has no detection yet. */
  | "unsupported-platform"
  /** Both devices present. */
  | "ready"
  /** At least one device missing, and this platform can do something about it. */
  | "missing";

export interface AudioBridgeDeviceView {
  leg: "outbound" | "inbound";
  /** The exact string to look for in the other app's device picker. */
  deviceName: string;
  installed: boolean;
  /** Which slot this device goes in, phrased from inside Google Meet's settings. */
  role: string;
}

export interface AudioBridgeView {
  state: AudioBridgeState;
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

  if (!status.supported) {
    return {
      state: "unsupported-platform",
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
      heading: "Audio bridge ready",
      message:
        "Both virtual devices are installed. In your meeting app, pick them as shown below so " +
        "WarpTalk can hear the call and speak into it.",
      devices,
      action: null,
      foreignDrivers,
    };
  }

  const missing = devices.filter((device) => !device.installed).length;

  return {
    state: "missing",
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
