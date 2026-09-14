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

/**
 * Names as CoreAudio reports them, which is also what the Meet device picker shows.
 *
 * WarpTalk's own macOS devices: BlackHole's source built under WarpTalk's names by the desktop
 * app (warptalk-desktop/scripts/build-mac-audio-driver.sh) and installed from inside it.
 */
export const OUTBOUND_DEVICE_LABEL = "WarpTalk Microphone";
export const INBOUND_DEVICE_LABEL = "WarpTalk Speaker";

/** Upstream BlackHole, which every Mac set up before the rename has, and which still works. */
export const LEGACY_OUTBOUND_DEVICE_LABEL = "BlackHole 2ch";
export const LEGACY_INBOUND_DEVICE_LABEL = "BlackHole 16ch";

/** Windows exposes the free VB-CABLE as two endpoints with opposite names.
 * WarpTalk writes to CABLE Input; the meeting app reads that signal as CABLE Output.
 */
export const WINDOWS_OUTBOUND_SINK_LABEL = "CABLE Input (VB-Audio Virtual Cable)";
export const WINDOWS_OUTBOUND_CAPTURE_LABEL = "CABLE Output (VB-Audio Virtual Cable)";

/**
 * The second free cable on Windows, which carries the far side back: Google Meet plays into Hi-Fi
 * Cable Input and WarpTalk records Hi-Fi Cable Output. Same opposite-names shape as VB-CABLE.
 *
 * WHY A SECOND CABLE WHEN LOOPBACK EXISTS
 *   Process loopback takes the whole browser, so every other audible tab reaches the pipeline as
 *   the far side's speech, and the host hears Meet and the dub stacked with no way to lower one.
 *   Pointing Meet's own speaker picker at a cable scopes the capture to the Meet tab, and hands the
 *   host's ears to WarpTalk, which can then duck the original under the translation.
 *
 * WHY THESE ARE SHORTER THAN THE VB-CABLE NAMES
 *   Matched as a substring, and without the "(VB-Audio …)" suffix on purpose: the exact suffix this
 *   driver reports on Windows 10/11 has not been checked on a real machine. The stem alone cannot
 *   collide with VB-CABLE — "hi-fi cable output" is not inside "cable output (vb-audio virtual
 *   cable)", and the full VB-CABLE names are not inside these.
 */
export const WINDOWS_INBOUND_SINK_LABEL = "Hi-Fi Cable Input";
export const WINDOWS_INBOUND_CAPTURE_LABEL = "Hi-Fi Cable Output";

/** Where both free Windows cables are published. */
export const WINDOWS_CABLES_DOWNLOAD_PAGE = "https://vb-audio.com/Cable/";

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
  /**
   * Whether the bridge still hears the far side when the inbound device is absent.
   *
   * True on Windows only: without Hi-Fi Cable, process loopback takes over. A missing inbound
   * device there costs scope, not a direction, so it must not block the wizard — and the user must
   * not be told to point Meet's speaker at a device that is not installed, which would make the
   * call inaudible.
   */
  inboundOptional: boolean;
  /** Which install instructions apply. The device names alone cannot say it without re-parsing. */
  platform: "windows" | "macos";
};

