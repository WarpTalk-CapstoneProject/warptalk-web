/**
 * The desktop's verdict on this machine's bridge, read in ONE place.
 *
 * WHY THIS EXISTS
 *   The desktop main process already answers every question the bridge asks — is it ready, can
 *   voice mode run, can text-only mode run, can WarpTalk listen to the browser, which platform —
 *   and returns the answers from `bridge:virtual-audio-status`. The web app used to work the same
 *   answers out again from the raw device list, the capability bits and the user agent, at several
 *   call sites, and its answers could disagree with the desktop's. Now every caller asks here, and
 *   here the desktop's field wins whenever it is present.
 *
 * FALLBACKS
 *   A desktop build older than a field does not send it, so each answer keeps the old derivation
 *   behind it, marked `FALLBACK`. Every marker says which desktop build makes it dead code; delete
 *   it once no supported desktop release predates that build.
 *
 * THE TONE PROBE ONLY DOWNGRADES
 *   The wizard's tone probe is a real audio check (only the renderer can play through
 *   `setSinkId`), so it stays — but as a diagnostic. It may turn a desktop "ready" into "not
 *   working" (the desktop says the cable is there; the probe heard nothing), and it never turns a
 *   desktop "not ready" into "ready". See `bridgeDevicesReadyWithProbe`.
 *
 * Pure: types only, so the plain node test runner can load it.
 */

import type { VirtualAudioStatus } from "./bridge.ts";

export type BridgeVerdictPlatform = "windows" | "macos" | "other";

/** The platform the desktop reported. Never sniffed: `status.platform` is the main process's own. */
export function bridgePlatformOf(status: VirtualAudioStatus): BridgeVerdictPlatform {
  if (status.platform === "win32") return "windows";
  if (status.platform === "darwin") return "macos";
  return "other";
}

/** The outbound cable (VB-CABLE, or the Mac pair's outbound device) is installed. */
export function bridgeCableInstalled(status: VirtualAudioStatus): boolean {
  if (status.bridgeModes) return status.bridgeModes.voice?.cableInstalled === true;
  // FALLBACK — desktop builds before #45 send no `bridgeModes`. Delete with the other #45
  // fallbacks once every supported desktop release reports `bridgeModes`.
  return (status.devices ?? []).some((device) => device.leg === "outbound" && device.installed);
}

/** Voice mode can run: the cable is in AND the far side can come back (`voice.possible`). */
export function bridgeVoicePossible(status: VirtualAudioStatus): boolean {
  if (status.bridgeModes) return status.bridgeModes.voice?.possible === true;
  // FALLBACK — desktop before #45: voice was "the cable is there", the only mode that existed.
  return bridgeCableInstalled(status);
}

/** Text-only mode can run: the desktop says loopback works without a cable. */
export function bridgeTextOnlyPossible(status: VirtualAudioStatus): boolean {
  // No fallback needed: a desktop before #45 has no text-only capture at all (B2 refuses it).
  return status.bridgeModes?.textOnly?.possible === true;
}

/**
 * Whether WarpTalk can capture the far side from the browser (Windows per-process loopback), for
 * this user's mode.
 *
 * Desktop's reading: `textOnly.possible` is exactly "process loopback is usable" — the OS build
 * offers it AND the runtime is wired (desktop virtual-audio.ts, `loopbackUsable`). Text mode needs
 * nothing else. Voice mode's loopback start additionally requires VB-CABLE (B2), which is
 * `voice.cableInstalled`.
 */
export function bridgeLoopbackCapable(
  status: VirtualAudioStatus | null,
  options: { textOnly?: boolean } = {},
): boolean {
  if (!status) return false;
  const modes = status.bridgeModes;
  if (modes) {
    if (modes.textOnly?.possible !== true) return false;
    return options.textOnly ? true : modes.voice?.cableInstalled === true;
  }
  // FALLBACK — desktop before #45: re-derive from the capability bits. Text mode does not exist
  // there (its loopback refuses without the cable), so it is never promised. Delete with #45.
  if (options.textOnly) return false;
  return (
    status.supported === true
    && status.platform === "win32"
    && status.capabilities?.processLoopback === true
    && status.capabilities?.processLoopbackRuntime === "available"
    && bridgeCableInstalled(status)
  );
}

