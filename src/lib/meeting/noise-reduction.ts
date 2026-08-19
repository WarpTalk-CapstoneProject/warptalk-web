/**
 * How much the STT provider denoises ONE participant's own microphone in a meeting.
 *
 * WHY THIS IS NOT THE "NOISE SUPPRESSION" TOGGLE IN THE SAME MENU
 *   That one is Krisp (or the browser's own filter) processing the raw microphone track, and it
 *   changes what other people HEAR. This one is a provider-side pass applied before transcription,
 *   and it changes how accurately what you say is RECOGNISED. Two different layers, two different
 *   audiences, and the only reason they read alike is that English calls both of them noise.
 *
 *   They also fail differently. Krisp can be unavailable — the LiveKit project may not be entitled
 *   to run it, and no amount of reloading changes that (see noise-suppression-failure.ts). This
 *   setting has no entitlement and no WASM: it is a string in Redis that the STT worker reads.
 *
 * WHY THE THIRD OPTION EXISTS AT ALL
 *   "off" is not the absence of an answer, it is the right answer for a headset. The deployment
 *   default is off for a measured reason — a second denoising pass on top of the browser's own
 *   distorted clean close-mic speech in replay tests. So somebody on a headset who has been given
 *   far-field by a room-wide default needs a way to say "not for me", and that is this.
 */

export const NOISE_REDUCTION_MODES = ["off", "near_field", "far_field"] as const;

export type NoiseReductionMode = (typeof NOISE_REDUCTION_MODES)[number];

/**
 * Coerce anything the API or an older client might hand us into a mode we can render.
 *
 * Unknown falls to "off" rather than throwing, and "off" is the honest choice rather than a
 * convenient one: the STT worker ignores a value it does not recognise and falls back, so "off" is
 * what the audio will actually do.
 */
export function normalizeNoiseReductionMode(value: unknown): NoiseReductionMode {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (NOISE_REDUCTION_MODES as readonly string[]).includes(candidate)
    ? (candidate as NoiseReductionMode)
    : "off";
}

/** Short label for the collapsed settings row. */
export function noiseReductionLabel(mode: NoiseReductionMode): string {
  switch (mode) {
    case "near_field":
      return "Close mic";
    case "far_field":
      return "Room mic";
    default:
      return "Off";
  }
}

/**
 * What each option means, in terms of where the microphone IS rather than what the provider calls
 * the mode. "near_field" and "far_field" are the provider's words and mean nothing to somebody
 * sitting in a meeting wondering why their transcript is wrong.
 */
export function noiseReductionDescription(mode: NoiseReductionMode): string {
  switch (mode) {
    case "near_field":
      return "A headset, or a phone held to your face.";
    case "far_field":
      return "A laptop or a mic across the desk. Use this if your transcript gets worse when you sit back.";
    default:
      return "No extra filtering. Best for a headset already close to your mouth.";
  }
}
