/**
 * The two audio legs that only exist in an external-bridge meeting.
 *
 * A bridge meeting moves sound along four paths. Two are what any meeting already does — the
 * user's real microphone goes in, and the dub meant for the user comes out of their headphones.
 * The other two are what makes it a bridge, and both are just device routing:
 *
 *   outbound   the dub meant for the far side is played into the virtual microphone Google Meet
 *              is listening to, instead of into the user's headphones.
 *   inbound    the virtual speaker Meet is playing into is captured, so the far side's voice can
 *              be fed to the pipeline like any other participant's.
 *
 * Kept out of the meeting session component on purpose. The routing is the part that has to be
 * exactly right and is testable on its own; the session is 2700 lines of LiveKit lifecycle it
 * would be buried in.
 *
 * NOT SUFFICIENT ON ITS OWN
 *   Capturing the far side is only half of the inbound leg. Publishing it needs a second LiveKit
 *   connection joined as the bridge participant, because the pipeline routes on participant
 *   identity and a second track from the user's own connection would be attributed to the user.
 *   The backend derives a token's identity from the authenticated caller
 *   (MeetingRoomService: `providerIdentity = userIdString`), so a token for the stand-in cannot
 *   currently be obtained. That endpoint is the remaining blocker and this module does not
 *   pretend otherwise — it hands back a track, and leaves publishing to a caller that has one.
 */

export interface BridgeLegHandles {
  /** The far side's audio, ready to publish once a connection exists that may publish it. */
  inboundTrack: MediaStreamTrack;
  /** Releases the capture and the playback element. Safe to call more than once. */
  stop: () => void;
}

/**
 * Sends `track` to a specific output device instead of the default one.
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

/** What an outbound-only bridge hands back. There is deliberately no track on it. */
export interface OutboundOnlyLegHandle {
  /** Stops the playback element. Safe to call more than once. */
  stop: () => void;
}

/**
 * Rung 3 of the fallback ladder: the dub goes into the meeting, and nothing comes back.
 *
 * A machine with one free virtual cable can carry the user's translated voice into Google Meet and
 * nothing else. That is a real, useful meeting — the user speaks a language the room does not —
 * and before this it was unreachable: the bridge either ran both legs or ran nothing.
 *
 * WHAT IT DOES NOT DO
 *   There is no capture here and no `inboundTrack` on the handle, because there is no second
 *   device to capture from. That absence is the type's job: a caller cannot accidentally treat
 *   this as a full bridge and then wonder why the far side is never transcribed. It is also why
 *   this is a separate function rather than `openBridgeLegs` with an optional inbound device —
 *   an optional field gets defaulted, a missing field gets noticed.
 *
 *   Publishing a far-side track would be blocked anyway; see the NOT SUFFICIENT ON ITS OWN note
 *   at the top of this file. Nothing here works around it.
 */
export async function openOutboundLegOnly(options: {
  /** Dub meant for the far side, as delivered by the meeting session. */
  farSideDubTrack: MediaStreamTrack;
  /** Virtual device the meeting app uses as its MICROPHONE. */
  outboundDeviceId: string;
}): Promise<OutboundOnlyLegHandle> {
  const playback = await playTrackToDevice(options.farSideDubTrack, options.outboundDeviceId);

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      playback.pause();
      playback.srcObject = null;
    },
  };
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

  let playback: HTMLAudioElement;
  try {
    playback = await playTrackToDevice(options.farSideDubTrack, options.outboundDeviceId);
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
      playback.pause();
      playback.srcObject = null;
    },
  };
}
