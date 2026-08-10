export type VoiceSampleAssessment = {
  accepted: boolean;
  message: string;
  durationSeconds: number;
  activeSpeechRatio: number;
};

const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 120;
const MIN_RMS = 0.008;
const MIN_ACTIVE_SPEECH_RATIO = 0.18;
const MAX_CLIPPED_RATIO = 0.02;
const MIN_ACTIVE_ENERGY_VARIATION = 0.08;

export function assessPcmVoiceSample(
  samples: Float32Array,
  sampleRate: number,
): VoiceSampleAssessment {
  const durationSeconds = sampleRate > 0 ? samples.length / sampleRate : 0;
  if (durationSeconds < MIN_DURATION_SECONDS) {
    return reject("Record at least 5 seconds of clear speech.", durationSeconds, 0);
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return reject("Keep the voice sample under 2 minutes.", durationSeconds, 0);
  }

  let squareSum = 0;
  let clipped = 0;
  for (const sample of samples) {
    squareSum += sample * sample;
    if (Math.abs(sample) >= 0.98) clipped += 1;
  }
  const rms = Math.sqrt(squareSum / Math.max(samples.length, 1));
  if (rms < MIN_RMS) {
    return reject("No clear human speech was detected. Speak closer to the microphone.", durationSeconds, 0);
  }
  if (clipped / samples.length > MAX_CLIPPED_RATIO) {
    return reject("The recording is distorted. Lower the input volume and try again.", durationSeconds, 0);
  }

  const frameSize = Math.max(1, Math.round(sampleRate * 0.02));
  let activeFrames = 0;
  let totalFrames = 0;
  const activeFrameLevels: number[] = [];
  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const end = Math.min(samples.length, offset + frameSize);
    let frameSquareSum = 0;
    for (let index = offset; index < end; index += 1) {
      frameSquareSum += samples[index] * samples[index];
    }
    const frameRms = Math.sqrt(frameSquareSum / Math.max(1, end - offset));
    if (frameRms >= MIN_RMS) {
      activeFrames += 1;
      activeFrameLevels.push(frameRms);
    }
    totalFrames += 1;
  }

  const activeSpeechRatio = activeFrames / Math.max(totalFrames, 1);
  if (activeSpeechRatio < MIN_ACTIVE_SPEECH_RATIO) {
    return reject("The sample contains too little clear speech or too much background noise.", durationSeconds, activeSpeechRatio);
  }

  const meanActiveLevel = activeFrameLevels.reduce((sum, level) => sum + level, 0)
    / Math.max(activeFrameLevels.length, 1);
  const activeLevelDeviation = Math.sqrt(
    activeFrameLevels.reduce((sum, level) => sum + (level - meanActiveLevel) ** 2, 0)
      / Math.max(activeFrameLevels.length, 1),
  );
  const activeEnergyVariation = activeLevelDeviation / Math.max(meanActiveLevel, Number.EPSILON);
  if (activeEnergyVariation < MIN_ACTIVE_ENERGY_VARIATION) {
    return reject(
      "No natural speech pattern was detected. Read the sample paragraph in your normal voice.",
      durationSeconds,
      activeSpeechRatio,
    );
  }

  return {
    accepted: true,
    message: "Voice sample quality looks usable. Use one speaker and avoid music or background voices.",
    durationSeconds,
    activeSpeechRatio,
  };
}

function reject(
  message: string,
  durationSeconds: number,
  activeSpeechRatio: number,
): VoiceSampleAssessment {
  return { accepted: false, message, durationSeconds, activeSpeechRatio };
}

export async function analyzeVoiceSample(file: File): Promise<VoiceSampleAssessment> {
  const audioContext = new AudioContext();
  try {
    const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        mono[index] += data[index] / buffer.numberOfChannels;
      }
    }
    return assessPcmVoiceSample(mono, buffer.sampleRate);
  } catch {
    return reject("The audio file could not be decoded. Use WAV, MP3, M4A, OGG, or WebM.", 0, 0);
  } finally {
    await audioContext.close();
  }
}
