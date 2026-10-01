/**
 * Hi-Fi Cable's one silent failure, and the one-click fix for it.
 *
 * VB-Audio Hi-Fi Cable carries Google Meet's audio back to WarpTalk on Windows. It has two
 * endpoints — "Hi-Fi Cable Input" on the playback side, "Hi-Fi Cable Output" on the recording
 * side — and each has its own format in Windows Sound settings. When the two differ in sample rate
 * OR bit depth the cable passes nothing at all: no error, no crackle, just silence, so the tone test
 * reports "no sound came through" and the user has no way to know which setting to look at.
 *
 * The desktop app reads both formats and, on newer builds, can set them to match. Everything here
 * is optional-by-construction because an older installed build knows about neither: absence of the
 * data means "we cannot tell", never "they match", and absence of the method means "tell the user
 * how to do it by hand", never "it is already fine".
 *
 * Kept free of React so the rules are testable under plain `node --test`.
 */

import {
  getDesktopBridge,
  type EndpointFormat,
  type HiFiCableAlignResult,
  type VirtualAudioStatus,
} from "./bridge.ts";

/** "24-bit, 48000 Hz" — the words Windows' own Advanced tab uses, so the user can match them. */
export function describeHiFiFormat(format: EndpointFormat | null | undefined): string {
  if (!format) return "unknown";
  return `${format.bitsPerSample}-bit, ${format.sampleRate} Hz`;
}

/**
 * Whether the two sides of Hi-Fi Cable disagree.
 *
 * The desktop's own flag wins when it sent one: it is the side that read the registry and may know
 * about a case this mirror does not. Without the flag, compare what we were given — but only when
 * BOTH sides were read. One unknown side is not evidence of a mismatch, and warning about a
 * problem we cannot see would send the user into Sound settings for nothing. Channel count is not
 * compared: the cable tolerates stereo on one side and more on the other, it is rate and depth
 * that silence it.
 */
export function hifiFormatMismatch(status: VirtualAudioStatus | null | undefined): boolean {
  if (!status) return false;
  if (typeof status.hifiFormatMismatch === "boolean") return status.hifiFormatMismatch;
  const input = status.hifiFormat?.input;
  const output = status.hifiFormat?.output;
  if (!input || !output) return false;
  return input.sampleRate !== output.sampleRate || input.bitsPerSample !== output.bitsPerSample;
}

export type HiFiAlignOutcome = { kind: "unsupported" } | ({ kind: "result" } & HiFiCableAlignResult);

const UNKNOWN_FORMATS = { input: null, output: null } as const;

/**
 * Ask the desktop app to set both sides of Hi-Fi Cable to one format.
 *
 * `unsupported` is its own outcome, not a failure: a browser tab or an older desktop build simply
 * has no way to do this, and the right response is manual steps, not an error message. A rejection
 * from the IPC call IS a failure, and is folded into `ok: false` with its message so the wizard has
 * one shape to render instead of a try/catch at every call site.
 */
export async function alignHiFiCableFormatViaDesktop(): Promise<HiFiAlignOutcome> {
  const bridge = getDesktopBridge();
  if (!bridge?.alignHiFiCableFormat) return { kind: "unsupported" };
  try {
    const result = await bridge.alignHiFiCableFormat();
    return { kind: "result", ...result };
  } catch (error) {
    return {
      kind: "result",
      ok: false,
      before: UNKNOWN_FORMATS,
      after: UNKNOWN_FORMATS,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
