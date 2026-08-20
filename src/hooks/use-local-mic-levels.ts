"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";

/**
 * A rolling history of how loud your own microphone has been, one value per time bucket.
 *
 * WHY A HISTORY AND NOT A LEVEL
 *   A live meter answers "is my mic on". The question here is different: while the voice-clone
 *   worker collects a reference clip, the useful thing to know is WHICH PART of what you just said
 *   was clean — so you can hear yourself trail off at the end of a sentence and say another one.
 *   A single bouncing bar cannot show that; a strip of the last N seconds can.
 *
 * WHY IT MEASURES THE LOCAL MICROPHONE
 *   The clip itself is cut server-side from the audio you publish. This is the same signal one hop
 *   earlier, which is the closest thing the browser can observe — the worker sends progress and a
 *   verdict, never a waveform. It is honest about level and about silence, and that is what the
 *   strip claims to show; it is NOT a picture of the exact bytes the worker graded.
 *
 * Sampling is peak-per-bucket, not average: a bucket containing one clear word and a pause is a
 * bucket where you spoke, and averaging it down to "quiet" would advise the opposite of the truth.
 *
 * The returned array GROWS from empty up to `buckets` and only then starts shifting, so the strip
 * fills left to right exactly like a recording — which is what lets one drawing be both the
 * waveform and the progress of the take. It resets whenever `enabled` goes false and true again,
 * because a second attempt is a second clip and must not be drawn on top of the first one.
 *
 * The AudioContext exists only while `enabled` — an idle meeting must not hold one open for the
 * whole call just in case a clone capture starts.
 */
/** One shared empty array, so an idle hook returns a stable reference and re-renders nothing. */
const EMPTY_LEVELS: number[] = [];

export function useLocalMicLevels({
  enabled,
  buckets = 36,
  windowSeconds = 18,
}: {
  enabled: boolean;
  /** How many bars the strip has once it is full. */
  buckets?: number;
  /** How much wall-clock time the whole strip covers. */
  windowSeconds?: number;
}): number[] {
  const { microphoneTrack } = useLocalParticipant();
  const mediaStreamTrack = microphoneTrack?.track?.mediaStreamTrack ?? null;
  const active = enabled && Boolean(mediaStreamTrack);
  const [levels, setLevels] = useState<number[]>(EMPTY_LEVELS);
  const peakRef = useRef(0);
  const bucketsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!active || !mediaStreamTrack) return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(
      new MediaStream([mediaStreamTrack]),
    );
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    peakRef.current = 0;
    // A take starts empty. Cleared through the ref rather than with setLevels, so starting one
    // does not schedule a render from inside an effect body — the reported value is derived at
    // the bottom instead.
    bucketsRef.current = [];

    // Same scale as the pre-join mic meter (use-device-preview): average magnitude over 128. Two
    // meters of the same microphone that disagree are worse than either alone.
    const sample = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      peakRef.current = Math.max(peakRef.current, Math.min(1, average / 128));
      frame = requestAnimationFrame(sample);
    };
    sample();

    const bucketMs = Math.max(120, Math.round((windowSeconds * 1000) / buckets));
    const timer = setInterval(() => {
      const value = peakRef.current;
      peakRef.current = 0;
      const next = bucketsRef.current;
      bucketsRef.current =
        next.length < buckets ? [...next, value] : [...next.slice(1), value];
      setLevels(bucketsRef.current);
    }, bucketMs);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      source.disconnect();
      if (audioContext.state !== "closed") void audioContext.close();
    };
  }, [active, mediaStreamTrack, buckets, windowSeconds]);

  // Derived, not stored: a hook that is off reports an empty strip without having to write state
  // from inside an effect to say so.
  return active ? levels : EMPTY_LEVELS;
}
