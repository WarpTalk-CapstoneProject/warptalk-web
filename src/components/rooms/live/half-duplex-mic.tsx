"use client";

import { useEffect, useRef } from "react";
import { ParticipantEvent, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { useMaybeRoomContext } from "@livekit/components-react";

import { BargeInDetector, combineRms, rms } from "@/lib/meeting/barge-in";
import { MicGate } from "@/lib/meeting/mic-gate";

/**
 * Stops the microphone carrying the room's own translation back into the room.
 *
 * THE DEFECT THIS EXISTS FOR
 *   A listener hears the far side's dub through their SPEAKERS. Their microphone picks that dub
 *   up, publishes it, and the pipeline transcribes it — attributed to THEM, because it arrived on
 *   their track. In a live session that produced a transcript of short Vietnamese fragments
 *   ("vườn.", "Đơn giản.", "Trong.", "Ừ.") credited to a person who had not spoken, while the
 *   other participant was speaking English.
 *
 *   It does not stop there. `stt_worker` learns a per-speaker language override when speech
 *   contradicts the declared language, and those fragments are exactly such evidence — so the
 *   listener gets pinned to the dub's language. Once source and target match, nothing is
 *   translated at all. The reported "it worked for a while and then stopped translating" is the
 *   second half of this same loop.
 *
 * WHY NOT LEAVE IT TO ECHO CANCELLATION
 *   Browser AEC is modelled on a near-field talker and a modest speaker, and it is applied
 *   BEFORE the signal is loud enough to matter. Synthesised speech at conversational volume
 *   through laptop speakers routinely defeats it. Every conferencing product that plays audio
 *   into a room has some form of this gate; ours can be exact, because we know precisely which
 *   tracks are ours and when they are sounding.
 *
 * HOW IT GATES, AND WHY THIS PRIMITIVE
 *   `mediaStreamTrack.enabled = false` — not LiveKit's publication toggle, and not the LiveKit
 *   track's own mute.
 *
 *   Unpublishing would change `microphoneTrackSid`, which re-runs the Krisp/track-processor
 *   effect and re-attaches a noise filter several times a minute. Muting through LiveKit would
 *   broadcast the user as muted and flip the mic button in everyone's roster, several times a
 *   minute, for something that is not a mute.
 *
 *   Disabling the underlying track sends silence and touches nothing else: the publication
 *   stays, the SFU keeps routing, the ingress worker's VAD sees silence and never opens a chunk,
 *   and no UI anywhere changes. It is the smallest thing that removes the audio.
 *
 * WHICH TRACK, AND WHO GIVES IT BACK
 *   `LocalTrack.mediaStreamTrack` is the track that leaves the machine: the noise filter's OUTPUT
 *   while a filter is attached (livekit-client 2.x: `processor?.processedTrack ??
 *   _mediaStreamTrack`), the raw capture otherwise. LiveKit's own mute and unmute only ever flip
 *   `enabled` on the RAW capture. So with the filter on — the default — the flag this gate holds
 *   down is one that nothing else in the page will ever lift.
 *
 *   That produced a microphone that stayed silent until the page was reloaded. As first written,
 *   the gate remembered only THAT it was holding the microphone, and on release re-enabled
 *   whatever track it found at that moment — unless the user was muted, in which case it did
 *   nothing, "because their mute outranks ours". A listener who muted while a dub was playing and
 *   was still muted when the gate period ended therefore kept a disabled filter output with no
 *   one left to enable it; their unmute brought back the raw track only. The mic button showed
 *   on, the published track carried silence, the ingress VAD never opened a chunk — no
 *   transcript, no translation, no dub, for the rest of the meeting. Reloading built new tracks.
 *   The same loss was reachable without touching mute: the filter attaching mid-dub left the RAW
 *   track disabled behind the new output, and release only enabled the output.
 *
 *   The gate now keeps the track OBJECTS it disabled (lib/meeting/mic-gate.ts) and gives back
 *   exactly those — when the gate opens, and at once when the microphone moves to a different
 *   object underneath it (filter attached or removed, device switched, track restarted). It
 *   never enables a track it did not itself disable, so a mute it found in place stays in place.
 *
 *   Releasing under the user's mute is safe, and it is the point: re-enabling the filter's output
 *   cannot be heard, because the mute holds its INPUT (the raw track) down. The one track that
 *   must not be re-enabled under a mute is the raw capture itself — gated when no filter is
 *   attached — since that flag now IS the user's mute. It is left alone and dropped from the
 *   books; LiveKit's unmute sets it back. Nothing here ever calls LiveKit's mute or unmute.
 *
 * THE TRADE-OFF, AND WHY IT IS NO LONGER ALL-OR-NOTHING
 *   As first written this was strict half duplex: while a dub sounded, this microphone was not
 *   heard at all, for the whole dub plus the hangover. Whatever a listener said in that window
 *   was never sent, so it was never transcribed, translated or dubbed. Dubs arrive 2-8 s (up to
 *   ~24 s) after the speech they translate, so replies very often start while one is playing —
 *   testers heard it as "the clone voice skips segments", and nothing on the server could show
 *   the loss, because the audio never left this machine.
 *
 *   The gate now has a BARGE-IN (lib/meeting/barge-in.ts). While it is shut, the microphone is
 *   still measured — on a clone of the track, which the gate does not silence — and so is the
 *   dub being played. Echo is the dub, attenuated by an echo path whose gain is learned per
 *   microphone; speech clearly louder than that predicted echo, for longer than one syllable, is
 *   a person, and the gate opens for them until they stop. A listener already mid-sentence when
 *   a late dub arrives keeps the microphone the same way instead of being cut off.
 *
 *   Headsets produce almost no echo, so their learned gain is tiny and ordinary speech opens the
 *   gate at once. Laptop speakers at volume produce a lot, and only speech well above its own
 *   echo gets through. Every uncertain state — not calibrated yet, a dub whose audio cannot be
 *   measured, speech that is not clearly louder than the echo — keeps the gate shut, i.e. falls
 *   back to exactly the old behaviour, never to an open microphone. The server-side dub-echo
 *   guard in stt_worker (`_matches_recent_dub`) remains the backstop for what a barge-in lets
 *   through alongside the listener's voice.
 */

/**
 * How long after the dub falls silent before the microphone is live again.
 *
 * Long enough to ride out the gaps between sentences of one dubbed utterance — reopening inside
 * them would let exactly the fragments this prevents back through. Short enough that answering
 * does not feel gated.
 */
const RELEASE_HANGOVER_MS = 450;

/**
 * How often the barge-in measures, while a gate period is running and only then. The analyser
 * window (2048 samples, ~43 ms at 48 kHz) covers most of a tick. A timer, not animation frames: those
 * stop in a background tab, and a meeting tab is often in the background. A tab playing audio
 * is exempt from timer throttling, and a gate period only exists while a dub is playing.
 */
const BARGE_IN_TICK_MS = 50;

type LevelProbe = { node: MediaStreamAudioSourceNode; analyser: AnalyserNode };

export function HalfDuplexMic({
  dubIdentities,
  enabled,
}: {
  /** Interpreter identities currently being played to this listener's own output. */
  dubIdentities: string[];
  /** False in a room with no pipeline running — there are no dubs, so there is nothing to gate. */
  enabled: boolean;
}) {
  const room = useMaybeRoomContext();

  // Read through refs so a changing dub list does not tear down and rebuild the listeners on
  // every render — the identity set changes whenever an interpreter bot appears or leaves.
  const dubIdentitiesRef = useRef(dubIdentities);
  // Synced in an effect, not during render. The listeners below read this ref rather than closing
  // over the prop so that a dub bot appearing or leaving does not tear down and rebuild every
  // subscription — but writing a ref while rendering is the thing that makes a component fail to
  // update, so the write belongs here.
  useEffect(() => {
    dubIdentitiesRef.current = dubIdentities;
  }, [dubIdentities]);

  /**
   * True while the gate is meant to be shut. WHICH tracks it has actually disabled — and so which
   * it must give back — is the MicGate's business, not this flag's: a user's own mute is never
   * touched because a track found already disabled is never recorded there.
   */
  const gatedRef = useRef(false);
  /**
   * A gate period: a dub is sounding to this listener, or its hangover has not run out. Distinct
   * from gatedRef because a barge-in opens the microphone INSIDE a period without ending it.
   */
  const periodRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);
  /** Ends the current gate period; set by the effect that owns the period's machinery. */
  const endPeriodRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!room || !enabled) return;

    const detector = new BargeInDetector();

    const clearRelease = () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    };

    // getTrackPublication(Source.Microphone), not a `.microphoneTrack` shortcut — that property
    // is on the components-react hook's view of a participant, not on LocalParticipant itself.
    // With Krisp attached, livekit-client's `mediaStreamTrack` getter returns the processor's
    // output, which is the published audio — so this is always the track that leaves the machine.
    const localMic = () => room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    const micTrack = () => localMic()?.mediaStreamTrack ?? null;

    // The tracks this gate has disabled. It gives back exactly those objects, whatever the user's
    // mute state — with one exception, expressed by the predicate: while the user is muted, a
    // held track that is NOT the live processor's output is left as it is. That is the raw
    // capture (gated when no filter is attached), whose `enabled` flag is now the user's mute —
    // re-enabling it would publish somebody who believes they are muted, the one failure here
    // worse than the bug being fixed — or a track already replaced and stopped. LiveKit's unmute
    // re-enables the raw capture itself, so leaving it cannot strand it. The processor's output
    // is always given back: nothing else ever would, and under a mute its input is silent.
    const gate = new MicGate<MediaStreamTrack>(
      (track) =>
        !room.localParticipant.isMicrophoneEnabled &&
        track !== localMic()?.getProcessor()?.processedTrack,
    );

    const openMic = () => {
      gatedRef.current = false;
      gate.release();
    };

    /** Shut inside a gate period unless the listener has barged in; open otherwise. */
    const apply = () => {
      if (periodRef.current && !detector.open) {
        gatedRef.current = true;
        // Re-asserted on every call, not only on the transition. The track carrying the
        // microphone changes underneath a gate period — the Krisp processor attaching or
        // detaching, a device switch, a restart — and a user unmuting inside one re-enables the
        // raw capture. `claim` gives back whatever was held on a previous object and says whether
        // the current one is live and therefore ours to silence; a track it finds already
        // disabled by somebody else is not recorded, and so is never re-enabled from here.
        const track = micTrack();
        if (gate.claim(track) && track) track.enabled = false;
        return;
      }
      if (gatedRef.current) openMic();
    };

    // ---- Level measurement for the barge-in --------------------------------------------------
    // Built lazily on the first gate period and kept for the life of this effect: an AudioContext
    // per dub would be churn, and resuming one outside a user gesture is not guaranteed. If it
    // cannot run (no WebAudio, suspended), every level reads 0, nothing counts as speech, and the
    // gate behaves exactly as it did before barge-in existed.
    let audioContext: AudioContext | null = null;
    let micProbe: (LevelProbe & { source: MediaStreamTrack; copy: MediaStreamTrack }) | null = null;
    const dubProbes = new Map<string, LevelProbe & { track: MediaStreamTrack }>();
    let buffer: Float32Array<ArrayBuffer> | null = null;
    let tickTimer: number | null = null;

    const getContext = () => {
      if (audioContext) return audioContext;
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      try {
        audioContext = new AudioContextCtor();
      } catch {
        return null;
      }
      if (audioContext.state === "suspended") void audioContext.resume().catch(() => undefined);
      return audioContext;
    };

    const probe = (context: AudioContext, track: MediaStreamTrack): LevelProbe => {
      const node = context.createMediaStreamSource(new MediaStream([track]));
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      node.connect(analyser);
      return { node, analyser };
    };

    const levelOf = (analyser: AnalyserNode) => {
      if (!buffer || buffer.length !== analyser.fftSize) buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);
      return rms(buffer);
    };

    const dropMicProbe = () => {
      if (!micProbe) return;
      micProbe.node.disconnect();
      micProbe.copy.stop();
      micProbe = null;
    };

    const syncMicProbe = (context: AudioContext) => {
      const source = micTrack();
      if (micProbe?.source === source) return;
      // A different microphone, or Krisp attaching/detaching: a different echo path.
      if (micProbe) detector.reset();
      dropMicProbe();
      if (!source) return;
      // Measured on a CLONE, because the gate disables the original — and a disabled track
      // reads as silence, which would make the listener inaudible to the very check that is
      // meant to hear them. A clone copies `enabled`, so it is set explicitly; stopping the
      // clone later does not stop the microphone.
      const copy = source.clone();
      copy.enabled = true;
      micProbe = { ...probe(context, copy), source, copy };
    };

    const syncDubProbes = (context: AudioContext) => {
      const wanted = new Set(dubIdentitiesRef.current);
      for (const [identity, entry] of dubProbes) {
        const track = room.remoteParticipants
          .get(identity)
          ?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
        if (!wanted.has(identity) || track !== entry.track) {
          entry.node.disconnect();
          dubProbes.delete(identity);
        }
      }
      for (const identity of wanted) {
        if (dubProbes.has(identity)) continue;
        const track = room.remoteParticipants
          .get(identity)
          ?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
        // Read directly (no clone): nothing here changes the remote track. It is also attached
        // to an <audio> element by FilteredRoomAudio, which Chromium needs before a remote
        // WebRTC track yields samples to WebAudio.
        if (track) dubProbes.set(identity, { ...probe(context, track), track });
      }
    };

    const tick = () => {
      if (!periodRef.current) return;
      // Their own mute: nothing is being sent either way, and nothing here may decide otherwise.
      if (!room.localParticipant.isMicrophoneEnabled) return;
      // From here on every path ends in apply(), measured or not: this tick is also what puts the
      // gate back on a track that changed, or that the user's unmute re-enabled, mid-period.
      const context = getContext();
      if (!context) return apply();
      syncMicProbe(context);
      syncDubProbes(context);
      if (!micProbe) return apply();
      detector.step({
        at: performance.now(),
        micRms: levelOf(micProbe.analyser),
        referenceRms: combineRms(Array.from(dubProbes.values(), (entry) => levelOf(entry.analyser))),
      });
      apply();
    };

    const startTicker = () => {
      if (tickTimer === null) tickTimer = window.setInterval(tick, BARGE_IN_TICK_MS);
    };
    const stopTicker = () => {
      if (tickTimer !== null) {
        window.clearInterval(tickTimer);
        tickTimer = null;
      }
    };

    const endPeriod = () => {
      clearRelease();
      periodRef.current = false;
      detector.endDub();
      stopTicker();
      if (gatedRef.current) openMic();
    };
    endPeriodRef.current = endPeriod;

    const evaluate = () => {
      const wanted = new Set(dubIdentitiesRef.current);
      const dubSounding = Array.from(room.remoteParticipants.values()).some(
        (participant) => wanted.has(participant.identity) && participant.isSpeaking,
      );

      if (dubSounding) {
        clearRelease();
        if (!periodRef.current) {
          periodRef.current = true;
          // Already talking when the dub arrived? Read before the gate has touched anything, so
          // it is the listener and not the dub. They keep the microphone while they keep talking.
          detector.startDub(
            performance.now(),
            room.localParticipant.isMicrophoneEnabled && room.localParticipant.isSpeaking,
          );
          startTicker();
        }
        apply();
        return;
      }

      if (periodRef.current && releaseTimerRef.current === null) {
        releaseTimerRef.current = window.setTimeout(() => {
          releaseTimerRef.current = null;
          endPeriod();
        }, RELEASE_HANGOVER_MS);
      }
    };

    // Both signals, for the reason the speaking ring needs both: ActiveSpeakersChanged is
    // room-level and arrives on the SFU's own cadence, while IsSpeakingChanged fires per
    // participant. Gating late is audible as a fragment getting through.
    const attach = (participant: RemoteParticipant) =>
      participant.on(ParticipantEvent.IsSpeakingChanged, evaluate);
    const detach = (participant: RemoteParticipant) =>
      participant.off(ParticipantEvent.IsSpeakingChanged, evaluate);

    // A dub bot joins DURING the meeting — tts_worker creates it on the first synthesised chunk —
    // so the interesting participant is almost never one that was here when this mounted.
    const onParticipantConnected = (participant: RemoteParticipant) => {
      attach(participant);
      evaluate();
    };

    // Plugging in or pulling out a headset changes the echo path completely; what was learned
    // about the old one is wrong in whichever direction is worse.
    const onDeviceChange = () => detector.reset();
    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

    room.on(RoomEvent.ActiveSpeakersChanged, evaluate);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    for (const participant of room.remoteParticipants.values()) attach(participant);
    mediaDevices?.addEventListener?.("devicechange", onDeviceChange);

    return () => {
      clearRelease();
      stopTicker();
      room.off(RoomEvent.ActiveSpeakersChanged, evaluate);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      for (const participant of room.remoteParticipants.values()) detach(participant);
      mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      dropMicProbe();
      for (const entry of dubProbes.values()) entry.node.disconnect();
      dubProbes.clear();
      if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
      if (endPeriodRef.current === endPeriod) endPeriodRef.current = null;
      periodRef.current = false;
      // Never leave the microphone held down by a component that has gone away — that would be a
      // silent mic with nothing left running to release it.
      if (gatedRef.current) openMic();
      // And unconditionally: the tracks held are the only record of what was disabled, and this
      // gate is about to be unreachable. Whatever the flag above says, nothing stays held.
      gate.release();
    };
  }, [room, enabled]);

  // Translation stopping (or the last dub leaving) must release the microphone too: with no
  // interpreter left to report isSpeaking, no event will ever arrive to do it.
  //
  // Ending the period is the whole of it. The tracks the gate disabled are known only to the
  // effect above, which gives them back in endPeriod and again in its cleanup — `enabled` going
  // false or the room changing runs that cleanup before this. Looking the microphone up afresh
  // here and enabling it, as this once did, is how a track the gate never disabled gets enabled.
  useEffect(() => {
    if (enabled && dubIdentities.length > 0) return;
    endPeriodRef.current?.();
  }, [enabled, dubIdentities.length, room]);

  return null;
}
