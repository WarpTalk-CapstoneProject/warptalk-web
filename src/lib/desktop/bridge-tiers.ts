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
    // Capability and runtime are two claims. `processLoopback` says this Windows build could do it;
    // `processLoopbackRuntime` says the capture is actually wired. Treating the first as the second
    // is how a rung gets selected that then produces silence.
    isAvailable: (status) =>
      status.platform === "win32"
      && status.capabilities?.processLoopback === true
      && status.capabilities?.processLoopbackRuntime === "available"
      && hasInstalledOutboundDevice(status),
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
