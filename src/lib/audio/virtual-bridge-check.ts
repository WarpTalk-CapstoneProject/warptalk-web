/**
 * Proving that the virtual audio devices an external meeting rides on actually carry sound.
 *
 * An EXTERNAL_BRIDGE meeting runs over two virtual devices: WarpTalk writes the dubbed voice into
 * the outbound one and Google Meet reads it as a microphone; Meet writes its own output into the
 * inbound one and WarpTalk reads that back. Neither leg is visible from inside the app, so
 * "configured" and "working" are different claims and the wizard must not conflate them.
 *
 * The check here plays a tone into a device and listens on the same device's input side. A virtual
 * audio device is a loopback by construction, so anything written to it comes back out; a device
 * that is present in the picker but not carrying signal fails this and a device that works passes
 * it. That is the strongest evidence obtainable without leaving the browser.
 *
 * What it cannot prove is the last leg: whether Google Meet, in its own page, has been pointed at
 * these devices. Nothing here can see into that. The wizard says so rather than showing a green
 * tick that means less than it appears to.
 */

/** Names as CoreAudio reports them, which is also what the Meet device picker shows. */
export const OUTBOUND_DEVICE_LABEL = "BlackHole 2ch";
export const INBOUND_DEVICE_LABEL = "BlackHole 16ch";

/** Windows exposes the free VB-CABLE as two endpoints with opposite names.
 * WarpTalk writes to CABLE Input; the meeting app reads that signal as CABLE Output.
 */
export const WINDOWS_OUTBOUND_SINK_LABEL = "CABLE Input (VB-Audio Virtual Cable)";
export const WINDOWS_OUTBOUND_CAPTURE_LABEL = "CABLE Output (VB-Audio Virtual Cable)";

/**
 * Four names, because a device has a different name depending on who is being told about it.
 *
 * On macOS the distinction is invisible: BlackHole is one duplex device, so what WarpTalk writes
 * into and what the user picks in Meet are the same string, and it was reasonable to keep a single
 * label per leg. Windows breaks that. The free VB-CABLE is one cable with two endpoint names, and
 * they are the opposite way round from what the routing does — WarpTalk plays into `CABLE Input`
 * and Meet reads that signal as `CABLE Output`. A single label per leg has to be wrong for one of
 * the two audiences, and the one it was wrong for was the user, who was being shown the name of a
 * device they must not select.
 *
 * So the routing names and the instruction names are separate fields. Anything calling `setSinkId`
 * or `getUserMedia` wants the first pair; anything printing a sentence for a human wants the
 * second.
 */
export type BridgeDeviceLabels = {
  /** The device WarpTalk plays the dub INTO. Looked up as an output. */
  outboundSink: string;
  /** The device WarpTalk records the far side FROM, or null where loopback does that job. */
  inboundCapture: string | null;
  /** What the user selects as the meeting app's MICROPHONE. */
  meetMicrophone: string;
  /** What the user selects as the meeting app's SPEAKER, or null where they change nothing. */
  meetSpeaker: string | null;
};

export function bridgeDeviceLabelsForPlatform(platform: string): BridgeDeviceLabels {
  if (/windows|win32|win64/i.test(platform)) {
    return {
      outboundSink: WINDOWS_OUTBOUND_SINK_LABEL,
      // The free VB-CABLE has one cable. Windows captures the far side with process loopback.
      inboundCapture: null,
      meetMicrophone: WINDOWS_OUTBOUND_CAPTURE_LABEL,
      // Nothing to change: process loopback reads the browser's own output, so the user keeps
      // their real speakers and can still hear the meeting. Telling them to point Meet at a
      // virtual device here would make the call inaudible for no gain.
      meetSpeaker: null,
    };
  }

  return {
    outboundSink: OUTBOUND_DEVICE_LABEL,
    inboundCapture: INBOUND_DEVICE_LABEL,
    meetMicrophone: OUTBOUND_DEVICE_LABEL,
    meetSpeaker: INBOUND_DEVICE_LABEL,
  };
}

/**
 * The labels for the machine this is running on.
 *
 * Exported because the copy in toasts and in the setup wizard has to match the platform too — it
 * used to name the macOS devices unconditionally, so a Windows user with no VB-CABLE was told to
 * install BlackHole, which does not exist for Windows. Callers that render this during SSR must
 * resolve it after mount: `navigator` is absent on the server and the fallback below is macOS.
 */
export function currentBridgeDeviceLabels(): BridgeDeviceLabels {
  if (typeof navigator === "undefined") {
    return bridgeDeviceLabelsForPlatform("");
  }

  return bridgeDeviceLabelsForPlatform(`${navigator.userAgent} ${navigator.platform}`);
}

/** Well clear of speech formants and of mains hum, so a false pass is unlikely. */
const PROBE_FREQUENCY_HZ = 440;
const PROBE_DURATION_MS = 700;
/**
 * Ratio of energy in the probe bin to the mean across the spectrum. A silent or disconnected
 * capture sits near 1; a device genuinely carrying the tone runs far above it. Set well below what
 * a working device produces so a quiet system volume does not read as a failure.
 */
const MIN_TONE_DOMINANCE = 8;

export type BridgeLeg = "outbound" | "inbound";

export interface DeviceProbe {
  leg: BridgeLeg;
  expectedLabel: string;
  /** Present in enumerateDevices, i.e. the driver is installed and the OS is offering it. */
  present: boolean;
  /** Signal written to it came back out. Null when not attempted because it is absent. */
  carriesSignal: boolean | null;
  /** Set when the probe could not be run at all, as opposed to running and failing. */
  error?: string;
}

