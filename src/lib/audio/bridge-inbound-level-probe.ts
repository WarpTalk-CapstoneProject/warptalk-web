import type { InboundLevelSample } from "./bridge-inbound-health";

/** How often the inbound track is measured. Four a second is plenty for rules measured in tens of seconds. */
const SAMPLE_INTERVAL_MS = 250;

/**
 * Measures the far side's track as it is being published, for `bridge-inbound-health`.
 *
 * ITS OWN AudioContext
 *   Not the far-side monitor's. The monitor exists only on the device path and only while it can
 *   start; health has to be measured on both paths and must not stop because the monitor failed or
 *   was muted. A second context on one track is cheap: an analyser with nothing connected after it.
 *
 * setInterval, NOT requestAnimationFrame
 *   During a bridged call the WarpTalk window usually sits behind Meet, often minimised. rAF stops
 *   entirely for a hidden page, which would freeze the meter at exactly the moment the user is in
 *   Meet wondering why nothing is being translated. Timers are throttled when hidden (to about
 *   once a second) but keep running, and once a second is still far inside the 50 s rule.
 *
 * A SUSPENDED CONTEXT REPORTS NOTHING
 *   An AudioContext created without a user gesture can start "suspended", and a suspended graph
 *   reads as exact zeros — the very thing the health rules call a broken cable. So samples are only
 *   reported while the context is running; a context the browser never lets run leaves the health
 *   "unknown" instead of raising a false alarm about the user's cable. The reducer's grace period
 *   starts at the first sample reported here, so time spent suspended never ages it either.
 *
 * Never stops the track: the publisher owns it.
 */
export function startInboundLevelProbe(
  track: MediaStreamTrack,
  onSample: (sample: InboundLevelSample) => void,
): () => void {
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return () => {};

  const context = new AudioContextCtor();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const source = context.createMediaStreamSource(new MediaStream([track]));
  source.connect(analyser);
  if (context.state === "suspended") void context.resume().catch(() => {});

  const block = new Float32Array(analyser.fftSize);
  let stopped = false;

  const timer = setInterval(() => {
    if (stopped || context.state !== "running" || track.readyState === "ended") return;
    analyser.getFloatTimeDomainData(block);
    let sumSquares = 0;
    let peakAbs = 0;
    for (const value of block) {
      sumSquares += value * value;
      const magnitude = Math.abs(value);
      if (magnitude > peakAbs) peakAbs = magnitude;
    }
    const rms = Math.sqrt(sumSquares / block.length);
    onSample({
      rmsDbfs: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
      peakAbs,
      allZero: peakAbs === 0,
    });
  }, SAMPLE_INTERVAL_MS);

  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    source.disconnect();
    void context.close().catch(() => {});
  };
}
