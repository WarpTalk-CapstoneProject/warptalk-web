import type { WindowsLoopbackPcmChunk } from "@/lib/desktop/bridge";

export interface WindowsLoopbackPcmFrame {
  samples: Float32Array | readonly number[];
  sampleRate: number;
  channelCount: number;
  capturedAtMs: number;
}

export interface WindowsLoopbackPcmBridgeOptions {
  audioContext?: AudioContext;
  silenceGapThresholdMs?: number;
}

export interface SilencePaddingPlan {
  startsAtMs: number;
  durationMs: number;
  sampleCount: number;
}

const DEFAULT_SILENCE_GAP_THRESHOLD_MS = 20;

function frameDurationMs(frame: Pick<WindowsLoopbackPcmFrame, "samples" | "sampleRate" | "channelCount">): number {
  if (frame.sampleRate <= 0 || frame.channelCount <= 0) return 0;
  return (frame.samples.length / frame.channelCount / frame.sampleRate) * 1000;
}

export function planSilencePadding(
  previousFrame: WindowsLoopbackPcmFrame | null,
  nextFrame: WindowsLoopbackPcmFrame,
  thresholdMs = DEFAULT_SILENCE_GAP_THRESHOLD_MS,
): SilencePaddingPlan | null {
  if (!previousFrame) return null;
  if (previousFrame.sampleRate !== nextFrame.sampleRate) return null;
  if (previousFrame.channelCount !== nextFrame.channelCount) return null;

  const previousEndsAtMs = previousFrame.capturedAtMs + frameDurationMs(previousFrame);
  const gapMs = nextFrame.capturedAtMs - previousEndsAtMs;
  if (gapMs <= thresholdMs) return null;

  const sampleCount = Math.round((gapMs / 1000) * nextFrame.sampleRate) * nextFrame.channelCount;
  return {
    startsAtMs: previousEndsAtMs,
    durationMs: gapMs,
    sampleCount,
  };
}

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
  private readonly silenceGapThresholdMs: number;
  private previousFrame: WindowsLoopbackPcmFrame | null = null;
  private nextStartTimeSeconds: number;

  constructor(options: WindowsLoopbackPcmBridgeOptions = {}) {
    const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!options.audioContext && !AudioContextCtor) {
      throw new Error("Web Audio is unavailable; Windows loopback PCM cannot become a track.");
    }

    this.context = options.audioContext ?? new AudioContextCtor();
    this.destination = this.context.createMediaStreamDestination();
    this.silenceGapThresholdMs =
      options.silenceGapThresholdMs ?? DEFAULT_SILENCE_GAP_THRESHOLD_MS;
    this.nextStartTimeSeconds = this.context.currentTime;
  }

  get track(): MediaStreamTrack {
    const [track] = this.destination.stream.getAudioTracks();
    if (!track) throw new Error("PCM destination did not produce an audio track.");
    return track;
  }

  pushFrame(frame: WindowsLoopbackPcmFrame): void {
    const padding = planSilencePadding(this.previousFrame, frame, this.silenceGapThresholdMs);
    if (padding) {
      this.scheduleBuffer(
        this.context.createBuffer(
          frame.channelCount,
          padding.sampleCount / frame.channelCount,
          frame.sampleRate,
        ),
      );
    }

    const frameBuffer = this.context.createBuffer(
      frame.channelCount,
      Math.ceil(frame.samples.length / frame.channelCount),
      frame.sampleRate,
    );
    copyInterleavedSamplesToBuffer(frameBuffer, frame.samples, frame.channelCount);
    this.scheduleBuffer(frameBuffer);
    this.previousFrame = frame;
  }

  close(): void {
    this.track.stop();
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
