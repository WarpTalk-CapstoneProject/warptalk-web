/**
 * One scale for every reading of the local microphone.
 *
 * Every meter in the product samples the same way (average byte magnitude over 128 — see
 * use-local-mic-levels.ts and use-device-preview.ts), so the thresholds that interpret a level
 * belong in one place. Two meters of the same microphone that disagree are worse than either
 * alone, and the clone-capture meter and the mic check both read against these.
 */

/** Above this a bucket is clearly voiced speech. */
export const CLEAR_LEVEL = 0.42;
/** Below this there is sound but not much of it; "too quiet" verdicts live down here. */
export const QUIET_LEVEL = 0.16;
/** Below this the microphone is sending effectively nothing — the floor of a working denoiser. */
export const SILENT_LEVEL = 0.05;

export type MicBackgroundLabel = "silent" | "low" | "noticeable" | "loud";

/**
 * What the microphone sends when you are NOT speaking — the number noise suppression exists to
 * push down, and therefore the number that shows whether it is doing anything.
 *
 * The floor is the QUIETEST recent bucket, not the average: buckets are peak-sampled, so any
 * bucket you spoke in reads high, and the quietest one is the closest thing the strip has to a
 * moment of pure background. With suppression doing its job the floor sits in "silent" even in a
 * noisy room; a floor that stays "noticeable" while you are quiet IS the noise everyone else
 * hears.
 *
 * Null until there are a few buckets to judge from — a verdict on half a second of audio would
 * change on every render and mean nothing.
 */
export function describeMicBackground(
  levels: number[],
): { level: number; label: MicBackgroundLabel } | null {
  if (levels.length < 4) return null;
  const recent = levels.slice(-12);
  const level = Math.min(...recent);
  if (level < SILENT_LEVEL) return { level, label: "silent" };
  if (level < QUIET_LEVEL) return { level, label: "low" };
  if (level < CLEAR_LEVEL) return { level, label: "noticeable" };
  return { level, label: "loud" };
}
