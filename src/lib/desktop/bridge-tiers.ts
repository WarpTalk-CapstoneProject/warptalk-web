/**
 * The fallback ladder for an external-bridge meeting, as a table rather than a branch.
 *
 * Translating a meeting held in Google Meet needs virtual audio devices WarpTalk cannot install
 * for the user, so on any given machine some of the bridge works and some of it does not. That is
 * four distinct products, not one product with a failure:
 *
 *   1  full-bridge       two virtual devices. Both sides are translated.
 *   2  loopback-bridge   one virtual device out, Windows per-process loopback back in. Both sides.
 *   3  outbound-only     one virtual device out, nothing back in. Only the user is translated.
 *   4  caption-only      no driver at all. Nothing is played into the meeting; a floating
 *                        transcript window is all there is.
 *
 * WHY A TABLE
 *   The same four facts — can we speak into the meeting, can we hear it back, does it need a
 *   driver, what does the user lose — were being re-derived at every call site that cared, and a
 *   heading, a status line and an actual audio route can disagree without anything crashing. Here
 *   each rung states its own preconditions and its own losses once, and `selectBridgeTier` just
 *   walks the list top down. Adding a rung means adding a row.
 *
 * WHY THERE IS ALWAYS AN ANSWER
 *   Rung 4 has no precondition. Before this existed, a Windows user without a driver was shown a
 *   setup prompt and given nothing at all — the meeting simply could not be translated. Captions
 *   need no driver, so there is no machine that has to be turned away; the ladder bottoms out at
 *   something rather than at nothing.
 *
 * PURE, LIKE ITS NEIGHBOUR
 *   No IPC, no DOM, no clock. Everything here is a function of one `VirtualAudioStatus` reading,
 *   which is what makes the whole ladder testable without a desktop build. The code that actually
 *   opens a device or a window lives in lib/audio/bridge-fallback-runtime.ts.
 */

import type { VirtualAudioStatus } from "./bridge";

export type BridgeTierId = "full-bridge" | "loopback-bridge" | "outbound-only" | "caption-only";

export interface BridgeTier {
  id: BridgeTierId;
  /** 1 is the most capable. Lower number wins, which is what "highest available" means here. */
  rank: 1 | 2 | 3 | 4;
  /** Name shown to the user. Never says "outbound" or "inbound" — those are not on their screen. */
  label: string;
  /** One sentence saying what this rung actually does, in the second person. */
  summary: string;
  /**
   * What the user does NOT get, relative to a full bridge. Empty on the rungs that lose nothing.
   *
   * This is the honest half and it is data for a reason: a rung that silently ran one step worse
   * than the user believed would be the exact failure this ladder was built to prevent. Anything
   * that renders a tier is expected to render these.
   */
  losses: string[];
  /** The dubbed voice reaches the meeting app. */
  speaksIntoMeeting: boolean;
  /** The far side's speech reaches WarpTalk and gets translated. */
  hearsFarSide: boolean;
  /** Whether this rung needs a virtual audio device installed at all. */
  needsVirtualDevice: boolean;
  /**
   * Whether this machine can run this rung, given one status reading.
   *
   * Only ever consulted for a status that is present and `supported`; the two absences are
   * decided before the ladder is walked, because "we did not look" is not a rung.
   */
  isAvailable: (status: VirtualAudioStatus) => boolean;
}

/** Is there a device installed for the leg WarpTalk plays the dub into? */
function hasInstalledOutboundDevice(status: VirtualAudioStatus): boolean {
  return (status.devices ?? []).some((device) => device.leg === "outbound" && device.installed);
}

/**
 * Can WarpTalk hear Meet by listening to the browser itself (Windows per-process loopback)?
 *
 * Rung 2's predicate, named so the inbound source decision below can ask it without going through
 * `selectBridgeTier` — which answers "full-bridge" on any machine with both cables and so used to
 * hide a perfectly good loopback path behind the cable. VB-CABLE stays a condition on purpose: the
 * loopback path only carries the far side IN, and a bridge that hears Meet but cannot speak into
 * it is not the product this rung promises.
 *
 * Capability and runtime are two claims. `processLoopback` says this Windows build could do it
 * (build 20348 and later); `processLoopbackRuntime` says the capture is actually wired. Treating
 * the first as the second is how a path gets selected that then produces silence.
 */
