import type { WindowsLoopbackPcmChunk } from "@/lib/desktop/bridge";

export interface WindowsLoopbackPcmFrame {
  samples: Float32Array | readonly number[];
  sampleRate: number;
  channelCount: number;
  capturedAtMs: number;
}

export interface WindowsLoopbackPcmBridgeOptions {
  audioContext?: AudioContext;
}

/**
 * WHY THERE IS NO SILENCE PADDING HERE ANY MORE
 *
 * Process loopback emits no packets at all while the target renders nothing, so a gap in the
 * stream is normal and frequent. This module used to answer that by synthesising a silent buffer
 * the length of the gap and scheduling it before the next real frame — and that is precisely what
 * made the leg fall behind.
 *
 * The scheduler places every buffer at `max(currentTime, nextStartTime)`. After a gap of G
 * seconds, `nextStartTime` is stale and the padding buffer lands at `currentTime`, pushing
 * `nextStartTime` to `currentTime + G`; the real frame that follows is then scheduled a full G
 * into the future. `nextStartTime` never comes back, so the inbound leg's latency converges on the
 * longest silence the meeting has yet contained and stays there. One quiet minute meant the far
 * side arrived a minute late for the rest of the call, with nothing on screen to say why.
 *
 * Nothing was gained for it. A MediaStreamAudioDestinationNode already emits silence for any
 * interval with no buffer scheduled, so the published track was continuous either way. Removing
 * the padding lets `max(currentTime, nextStartTime)` re-anchor to `currentTime` after every gap,
 * which is the behaviour the padding was trying and failing to preserve.
 *
 * If a future change needs to KNOW a gap happened — to reset downstream state, or to report it —
 * that is a separate signal and must not be implemented by scheduling audio.
 */

export function decodeS16lePcmChunk(chunk: WindowsLoopbackPcmChunk): WindowsLoopbackPcmFrame {
  const bytes = chunk.data;
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const samples = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let index = 0; index < sampleCount; index += 1) {
    const value = view.getInt16(index * 2, true);
    samples[index] = value < 0 ? value / 32768 : value / 32767;
  }

  return {
    samples,
    sampleRate: chunk.sampleRate,
    channelCount: chunk.channelCount,
    capturedAtMs: chunk.capturedAtMs,
  };
}

function copyInterleavedSamplesToBuffer(
  buffer: AudioBuffer,
  samples: Float32Array | readonly number[],
  channelCount: number,
): void {
  for (let channel = 0; channel < channelCount; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    for (let index = 0; index < channelData.length; index += 1) {
      channelData[index] = samples[index * channelCount + channel] ?? 0;
    }
  }
}

export class WindowsLoopbackPcmTrackBridge {
  private readonly context: AudioContext;
  private readonly destination: MediaStreamAudioDestinationNode;
  private nextStartTimeSeconds: number;
  /**
   * Only a context we created is ours to close. An injected one belongs to the caller, and closing
   * it would tear down whatever else that caller is running through it.
   */
  private readonly ownsContext: boolean;

  constructor(options: WindowsLoopbackPcmBridgeOptions = {}) {
    const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!options.audioContext && !AudioContextCtor) {
      throw new Error("Web Audio is unavailable; Windows loopback PCM cannot become a track.");
    }

    this.ownsContext = !options.audioContext;
    this.context = options.audioContext ?? new AudioContextCtor();
    this.destination = this.context.createMediaStreamDestination();
    this.nextStartTimeSeconds = this.context.currentTime;
  }

  get track(): MediaStreamTrack {
    const [track] = this.destination.stream.getAudioTracks();
    if (!track) throw new Error("PCM destination did not produce an audio track.");
    return track;
  }

  pushFrame(frame: WindowsLoopbackPcmFrame): void {
    const frameBuffer = this.context.createBuffer(
      frame.channelCount,
      Math.ceil(frame.samples.length / frame.channelCount),
      frame.sampleRate,
    );
    copyInterleavedSamplesToBuffer(frameBuffer, frame.samples, frame.channelCount);
    this.scheduleBuffer(frameBuffer);
  }

  close(): void {
    this.track.stop();
    // Stopping the track left the AudioContext alive, and with it a hardware audio thread. A
    // browser allows only a handful per document, so a few join/leave cycles exhausted them and
    // the next attempt failed at construction with "Web Audio is unavailable" — an error that
    // names the wrong cause and sends whoever reads it looking in the wrong place.
    if (this.ownsContext) void this.context.close();
  }

  private scheduleBuffer(buffer: AudioBuffer): void {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);
    const startsAt = Math.max(this.context.currentTime, this.nextStartTimeSeconds);
    source.start(startsAt);
    this.nextStartTimeSeconds = startsAt + buffer.duration;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }

  var webkitAudioContext: typeof AudioContext | undefined;
}
