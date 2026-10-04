/**
 * The two audio legs that only exist in an external-bridge meeting.
 *
 * A bridge meeting moves sound along four paths. Two are what any meeting already does — the
 * user's real microphone goes in, and the dub meant for the user comes out of their headphones.
 * The other two are what makes it a bridge:
 *
 *   outbound   the dub meant for the far side is played into the virtual microphone Google Meet
 *              is listening to, instead of into the user's headphones.
 *   inbound    the far side's voice is captured, so it can be fed to the pipeline like any other
 *              participant's.
 *
 * Kept out of the meeting session component on purpose. The routing is the part that has to be
 * exactly right and is testable on its own; the session is 2700 lines of LiveKit lifecycle it
 * would be buried in.
 *
 * INBOUND HAS TWO SHAPES, AND ONLY ONE OF THEM LIVES HERE
 *   Where a virtual device exists — BlackHole on macOS, a second VB-CABLE on Windows — the far
 *   side arrives on an audio endpoint and `captureFarSideAudio` reads it by device id. Where it
 *   does not, Windows process loopback pulls the browser's own output and the track is assembled
 *   from raw PCM instead (`windows-loopback-pcm.ts`). Both end in a MediaStreamTrack, and
 *   `bridge-inbound-connection.ts` takes either.
 *
 * PUBLISHING IS SOMEBODY ELSE'S JOB, AND IT EXISTS
 *   Capturing the far side is only half the leg: publishing it needs a second LiveKit connection
 *   joined as the stand-in, because the pipeline routes on participant identity and a second track
 *   from the user's own connection would be attributed to the user. That used to be blocked —
 *   every endpoint derived identity from the authenticated caller — and this comment used to say
 *   so. WT-525 shipped `meetings/rooms/{id}/bridge-token` for exactly this seat, so the blocker is
 *   gone; `openBridgeInbound` is where a track becomes a published participant.
 */

export interface BridgeLegHandles {
  /** The far side's audio, ready to publish once a connection exists that may publish it. */
  inboundTrack: MediaStreamTrack;
  /** Releases the capture and the playback element. Safe to call more than once. */
  stop: () => void;
}

/**
 * Sends a LOCAL `track` — the host's own microphone — to a specific output device instead of the
 * default one. Never a track that arrived over WebRTC: that is `playRemoteTrackToDevice` below,
 * and the difference is not cosmetic.
 *
 * Returns the element it created: the audio keeps playing only while that element is alive, so a
 * caller that drops it silently loses the leg.
 */
export async function playTrackToDevice(
  track: MediaStreamTrack,
  outputDeviceId: string,
): Promise<HTMLAudioElement> {
  const element = new Audio();
  element.srcObject = new MediaStream([track]);
  element.autoplay = true;

  // Typed in lib.dom, but only actually implemented in Chromium — and the runtime is what
  // decides whether this meeting can be bridged at all.
  if (typeof element.setSinkId !== "function") {
    throw new Error(
      "This browser cannot choose an audio output device, so the meeting cannot be bridged.",
    );
  }

  await element.setSinkId(outputDeviceId);
  await element.play();
  return element;
}

/** A leg that is playing into a device. */
export interface DevicePlayback {
  /** Stops the leg and releases everything it opened. Safe to call more than once. */
  stop: () => void;
}

/** AudioContext output selection (Chromium 110+), which lib.dom does not describe yet. */
type SinkSelectingAudioContext = AudioContext & { setSinkId: (sinkId: string) => Promise<void> };
type SinkSelectingAudioContextCtor = {
  new (options?: { sinkId?: string | { type: "none" } }): SinkSelectingAudioContext;
  prototype: { setSinkId?: unknown };
};

/** How long the output may take to start before the leg is reported as failed rather than left silent. */
const REMOTE_PLAYBACK_START_TIMEOUT_MS = 2_000;