export function canCaptureBrowserLoopback(status: VirtualAudioStatus | null): boolean {
  return Boolean(
    status
      && status.supported
      && status.platform === "win32"
      && status.capabilities?.processLoopback === true
      && status.capabilities?.processLoopbackRuntime === "available"
      && hasInstalledOutboundDevice(status),
  );
}

/**
 * The rungs, most capable first.
 *
 * Each predicate is deliberately conservative in the same direction: when the desktop app says
 * nothing about a capability, the rung is allowed; when it says `false`, the rung is refused. An
 * older desktop build omitting `capabilities` therefore still gets rungs 3 and 4, while a build
 * that has actually looked and reported a limitation is believed.
 */
export const BRIDGE_TIERS: readonly BridgeTier[] = [
  {
    id: "full-bridge",
    rank: 1,
    label: "Full two-way translation",
    summary:
      "Your speech reaches the meeting in their language, and what they say reaches you in yours.",
    losses: [],
    speaksIntoMeeting: true,
    hearsFarSide: true,
    needsVirtualDevice: true,
    // Readiness is the desktop app's own verdict over the devices it actually checked. Recomputing
    // it from the device list would disagree the day it starts reporting a device this build does
    // not render, and it would disagree by claiming MORE than the app is willing to claim.
    isAvailable: (status) => status.ready === true,
  },
  {
    id: "loopback-bridge",
    rank: 2,
    label: "Two-way translation",
    summary:
      "Your speech reaches the meeting in their language, and WarpTalk listens to the meeting app " +
      "directly to translate what they say.",
    losses: [],
    speaksIntoMeeting: true,
    hearsFarSide: true,
    needsVirtualDevice: true,
    // See canCaptureBrowserLoopback: one predicate, so the rung and the inbound source decision
    // cannot drift apart on what "loopback works here" means.
    isAvailable: (status) => canCaptureBrowserLoopback(status),
  },
  {
    id: "outbound-only",
    rank: 3,
    label: "You are translated into the meeting",
    summary:
      "WarpTalk translates what you say and plays it into the meeting through the virtual " +
      "microphone. One free virtual cable is all this needs.",
    losses: [
      "The other side is not translated — you hear them in their own language, exactly as you do now.",
      "The live transcript covers only what you say, because the meeting's own audio never reaches WarpTalk.",
    ],
    speaksIntoMeeting: true,
    hearsFarSide: false,
    needsVirtualDevice: true,
    isAvailable: (status) =>
      hasInstalledOutboundDevice(status)
      // An explicit `false` is the desktop app saying it looked and this path will not carry audio
      // — an exclusive-mode lock, a cable present but unusable. Believed over our own optimism.
      && status.capabilities?.outboundOnly !== false
      // Voicemeeter's endpoints exist as devices whether or not the mixer is running, and audio
      // written into a stopped mixer goes nowhere at all. Installed is not running.
      && status.bridgeMode !== "installed-not-running",
  },
  {
    id: "caption-only",
    rank: 4,
    label: "Live captions only",
    summary:
      "WarpTalk shows a live transcript in a small window you can keep beside the meeting. No " +
      "driver needed.",
    losses: [
      "Nothing is played into the meeting — the other side hears only your own voice, untranslated.",
      "The other side is not translated, and the transcript covers only what you say.",
    ],
    speaksIntoMeeting: false,
    hearsFarSide: false,
    needsVirtualDevice: false,
    // No precondition, on purpose. See "WHY THERE IS ALWAYS AN ANSWER" above.
    isAvailable: () => true,
  },
] as const;

export function findBridgeTier(id: BridgeTierId): BridgeTier {
  const tier = BRIDGE_TIERS.find((candidate) => candidate.id === id);
  if (!tier) throw new Error(`Unknown bridge tier: ${id}`);
  return tier;
}