export function bridgeDeviceLabelsForPlatform(platform: string): BridgeDeviceLabels {
  if (/windows|win32|win64/i.test(platform)) {
    return {
      outboundSink: WINDOWS_OUTBOUND_SINK_LABEL,
      inboundCapture: WINDOWS_INBOUND_CAPTURE_LABEL,
      meetMicrophone: WINDOWS_OUTBOUND_CAPTURE_LABEL,
      meetSpeaker: WINDOWS_INBOUND_SINK_LABEL,
      inboundOptional: true,
      platform: "windows",
    };
  }

  return {
    outboundSink: OUTBOUND_DEVICE_LABEL,
    inboundCapture: INBOUND_DEVICE_LABEL,
    meetMicrophone: OUTBOUND_DEVICE_LABEL,
    meetSpeaker: INBOUND_DEVICE_LABEL,
    inboundOptional: false,
    platform: "macos",
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

/**
 * The labels for the devices this Mac actually has, when it was set up with BlackHole.
 *
 * The pair is swapped as a pair, and only when WarpTalk's own outbound device is absent and
 * BlackHole's is present: a Mac with both keeps WarpTalk's names, and a Mac with neither is told
 * the new ones. Swapping one leg alone would route the dub into one driver while telling the user
 * to pick the other driver's device in Meet.
 */
export function resolveBridgeDeviceLabels(
  labels: BridgeDeviceLabels,
  availableDeviceLabels: readonly string[],
): BridgeDeviceLabels {
  if (labels.platform !== "macos") return labels;
  const has = (label: string) =>
    availableDeviceLabels.some((available) => available.toLowerCase().includes(label.toLowerCase()));
  if (has(OUTBOUND_DEVICE_LABEL) || !has(LEGACY_OUTBOUND_DEVICE_LABEL)) return labels;
  return {
    ...labels,
    outboundSink: LEGACY_OUTBOUND_DEVICE_LABEL,
    inboundCapture: LEGACY_INBOUND_DEVICE_LABEL,
    meetMicrophone: LEGACY_OUTBOUND_DEVICE_LABEL,
    meetSpeaker: LEGACY_INBOUND_DEVICE_LABEL,
  };
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
  /** Absent is acceptable for this leg; see `BridgeDeviceLabels.inboundOptional`. */
  optional?: boolean;
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
  /**
   * The names this check actually probed, after `resolveBridgeDeviceLabels`. Instructions should
   * use these: on a Mac set up with BlackHole they name BlackHole, not devices that are not there.
   */
  labels?: BridgeDeviceLabels;
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
  const labels = resolveBridgeDeviceLabels(
    currentBridgeDeviceLabels(),
    devices.map((device) => device.label),
  );
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

export interface BridgeProbeLeg {
  leg: BridgeLeg;
  /** The name shown to the user: what they pick in the meeting app. */
  expectedLabel: string;
  /** The endpoint the probe tone is played INTO. */
  outputLabel: string;
  /** The endpoint the probe listens on. */
  inputLabel: string;
  optional: boolean;
}

/**
 * Which endpoints each leg is probed across.
 *
 * A cable is played into on one name and read on the other. On macOS the two names coincide
 * (BlackHole is one duplex device); on Windows they are opposite, so each leg is probed from the
 * name WarpTalk or Meet writes into to the name the other side reads — the same pair the meeting
 * itself uses.
 */
export function bridgeProbeLegs(labels: BridgeDeviceLabels): BridgeProbeLeg[] {
  const legs: BridgeProbeLeg[] = [
    {
      leg: "outbound",
      expectedLabel: labels.meetMicrophone,
      outputLabel: labels.outboundSink,
      inputLabel: labels.meetMicrophone,
      optional: false,
    },
  ];
  if (labels.inboundCapture) {
    const sink = labels.meetSpeaker ?? labels.inboundCapture;
    legs.push({
      leg: "inbound",
      expectedLabel: sink,
      outputLabel: sink,
      inputLabel: labels.inboundCapture,
      optional: labels.inboundOptional,
    });
  }
  return legs;
}

/**
 * Every required leg carries sound, and an optional leg is either absent or carries sound too.
 *
 * An optional device that is present but silent is NOT acceptable: `findBridgeDeviceIds` will find
 * it and route the far side through it, so a broken Hi-Fi Cable would silence the meeting rather
 * than fall back to loopback.
 */
export function isBridgeCheckReady(probes: readonly DeviceProbe[]): boolean {
  return probes.every(
    (probe) => (probe.optional === true && !probe.present) || (probe.present && probe.carriesSignal === true),
  );
}

export async function checkVirtualBridge(): Promise<BridgeCheckResult> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const needsPermission = devices.every((device) => device.label === "");
  const labels = resolveBridgeDeviceLabels(
    currentBridgeDeviceLabels(),
    devices.map((device) => device.label),
  );
  const legs = bridgeProbeLegs(labels);

  const probes: DeviceProbe[] = [];
  for (const { leg, expectedLabel, outputLabel, inputLabel, optional } of legs) {
    const outputId = findDeviceId(devices, outputLabel, "audiooutput");
    const inputId = findDeviceId(devices, inputLabel, "audioinput");

    if (!outputId || !inputId) {
      probes.push({ leg, expectedLabel, present: false, carriesSignal: null, optional });
      continue;
    }

    try {
      probes.push({
        leg,
        expectedLabel,
        present: true,
        carriesSignal: await probeLoopback(outputId, inputId),
        optional,
      });
    } catch (error) {
      probes.push({
        leg,
        expectedLabel,
        present: true,
        carriesSignal: null,
        error: error instanceof Error ? error.message : String(error),
        optional,
      });
    }
  }

  return {
    probes,
    ready: isBridgeCheckReady(probes),
    needsPermission,
    labels,
  };
}
