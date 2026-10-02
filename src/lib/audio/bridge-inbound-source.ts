/**
 * Where the inbound leg's audio comes from, decided once instead of at every call site.
 *
 * There are two ways the far side reaches WarpTalk and they have nothing in common mechanically.
 * A virtual device (BlackHole, a second VB-CABLE) is an audio endpoint: it has a device id and
 * `getUserMedia` opens it. Windows process loopback has no endpoint at all — the desktop main
 * process pulls the browser's own output through WASAPI and forwards raw PCM, which only becomes
 * a track once this side reassembles it.
 *
 * They are resolved here rather than in the meeting session because picking between them is a
 * decision, and decisions in a 2700-line component stop being reviewable. The session asks for a
 * source and gets one, or gets told why it cannot have one.
 */

// Relative, not the `@/` alias, and deliberately: this module is exercised by `node --test`, which
// resolves neither tsconfig paths nor Next's bundler. Sibling modules get away with the alias
// because they import only types, and those are stripped before Node ever sees them —
// `getDesktopBridge` is a value, so the import has to be one Node can follow.
import {
  getDesktopBridge,
  supportsMeetSightingCapture,
  type WindowsLoopbackCaptureRequest,
  type WindowsLoopbackStartResult,
} from "../desktop/bridge.ts";

import type { BridgeInboundSource } from "./bridge-inbound-connection.ts";
import { decodeS16lePcmChunk, WindowsLoopbackPcmTrackBridge } from "./windows-loopback-pcm.ts";

export interface BridgeInboundSourceHandles {
  source: BridgeInboundSource;
  /**
   * Releases whatever this resolver created, and nothing it did not.
   *
   * The device shape creates nothing — `openBridgeInbound` opens and closes that track itself — so
   * its dispose is a no-op. The loopback shape owns a capture in the main process, a chunk
   * subscription and an AudioContext, none of which the publisher knows about.
   */
  dispose: () => Promise<void>;
  /** How a loopback capture was aimed: the desktop's own Meet sighting, or the picked window. */
  capturedVia?: "meet-sighting" | "picker";
}

/**
 * Refusals that mean "the sighting could not aim this capture", not "this capture may not start".
 * `target-process-required` is what a desktop older than `target` says: it ignored the field and
 * found neither a window nor a PID. Anything else (consent, readiness, R1) would refuse the picked
 * window just the same, so it is reported as it is.
 */
const MEET_SIGHTING_FALLBACK_REASONS = new Set([
  "meet-sighting-missing",
  "meet-sighting-no-process",
  "target-process-required",
]);

export function shouldFallBackFromMeetSighting(result: WindowsLoopbackStartResult): boolean {
  return !result.started && MEET_SIGHTING_FALLBACK_REASONS.has(result.reason);
}

/** The far side arrives on a real audio endpoint. Nothing to set up: the publisher opens it. */
export function deviceInboundSource(deviceId: string): BridgeInboundSourceHandles {
  return {
    source: { kind: "device", deviceId },
    dispose: async () => undefined,
  };
}

/**
 * Refusal from the desktop side, carried rather than flattened.
 *
 * The start is gated on the risk register, so a refusal names the control that stopped it. Keeping
 * `riskId` on the error is what lets the UI say "you have not agreed to this yet" (R5) instead of
 * the same shrug it would give for a missing driver.
 */
export class LoopbackInboundError extends Error {
  // Declared and assigned rather than written as constructor parameter properties: the repo runs
  // its tests through `node --experimental-strip-types`, which is strip-only and rejects that
  // shorthand outright. The failure is at load time and takes the whole file with it.
  readonly riskId?: string;
  readonly reason?: string;

  constructor(message: string, riskId?: string, reason?: string) {
    super(message);
    this.name = "LoopbackInboundError";
    this.riskId = riskId;
    this.reason = reason;
  }
}

/**
 * Starts a Windows process-loopback capture and hands back the track it produces.
 *
 * `consentGranted` is typed as the literal `true` on purpose. The desktop side refuses without it
 * (R5), and a plain boolean here would let a caller thread a variable through and satisfy the gate
 * without anyone ever having been asked. Passing a literal means consent was a decision at the
 * call site, where the dialog is.
 */
