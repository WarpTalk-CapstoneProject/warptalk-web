/**
 * Barge-in for the half-duplex microphone gate: tells a listener talking over a dub apart from
 * that dub coming back in through their own microphone.
 *
 * WHY THE GATE NEEDS THIS
 *   HalfDuplexMic (components/rooms/live/half-duplex-mic.tsx) silences the microphone while a dub
 *   plays to this listener, because browser echo cancellation does not reliably stop a dub played
 *   through laptop speakers from being transcribed as the listener. But a gate that is shut for
 *   the WHOLE dub also drops everything the listener says during it — never sent, never
 *   transcribed, never dubbed. Dubs routinely arrive 2-8 s after the speech they translate, so a
 *   reply very often starts while one is still playing, and testers heard that as "the clone
 *   voice skips segments".
 *
 * THE SIGNAL
 *   Echo is the dub, attenuated. Whatever the microphone hears that is NOT explained by how loud
 *   the dub has just been is somebody in the room talking. That is the classic double-talk test
 *   (Geigel): compare near-end level against recent far-end level times the echo path's gain.
 *
 *   The echo path's gain ("coupling") is not known in advance — it depends on speaker volume,
 *   the room, the headset or its absence, and how well the browser's AEC is doing — so it is
 *   LEARNED, per microphone, from the ratio mic / dub while the gate is shut. The median of that
 *   ratio is the estimate: a listener talking during some of those frames only adds energy, and a
 *   median shrugs off a minority of such frames. A headset produces almost no echo, so its
 *   coupling comes out tiny and any real speech opens the gate; a laptop on full volume produces
 *   a large one, and only speech clearly louder than its own echo does.
 *
 * WHICH WAY IT FAILS
 *   Every uncertain state resolves to "keep the gate shut", which is the behaviour that existed
 *   before this: not calibrated yet, no dub level available (the reference reads nothing while a
 *   dub is supposedly sounding), or speech not clearly above the predicted echo. A missed
 *   barge-in costs what the gate always cost; a false one leaks echo, which the stt_worker
 *   dub-echo guard (`_matches_recent_dub`) is the backstop for — not a licence to be loose here.
 *
 * Pure and clock-free (every sample carries its own timestamp) so it can be tested without a
 * browser, an AudioContext, or a room.
 */

export type BargeInConfig = {
  /** Microphone RMS (0..1 full scale) below which nothing counts as speech. ~-42 dBFS. */
  minSpeechRms: number;
  /** Dub RMS below which a frame teaches nothing about the echo path. ~-40 dBFS. */
  minReferenceRms: number;
  /** How far back the dub's level is held: acoustic delay, output buffering and the room's tail. */
  referenceHoldMs: number;
  /** How far above the predicted echo the microphone must be. 5x amplitude is ~14 dB. */
  margin: number;
  /** Speech must persist this long before the gate opens: one loud echo syllable must not. */
  onsetMs: number;
  /** A gap in speech shorter than this does not restart the onset count (stop consonants). */
  onsetGapToleranceMs: number;
  /** After the listener stops, how long the gate stays open before shutting again. */
  releaseMs: number;
  /** Learned ratios needed before any barge-in is allowed. ~1.5 s of audible dub. */
  calibrationSamples: number;
  /** How many learned ratios are kept: recent enough to follow a volume change. */
  windowSamples: number;
  /**
   * The dub must have been heard by the reference this recently. A dub "speaking" whose audio
   * the reference cannot hear means the reference is broken, not that the room is quiet — and
   * treating it as quiet would let the echo straight through.
   */
  referenceStaleMs: number;
};

export const DEFAULT_BARGE_IN_CONFIG: BargeInConfig = {
  minSpeechRms: 0.008,
  minReferenceRms: 0.01,
  referenceHoldMs: 300,
  margin: 5,
  onsetMs: 120,
  onsetGapToleranceMs: 100,
  releaseMs: 700,
  calibrationSamples: 30,
  windowSamples: 160,
  referenceStaleMs: 1500,
};

export type BargeInSample = {
  /** Milliseconds, any monotonic origin. */
  at: number;
  /** RMS of this listener's microphone, measured on a copy the gate does not silence. */
  micRms: number;
  /** RMS of the dub audio being played to this listener (all dubs together). */
  referenceRms: number;
};

/** RMS of a block of samples in -1..1. */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

