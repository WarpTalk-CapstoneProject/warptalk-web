/**
 * Starting the two lower rungs of the bridge ladder for real.
 *
 * lib/desktop/bridge-tiers.ts decides WHICH rung a machine can run and stays pure so that decision
 * is testable without a desktop build. This is the other half: the small amount of impure work
 * that rung 3 and rung 4 actually consist of.
 *
 *   rung 3  outbound-only   route the dub into the virtual microphone the meeting app listens to.
 *   rung 4  caption-only    open the desktop app's floating transcript window. No audio at all.
 *
 * The top two rungs are NOT here on purpose. A full bridge publishes a second LiveKit connection
 * as the stand-in participant and belongs to the meeting session that owns those connections;
 * `startBridgeFallback` refuses them loudly rather than half-starting one.
 */

import { openTranscriptWindow, closeTranscriptWindow } from "@/lib/desktop/bridge";
import type { BridgeTier } from "@/lib/desktop/bridge-tiers";

import { openOutboundLegOnly, type OutboundOnlyLegHandle } from "./bridge-audio-legs";

export interface BridgeFallbackSession {
  tier: BridgeTier;
  /** The dub is reaching the meeting app. False on the caption-only rung, always. */
  speakingIntoMeeting: boolean;
  /** The floating transcript window is up. False when the desktop build is too old to have one. */
  captionsShown: boolean;
  /** Tears down whatever was started. Safe to call more than once. */
  stop: () => Promise<void>;
}

export interface BridgeFallbackOptions {
  /** The WarpTalk room whose transcript the floating window follows. */
  roomId: string;
  /** Dub meant for the far side. Required on the outbound-only rung. */
  farSideDubTrack?: MediaStreamTrack;
  /** Virtual device the meeting app uses as its microphone. Required on the outbound-only rung. */
  outboundDeviceId?: string;
}

/**
 * Runs `tier`, or throws saying why it cannot.
 *
 * Throws rather than silently doing less: a caller that asked for rung 3 and got rung 4 without
 * being told is precisely the "quietly running worse than you think" failure the ladder exists to
 * prevent. Choosing a lower rung is the caller's decision to make with `selectBridgeTier`, not
 * something this function does behind their back.
 */
export async function startBridgeFallback(
  tier: BridgeTier,
  options: BridgeFallbackOptions,
): Promise<BridgeFallbackSession> {
  if (tier.id === "full-bridge" || tier.id === "loopback-bridge") {
    throw new Error(
      `The ${tier.id} bridge is owned by the meeting session, not by the fallback runtime.`,
    );
  }

  if (tier.id === "outbound-only") {
    if (!options.farSideDubTrack || !options.outboundDeviceId) {
      throw new Error(
        "Speaking into the meeting needs both the dub track and the virtual microphone to send it to.",
      );
    }

    // Not wrapped in a fallback to captions. The caller asked for audio; if the device refuses it,
    // they need the error, not a quieter success they did not ask for.
    const leg: OutboundOnlyLegHandle = await openOutboundLegOnly({
      farSideDubTrack: options.farSideDubTrack,
      outboundDeviceId: options.outboundDeviceId,
    });

    // Captions come along on this rung because the transcript is the only place the user can see
    // what was actually sent into the meeting on their behalf — the meeting app shows them nothing.
    const captionsShown = await openTranscriptWindow(options.roomId);

    let stopped = false;
    return {
      tier,
      speakingIntoMeeting: true,
      captionsShown,
      stop: async () => {
        if (stopped) return;
        stopped = true;
        leg.stop();
        if (captionsShown) await closeTranscriptWindow();
      },
    };
  }

  // caption-only. Nothing is opened, nothing is routed, and nothing at all is played into the
  // meeting — the window is the entire feature.
  const captionsShown = await openTranscriptWindow(options.roomId);

  let stopped = false;
  return {
    tier,
    speakingIntoMeeting: false,
    captionsShown,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (captionsShown) await closeTranscriptWindow();
    },
  };
}