/** Whether a missing inbound device still leaves a working bridge on this machine. */
export function bridgeInboundOptional(status: VirtualAudioStatus): boolean {
  if (status.endpointLabels) return status.endpointLabels.inboundOptional === true;
  // FALLBACK — desktop builds before `endpointLabels` (feat/bridge-desktop-verdicts). Read from the
  // desktop's platform, never the user agent. Delete once every supported release sends the field.
  return status.platform === "win32";
}

/**
 * The desktop's answer to the wizard's step 1, "are the voice-mode devices installed", or null when
 * the desktop did not answer it (no status, or a build before #45) and the probe must decide.
 *
 * Voice possible, or — where the inbound device is optional (Windows) — the cable is in: the
 * outbound-only rung still runs, and the wizard then says what the inbound leg is missing.
 */
export function bridgeDevicesReady(status: VirtualAudioStatus | null): boolean | null {
  if (!status?.bridgeModes) return null;
  return (
    bridgeVoicePossible(status)
    || (bridgeCableInstalled(status) && bridgeInboundOptional(status))
  );
}

/** The parts of a tone-probe result this module reads (lib/audio/virtual-bridge-check). */
export interface BridgeProbeEvidence {
  probes: ReadonlyArray<{ present: boolean; carriesSignal: boolean | null; optional?: boolean }>;
  /** The probe's own verdict, used only when the desktop gave none. */
  ready: boolean;
  needsPermission: boolean;
}

/**
 * Whether the tone probe found a problem the desktop could not see: a device that is present but
 * carried nothing, a required device the renderer cannot find (so it cannot route to it either),
 * or no microphone permission (every label is blank, so nothing can be routed). A probe that could
 * not run at all (`error`, `carriesSignal: null`) is inconclusive and downgrades nothing.
 */
export function probeDowngrades(evidence: BridgeProbeEvidence): boolean {
  if (evidence.needsPermission) return true;
  return evidence.probes.some(
    (probe) => (probe.present && probe.carriesSignal === false) || (!probe.present && probe.optional !== true),
  );
}

/**
 * The wizard's "devices ready": the desktop's verdict, downgraded by the probe, never upgraded.
 * `probe` is null before the probe has run, which leaves the desktop's answer standing.
 */
export function bridgeDevicesReadyWithProbe(
  status: VirtualAudioStatus | null,
  probe: BridgeProbeEvidence | null,
): boolean {
  const desktop = bridgeDevicesReady(status);
  // FALLBACK — no desktop verdict: the probe is the only evidence, as before. Two cases: a
  // desktop before #45 (delete with the other #45 fallbacks) and no desktop at all (a browser
  // tab, which keeps this branch for good).
  if (desktop === null) return probe?.ready === true;
  if (!desktop) return false;
  return !(probe && probeDowngrades(probe));
}

/** Every verdict in one object, for callers that want several. */
export interface BridgeVerdict {
  platform: BridgeVerdictPlatform;
  /** `status.ready`: both legs of the full bridge are present. */
  ready: boolean;
  voicePossible: boolean;
  textOnlyPossible: boolean;
  cableInstalled: boolean;
  inboundOptional: boolean;
  /** Which answers came from the desktop rather than a fallback. */
  reported: { modes: boolean; endpointLabels: boolean };
}

/** Null without a status: "we did not look" is not "nothing works". */
export function readBridgeVerdict(status: VirtualAudioStatus | null): BridgeVerdict | null {
  if (!status) return null;
  return {
    platform: bridgePlatformOf(status),
    ready: status.ready === true,
    voicePossible: bridgeVoicePossible(status),
    textOnlyPossible: bridgeTextOnlyPossible(status),
    cableInstalled: bridgeCableInstalled(status),
    inboundOptional: bridgeInboundOptional(status),
    reported: { modes: Boolean(status.bridgeModes), endpointLabels: Boolean(status.endpointLabels) },
  };
}