/** Combined RMS of several simultaneous sources: powers add, amplitudes do not. */
export function combineRms(levels: readonly number[]): number {
  let power = 0;
  for (const level of levels) power += level * level;
  return Math.sqrt(power);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class BargeInDetector {
  private readonly config: BargeInConfig;
  /** Learned mic/dub ratios. Survives between dubs — it describes the echo path, not one dub. */
  private ratios: number[] = [];
  private referenceHistory: { at: number; rms: number }[] = [];
  private lastReferenceLoudAt: number | null = null;
  private candidateSince: number | null = null;
  private lastSpeechAt: number | null = null;
  private belowSince: number | null = null;
  private isOpen = false;

  constructor(config: Partial<BargeInConfig> = {}) {
    this.config = { ...DEFAULT_BARGE_IN_CONFIG, ...config };
  }

  /** True while the listener is judged to be talking over the dub, so the gate should be open. */
  get open(): boolean {
    return this.isOpen;
  }

  /** The learned echo-path gain, or null while there is not yet enough evidence to trust one. */
  get coupling(): number | null {
    return this.ratios.length >= this.config.calibrationSamples ? median(this.ratios) : null;
  }

  /**
   * A gate period begins (a dub started sounding to this listener).
   *
   * `localTalking` — the listener was already mid-sentence when the dub arrived. With dubs
   * landing seconds late that is common, and shutting the microphone on them would cut the
   * sentence in half; they start the period already barged in and keep the microphone for as
   * long as they keep talking. Measured before the dub was audible, so it is not echo.
   */
  startDub(at: number, localTalking: boolean): void {
    this.clearPeriod();
    if (localTalking) {
      this.isOpen = true;
      this.lastSpeechAt = at;
    }
  }

  /** The gate period is over (the dub stopped and the hangover ran out). */
  endDub(): void {
    this.clearPeriod();
  }

  /**
   * Forget the echo path: a different microphone, output device or processor. The gate period
   * itself carries on — an open barge-in simply has to re-earn its place once recalibrated, and
   * until then the gate shuts (see "WHICH WAY IT FAILS").
   */
  reset(): void {
    this.ratios = [];
    this.candidateSince = null;
  }

  /** Feed one measurement. Returns whether the gate should be open (the listener is talking). */
  step(sample: BargeInSample): boolean {
    const { config } = this;
    const { at, micRms, referenceRms } = sample;

    this.referenceHistory.push({ at, rms: referenceRms });
    while (this.referenceHistory.length > 0 && at - this.referenceHistory[0].at > config.referenceHoldMs) {
      this.referenceHistory.shift();
    }
    let referencePeak = 0;
    for (const entry of this.referenceHistory) referencePeak = Math.max(referencePeak, entry.rms);
    if (referenceRms >= config.minReferenceRms) this.lastReferenceLoudAt = at;

    const coupling = this.coupling;
    const referenceFresh =
      this.lastReferenceLoudAt !== null && at - this.lastReferenceLoudAt <= config.referenceStaleMs;
    const threshold =
      coupling === null ? Number.POSITIVE_INFINITY : Math.max(config.minSpeechRms, config.margin * coupling * referencePeak);
    const speech = referenceFresh && micRms >= threshold;

    // Learn only while the gate is shut: once open, the microphone is mostly the listener, and
    // learning their voice as "echo" would raise the bar until they could no longer clear it.
    if (!this.isOpen && referencePeak >= config.minReferenceRms) {
      this.ratios.push(micRms / referencePeak);
      if (this.ratios.length > config.windowSamples) this.ratios.shift();
    }

    if (speech) this.lastSpeechAt = at;

    if (!this.isOpen) {
      if (speech) {
        this.candidateSince ??= at;
        if (at - this.candidateSince >= config.onsetMs) {
          this.isOpen = true;
          this.belowSince = null;
        }
      } else if (
        this.candidateSince !== null &&
        (this.lastSpeechAt === null || at - this.lastSpeechAt > config.onsetGapToleranceMs)
      ) {
        this.candidateSince = null;
      }
      return this.isOpen;
    }

    if (speech) {
      this.belowSince = null;
    } else {
      this.belowSince ??= at;
      if (at - this.belowSince >= config.releaseMs) {
        this.isOpen = false;
        this.belowSince = null;
        this.candidateSince = null;
      }
    }
    return this.isOpen;
  }

  private clearPeriod(): void {
    this.referenceHistory = [];
    this.lastReferenceLoudAt = null;
    this.candidateSince = null;
    this.lastSpeechAt = null;
    this.belowSince = null;
    this.isOpen = false;
  }
}