export interface BridgeCheckResult {
  probes: DeviceProbe[];
  /** Both legs present and both carrying signal. */
  ready: boolean;
  /**
   * Device labels are empty strings until microphone permission has been granted, so a check run
   * before that reports everything absent. Callers prompt instead of showing a false negative.
   */
  needsPermission: boolean;
}

function findDeviceId(devices: MediaDeviceInfo[], label: string, kind: MediaDeviceKind): string | null {
  const match = devices.find(
    (device) => device.kind === kind && device.label.toLowerCase().includes(label.toLowerCase()),
  );
  return match?.deviceId ?? null;
}

/**
 * The two device ids the bridge legs need, or null for whichever is not installed.
 *
 * Separate from `checkVirtualBridge` because the two answer different questions and cost very
 * different amounts. This one only reads the device list — cheap enough to run on entering a
 * room. The check plays a tone through each device and listens for it, which takes about a
 * second per leg and holds the devices open, so it belongs to the setup wizard.
 *
 * A caller that only needs to ROUTE audio wants this one: routing to a device that is present but
 * silently not carrying is a wizard problem to diagnose, not a reason to refuse to route.
 *
 * Note the kinds are crossed on purpose. The device Meet uses as its MICROPHONE is something
 * WarpTalk plays INTO, so it is looked up as an output; the device Meet uses as its SPEAKER is
 * something WarpTalk records FROM, so it is looked up as an input.
 */
export async function findBridgeDeviceIds(): Promise<{
  outboundDeviceId: string | null;
  inboundDeviceId: string | null;
}> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return { outboundDeviceId: null, inboundDeviceId: null };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const labels = currentBridgeDeviceLabels();
  return {
    outboundDeviceId: findDeviceId(devices, labels.outboundSink, "audiooutput"),
    inboundDeviceId: labels.inboundCapture
      ? findDeviceId(devices, labels.inboundCapture, "audioinput")
      : null,
  };
}

/**
 * Plays a tone into `deviceId`'s output and listens on its input, returning whether the tone came
 * back. Everything it opens is closed on every path, including the failures — a leaked
 * AudioContext keeps the virtual device busy and the next attempt then fails for the wrong reason.
 */
async function probeLoopback(outputDeviceId: string, inputDeviceId: string): Promise<boolean> {
  let context: AudioContext | null = null;
  let capture: MediaStream | null = null;
  let element: HTMLAudioElement | null = null;

  try {
    capture = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: inputDeviceId },
        // The point is to measure what the device carries, so nothing may alter it on the way in.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = PROBE_FREQUENCY_HZ;

    const sink = context.createMediaStreamDestination();
    oscillator.connect(sink);

    element = new Audio();
    element.srcObject = sink.stream;
    // Not in every browser's lib.dom yet, though Chromium has had it for years.
    const routable = element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (typeof routable.setSinkId !== "function") {
      throw new Error("This browser cannot choose an audio output device.");
    }
    await routable.setSinkId(outputDeviceId);
    await element.play();
    oscillator.start();

    const analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    context.createMediaStreamSource(capture).connect(analyser);

    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const binWidth = context.sampleRate / analyser.fftSize;
    const probeBin = Math.round(PROBE_FREQUENCY_HZ / binWidth);

    // Sample repeatedly rather than once: the device takes a moment to start carrying, and one
    // badly-timed frame would report a working bridge as broken.
    const deadline = performance.now() + PROBE_DURATION_MS;
    let best = 0;
    while (performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      analyser.getFloatFrequencyData(spectrum);

      // getFloatFrequencyData is in dB; compare in linear power so the ratio means something.
      const linear = Array.from(spectrum, (db) => 10 ** (db / 10));
      const mean = linear.reduce((sum, value) => sum + value, 0) / linear.length;
      if (mean > 0) {
        best = Math.max(best, linear[probeBin] / mean);
      }
    }

    oscillator.stop();
    return best >= MIN_TONE_DOMINANCE;
  } finally {
    capture?.getTracks().forEach((track) => track.stop());
    if (element) {
      element.pause();
      element.srcObject = null;
    }
    await context?.close();
  }
}

export async function checkVirtualBridge(): Promise<BridgeCheckResult> {
  const labels = currentBridgeDeviceLabels();
  const legs = labels.inboundCapture
    ? [
        {
          leg: "outbound" as const,
          expectedLabel: labels.outboundSink,
          outputLabel: labels.outboundSink,
          inputLabel: labels.outboundSink,
        },
        {
          leg: "inbound" as const,
          expectedLabel: labels.inboundCapture,
          outputLabel: labels.inboundCapture,
          inputLabel: labels.inboundCapture,
        },
      ]
    : [
        {
          leg: "outbound" as const,
          expectedLabel: WINDOWS_OUTBOUND_CAPTURE_LABEL,
          outputLabel: labels.outboundSink,
          inputLabel: WINDOWS_OUTBOUND_CAPTURE_LABEL,
        },
      ];

  const devices = await navigator.mediaDevices.enumerateDevices();
  const needsPermission = devices.every((device) => device.label === "");

  const probes: DeviceProbe[] = [];
  for (const { leg, expectedLabel, outputLabel, inputLabel } of legs) {
    const outputId = findDeviceId(devices, outputLabel, "audiooutput");
    const inputId = findDeviceId(devices, inputLabel, "audioinput");

    if (!outputId || !inputId) {
      probes.push({ leg, expectedLabel, present: false, carriesSignal: null });
      continue;
    }

    try {
      probes.push({
        leg,
        expectedLabel,
        present: true,
        carriesSignal: await probeLoopback(outputId, inputId),
      });
    } catch (error) {
      probes.push({
        leg,
        expectedLabel,
        present: true,
        carriesSignal: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    probes,
    ready: probes.every((probe) => probe.present && probe.carriesSignal === true),
    needsPermission,
  };
}
