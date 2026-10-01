"use client";

import { useEffect, useRef } from "react";
import { ParticipantEvent, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { useMaybeRoomContext } from "@livekit/components-react";

import { BargeInDetector, combineRms, rms } from "@/lib/meeting/barge-in";

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

  /** True only while WE are holding the microphone down, so a user's own mute is never touched. */
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
    const micTrack = () =>
      room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ??
      null;

    const openMic = () => {
      gatedRef.current = false;
      // Only if the user has not muted themselves in the meantime. Their mute outranks ours, and
      // re-enabling the track under it would publish audio from somebody who believes they are
      // muted — the one failure here that is worse than the bug being fixed.
      if (!room.localParticipant.isMicrophoneEnabled) return;
      const track = micTrack();
      if (track) track.enabled = true;
    };

    /** Shut inside a gate period unless the listener has barged in; open otherwise. */
    const apply = () => {
      if (periodRef.current && !detector.open) {
        gatedRef.current = true;
        // Re-asserted on every call, not only on the transition: the Krisp processor attaching
        // mid-dub swaps the published track for a new, enabled one.
        const track = micTrack();
        if (track && track.enabled) track.enabled = false;
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
      const context = getContext();
      if (!context) return;
      syncMicProbe(context);
      syncDubProbes(context);
      if (!micProbe) return;
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
    };
  }, [room, enabled]);

  // Translation stopping (or the last dub leaving) must release the microphone too: with no
  // interpreter left to report isSpeaking, no event will ever arrive to do it.
  useEffect(() => {
    if (enabled && dubIdentities.length > 0) return;
    endPeriodRef.current?.();
    if (!gatedRef.current || !room) return;
    gatedRef.current = false;
    if (!room.localParticipant.isMicrophoneEnabled) return;
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
      ?.mediaStreamTrack;
    if (track) track.enabled = true;
  }, [enabled, dubIdentities.length, room]);

  return null;
}