export async function openLoopbackInboundSource(options: {
  consentGranted: true;
  /** The window the user picked, from `listWindowsLoopbackSources`. */
  sourceId?: string;
  /** Already-resolved PID, when the caller has one. The desktop side resolves `sourceId` if not. */
  targetProcessId?: number;
  /**
   * Text-only bridge (desktop #45): "text-only" lets the desktop start without VB-CABLE, because
   * nothing is dubbed into Meet. Omitted is voice, the old contract.
   */
  mode?: "voice" | "text-only";
  /**
   * Try the desktop's own Meet sighting first (`target: "meet-sighting"`) when the desktop supports
   * it, and fall back to `sourceId` when it cannot aim. A capture aimed this way is stopped by the
   * desktop once Meet has been gone for its grace; `onCaptureStopped` is called then.
   */
  preferMeetSighting?: boolean;
  /** The desktop stopped this capture on its own (Meet gone). Only for a sighting-aimed capture. */
  onCaptureStopped?: (reason: string) => void;
}): Promise<BridgeInboundSourceHandles> {
  const bridge = getDesktopBridge();
  if (!bridge?.startAudioCapture || !bridge.onWindowsLoopbackPcmChunk) {
    throw new LoopbackInboundError(
      "This build of WarpTalk Desktop cannot capture the meeting's audio.",
    );
  }

  const pcm = new WindowsLoopbackPcmTrackBridge();

  // Subscribe BEFORE starting, for the same reason the publisher captures before connecting:
  // between a start and a late subscription the first chunks are simply dropped, and a bridge that
  // loses its opening seconds is far harder to recognise as broken than one that never starts.
  const unsubscribe = bridge.onWindowsLoopbackPcmChunk((chunk) => {
    pcm.pushFrame(decodeS16lePcmChunk(chunk));
  });

  const request: WindowsLoopbackCaptureRequest = {
    consentGranted: true,
    // Never false. False is the OS's EXCLUDE mode — it would capture everything except the
    // meeting, which is both useless and the most confusing possible failure.
    includeTargetProcessTree: true,
    sourceId: options.sourceId,
    targetProcessId: options.targetProcessId,
    ...(options.mode ? { mode: options.mode } : {}),
  };

  // Subscribed before the start like the chunks, so a stop that lands right after it is not lost.
  // Kept only for a capture the sighting aimed: the desktop never stops a picked window on its own.
  const sighting = options.preferMeetSighting === true && supportsMeetSightingCapture(bridge);
  let disposed = false;
  let stoppedReason: string | null = null;
  let unsubscribeStopped: (() => void) | null = null;
  if (sighting && options.onCaptureStopped && bridge.onAudioCaptureStopped) {
    try {
      unsubscribeStopped = bridge.onAudioCaptureStopped((event) => {
        stoppedReason = typeof event?.reason === "string" ? event.reason : "stopped";
        if (!disposed && capturedVia === "meet-sighting") options.onCaptureStopped?.(stoppedReason);
      });
    } catch {
      unsubscribeStopped = null;
    }
  }
  let capturedVia: "meet-sighting" | "picker" | null = null;

  let result: WindowsLoopbackStartResult | null = null;
  try {
    if (sighting) {
      try {
        result = await bridge.startAudioCapture({ ...request, target: "meet-sighting", stopWhenMeetGone: true });
      } catch {
        // A failure on the new path is no reason to skip the old one.
        result = null;
      }
      if (result?.started) capturedVia = "meet-sighting";
    }
    if (!result || shouldFallBackFromMeetSighting(result)) {
      unsubscribeStopped?.();
      unsubscribeStopped = null;
      result = await bridge.startAudioCapture(request);
      if (result.started) capturedVia = "picker";
    }
  } catch (error) {
    unsubscribeStopped?.();
    unsubscribe();
    pcm.close();
    throw new LoopbackInboundError(
      error instanceof Error ? error.message : "The audio capture could not be started.",
    );
  }

  if (!result.started) {
    unsubscribeStopped?.();
    unsubscribe();
    pcm.close();
    throw new LoopbackInboundError(
      "WarpTalk could not start listening to the meeting.",
      result.riskId,
      result.reason,
    );
  }

  // Stopped while the start was still resolving: the caller is told once it has the handles.
  const stoppedEarly = stoppedReason;
  if (stoppedEarly && capturedVia === "meet-sighting" && options.onCaptureStopped) {
    queueMicrotask(() => {
      if (!disposed) options.onCaptureStopped?.(stoppedEarly);
    });
  }

  return {
    source: { kind: "track", track: pcm.track },
    capturedVia: capturedVia ?? "picker",
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      unsubscribeStopped?.();
      unsubscribe();
      pcm.close();
      // Last, and never allowed to throw past the caller: the local teardown above has already
      // happened, and a failed IPC call must not leave the caller believing nothing was released.
      try {
        await bridge.stopAudioCapture?.();
      } catch {
        // The capture dies with the main process anyway.
      }
    },
  };
}