/**
 * Sends a REMOTE track — a dub LiveKit delivered over WebRTC — to a specific output device, and
 * leaves every other remote track in the page where it was.
 *
 * WHY THIS IS NOT playTrackToDevice (production, 2026-10-03: "they hear my dub, I hear none of theirs")
 *   Chromium renders every remote WebRTC audio track in a page through ONE shared output. An
 *   <audio> element playing such a track is only a volume on that mix, and `setSinkId` on any one
 *   of them moves the whole mix. So giving the host's outbound dub the cable as its sink sent
 *   everything else there too: the far side's dub, meant for the host's own speakers, played into
 *   Meet's microphone instead — and stayed there after the dub's element was gone, for as long as
 *   any remote track was still attached. Measured on the desktop's own Electron (42.11.3): two
 *   remote tracks, one element given the cable and one left on the default device — the default
 *   device's session goes inactive and the second track's signal shows up on the cable.
 *
 * WHAT IT DOES INSTEAD
 *   The track never gets a sink of its own. WebAudio carries it: an AudioContext whose output IS
 *   the device reads the track and plays it, which is a separate output stream and leaves the
 *   shared one alone.
 *
 *   The muted element is not decoration. A remote track yields samples to WebAudio only while
 *   some element is playing it (measured: without one the context runs and the device receives
 *   digital silence), and in the usual bridge call nothing else is: the host is on Text and hears
 *   no dub at all. Muted, it adds nothing to the host's speakers.
 *
 *   The context starts on no device and is moved to the cable before anything is connected, so
 *   the dub can never reach the default output on the way, and a device that has gone rejects
 *   here (`setSinkId` → NotFoundError) instead of leaving a context that silently never starts.
 */
export async function playRemoteTrackToDevice(
  track: MediaStreamTrack,
  outputDeviceId: string,
): Promise<DevicePlayback> {
  const AudioContextCtor = (typeof AudioContext === "undefined" ? undefined : AudioContext) as
    | SinkSelectingAudioContextCtor
    | undefined;
  if (!AudioContextCtor || typeof AudioContextCtor.prototype.setSinkId !== "function") {
    throw new Error(
      "This browser cannot choose an audio output device, so the meeting cannot be bridged.",
    );
  }

  const keepAlive = new Audio();
  keepAlive.muted = true;
  keepAlive.srcObject = new MediaStream([track]);

  let context: SinkSelectingAudioContext | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    keepAlive.pause();
    keepAlive.srcObject = null;
    // Closing releases the device; a context left open keeps the cable busy for the next leg.
    void context?.close().catch(() => undefined);
  };

  try {
    await keepAlive.play();
    context = new AudioContextCtor({ sinkId: { type: "none" } });
    await context.setSinkId(outputDeviceId);
    context.createMediaStreamSource(new MediaStream([track])).connect(context.destination);
    // A context the browser will not start plays nothing and says nothing: `resume()` simply
    // never settles. Bounded, so that is an error the caller can show rather than a silent leg.
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      context.resume(),
      new Promise<void>((resolve) => {
        startTimer = setTimeout(resolve, REMOTE_PLAYBACK_START_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(startTimer);
    if (context.state !== "running") {
      throw new Error("The audio output for your meeting's microphone did not start.");
    }
  } catch (error) {
    stop();
    throw error;
  }

  return { stop };
}

/**
 * Opens the virtual speaker Meet plays into, and returns its audio as a publishable track.
 *
 * Every processing option is off. They exist to make a human voice picked up by a real microphone
 * sound better; here the source is already-clean digital audio arriving from a conference app, and
 * echo cancellation in particular would treat it as echo of the outbound leg and gate it away.
 */
export async function captureFarSideAudio(inputDeviceId: string): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: inputDeviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const [track] = stream.getAudioTracks();
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("The virtual speaker produced no audio track.");
  }
  return track;
}

/**
 * Wires both bridge-only legs and returns what the caller needs to publish and to tear down.
 *
 * Ordering matters: capture first, then playback. If playback started first and capture then
 * failed, the dub would already be going into a device nobody was listening to — the far side
 * would hear a translation while the user heard nothing back and had no error to explain it.
 */
export async function openBridgeLegs(options: {
  /** Dub meant for the far side, as delivered by the meeting session. */
  farSideDubTrack: MediaStreamTrack;
  /** Virtual device Meet uses as its MICROPHONE. */
  outboundDeviceId: string;
  /** Virtual device Meet uses as its SPEAKER. */
  inboundDeviceId: string;
}): Promise<BridgeLegHandles> {
  const inboundTrack = await captureFarSideAudio(options.inboundDeviceId);

  // The dub is a remote track: it must not be given a sink of its own (playRemoteTrackToDevice).
  let playback: DevicePlayback;
  try {
    playback = await playRemoteTrackToDevice(options.farSideDubTrack, options.outboundDeviceId);
  } catch (error) {
    inboundTrack.stop();
    throw error;
  }

  let stopped = false;
  return {
    inboundTrack,
    stop: () => {
      if (stopped) return;
      stopped = true;
      inboundTrack.stop();
      playback.stop();
    },
  };
}