/**
 * The best rung this machine can actually run, or null when we have no reading to judge by.
 *
 * Null is NOT "caption-only". A browser tab, or a desktop build too old to answer, has told us
 * nothing — and the transcript window it would take to run captions is itself a desktop feature.
 * Promoting silence to a rung would put a floating window offer in front of every browser user.
 *
 * An unsupported platform is different: we are in the desktop app, it answered, and it said it has
 * no device detection here. Captions need no device, so that machine lands on rung 4 rather than
 * on nothing — which is the entire point of the ladder.
 */
export function selectBridgeTier(status: VirtualAudioStatus | null): BridgeTier | null {
  if (!status) return null;
  if (!status.supported) return findBridgeTier("caption-only");

  return BRIDGE_TIERS.find((tier) => tier.isAvailable(status)) ?? findBridgeTier("caption-only");
}

/**
 * Every rung this machine could run, best first.
 *
 * Separate from `selectBridgeTier` because "what you are running" and "what else exists" are
 * different sentences, and a panel that wants to say "you could get more by installing X" needs
 * the second without re-deriving the first.
 */
export function availableBridgeTiers(status: VirtualAudioStatus | null): BridgeTier[] {
  if (!status) return [];
  if (!status.supported) return [findBridgeTier("caption-only")];
  return BRIDGE_TIERS.filter((tier) => tier.isAvailable(status));
}

/**
 * WT-898 — where the far side's audio comes in from, decided once.
 *
 * WHY LOOPBACK FIRST
 *   The 2026-09-05 bench already chose it, and the code did the opposite: `selectBridgeTier`
 *   answers "full-bridge" whenever both cables are installed, and the session let the Hi-Fi Cable
 *   device win over loopback whenever it existed. The cable is the fragile path. It is bit-perfect,
 *   which means it carries nothing at all when its two sides disagree on format, and it only works
 *   once the user has pointed Meet's Speakers at "Hi-Fi Cable Input" — the step people get wrong,
 *   usually by picking "CABLE Input" and looping the call back into Meet. Loopback needs no driver
 *   and no Meet setting: Windows converts formats itself and Meet keeps the default speakers.
 *   (Verified 2026-09-30: Chrome's audio service utility process is a child of the main
 *   chrome.exe, so an include-process-tree capture of the browser does reach Meet's output.)
 *
 * THE LADDER
 *   1  loopback   Windows can capture the browser, the capture has not already failed in this
 *                 room, and the host has not said no.
 *   2  device     the Hi-Fi Cable (or BlackHole) endpoint exists.
 *   3  none       nothing reaches WarpTalk from Meet.
 *
 * CONSENT IS PART OF THE DECISION, NOT A GATE AFTER IT
 *   Loopback takes the whole browser, so it never starts before the host's yes. WT-900: while the
 *   question is open, a machine that HAS the cable listens through it in the meantime
 *   ("device-while-asking") instead of capturing nothing. Waiting on the answer used to leave the
 *   far side silent for as long as the prompt sat unanswered — and a popup closed or minimised
 *   without an answer left it silent for the whole meeting. The prompt still carries weight: a yes
 *   moves the leg onto loopback (the capture key changes, so the running device capture is
 *   replaced), a no keeps the cable. Without a cable there is nothing to listen through, and the
 *   answer is still "loopback, not yet".
 *
 *   The ask itself gets quieter while the cable demonstrably carries Meet (see the consent relay's
 *   compact prompt), and the far-side monitor stays off until it does, because Meet may still be
 *   playing to the host's own speakers (bridge-far-side-monitor).
 */
export type BridgeInboundPath = "loopback" | "device";

