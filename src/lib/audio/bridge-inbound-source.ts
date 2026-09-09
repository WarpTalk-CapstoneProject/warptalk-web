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
import { getDesktopBridge, type WindowsLoopbackCaptureRequest } from "../desktop/bridge.ts";

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
  };

  let result;
  try {
    result = await bridge.startAudioCapture(request);
  } catch (error) {
    unsubscribe();
    pcm.close();
    throw new LoopbackInboundError(
      error instanceof Error ? error.message : "The audio capture could not be started.",
    );
  }

  if (!result.started) {
    unsubscribe();
    pcm.close();
    throw new LoopbackInboundError(
      "WarpTalk could not start listening to the meeting.",
      result.riskId,
      result.reason,
    );
  }

  let disposed = false;
  return {
    source: { kind: "track", track: pcm.track },
    dispose: async () => {
      if (disposed) return;
      disposed = true;
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