export type BridgeInboundReason =
  /** Loopback, and it may start now. */
  | "loopback"
  /** Loopback is the path, but the host has not answered the capture question yet. */
  | "awaiting-consent"
  /**
   * The device, for now: the host has not answered the capture question yet and a cable exists.
   * A yes moves the leg to loopback, a no keeps it here (WT-900).
   */
  | "device-while-asking"
  /** Loopback is the path and allowed, but no browser window has been picked to capture yet. */
  | "awaiting-source"
  /** The device, because this machine cannot capture the browser. */
  | "loopback-unavailable"
  /** The device, because loopback already failed to start in this room. */
  | "loopback-failed"
  /** The device, because the host said no to listening to the browser. */
  | "consent-declined"
  /** Nothing: no loopback that may run, and no device. */
  | "no-source";

export interface BridgeInboundDecision {
  /** The path the far side comes in on, once it can start. Null when there is no way in at all. */
  path: BridgeInboundPath | null;
  /** Whether a capture on `path` may be opened right now. */
  startable: boolean;
  reason: BridgeInboundReason;
}

export interface BridgeInboundInput {
  /** `canCaptureBrowserLoopback(status)`. */
  loopbackCapable: boolean;
  /** Loopback failed to start earlier in this room; see `isLoopbackFallbackActive`. */
  loopbackFailed: boolean;
  /** The inbound virtual device (Hi-Fi Cable Output, BlackHole 16ch) was found. */
  hasInboundDevice: boolean;
  /** What the host said about listening to the browser, for this room. Null while unanswered. */
  consentAnswer: boolean | null;
  /** A browser window has been picked for the loopback capture. */
  hasLoopbackSource: boolean;
}

export function selectBridgeInboundSource(input: BridgeInboundInput): BridgeInboundDecision {
  const device = (reason: BridgeInboundReason): BridgeInboundDecision =>
    input.hasInboundDevice
      ? { path: "device", startable: true, reason }
      : { path: null, startable: false, reason: "no-source" };

  if (!input.loopbackCapable) return device("loopback-unavailable");
  if (input.loopbackFailed) return device("loopback-failed");
  if (input.consentAnswer === false) return device("consent-declined");
  if (input.consentAnswer === null) {
    // WT-900: listen through the cable while asking rather than hear nothing until someone answers.
    if (input.hasInboundDevice) return { path: "device", startable: true, reason: "device-while-asking" };
    return { path: "loopback", startable: false, reason: "awaiting-consent" };
  }
  if (!input.hasLoopbackSource) {
    return { path: "loopback", startable: false, reason: "awaiting-source" };
  }
  return { path: "loopback", startable: true, reason: "loopback" };
}

/**
 * A loopback start that failed, remembered for the room it failed in.
 *
 * Stamped with the room AND the inbound device of the moment rather than cleared by an effect: a
 * different room, or a device list that changed under it (the cable plugged in or out, an id
 * re-issued), is a new situation in which loopback deserves one more try. Anything else stays on
 * the device — retrying loopback on every render would flap the stand-in connection between two
 * paths, each attempt reconnecting to LiveKit and dropping a second of the far side.
 */
export interface BridgeLoopbackFallback {
  roomId: string;
  inboundDeviceId: string | null;
  /** Why loopback was given up on, as the desktop side or the error said it. */
  reason: string;
}

export function isLoopbackFallbackActive(
  fallback: BridgeLoopbackFallback | null,
  current: { roomId: string; inboundDeviceId: string | null },
): boolean {
  return (
    fallback !== null
    && fallback.roomId === current.roomId
    && fallback.inboundDeviceId === current.inboundDeviceId
  );
}

/**
 * Why a loopback start failed, in one line for the log.
 *
 * Duck-typed rather than `instanceof LoopbackInboundError` so this file stays free of runtime
 * imports: the refusal from the desktop side carries `riskId` (R5 no consent, R8 no window, R2 not
 * wired) and `reason`, and those two are the only useful part of it.
 */
export function describeLoopbackFailure(error: unknown): string {
  if (error && typeof error === "object") {
    const { riskId, reason, message } = error as {
      riskId?: unknown;
      reason?: unknown;
      message?: unknown;
    };
    const parts = [riskId, reason].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    if (parts.length > 0) return parts.join(": ");
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "loopback capture could not be started";
}
