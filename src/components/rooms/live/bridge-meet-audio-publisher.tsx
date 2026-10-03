"use client";

import { useEffect, useRef } from "react";
import { ConnectionState, RoomEvent, Track, type LocalTrackPublication } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";

import { MEET_AUDIO_TRACK_NAME } from "@/lib/meeting/egress-participants";
import {
  MEET_AUDIO_LOCAL_RAMP_S,
  meetAudioMicrophoneConstraints,
} from "@/lib/meeting/meet-audio-track";

/** The parent's handle: "published", or why not, in words for the console. */
export interface MeetAudioControl {
  publishMeetAudio: () => Promise<string>;
}

/**
 * Publishes the Google Meet call's sound as `meet-audio` while a bridge recording runs.
 *
 * The far side is the inbound leg's own track (no second capture of Meet), the user is a fresh
 * copy of their microphone gated by Meet's mute button (meet-audio-track.ts), and the two are
 * mixed in one AudioContext into one published track. Inputs change under it without a republish:
 * the leg reopening hands a new far-side track, a Meet mute moves a gain.
 *
 * On the host's own connection, as SCREEN-SHARE AUDIO: the egress template keys on the name, the
 * STT ingest reads only microphone/unknown sources (WT-631), and the live clients play only
 * microphones, so nothing but the recording ever hears it.
 *
 * Best effort throughout: a microphone that cannot be opened leaves the far side alone in the
 * mix, and a failed publish leaves the recording on the tracks it mixed before this existed.
 */
export function BridgeMeetAudioPublisher({
  controlRef,
  wanted,
  farSideTrack,
  localVoiceOn,
  selectedMicrophoneId,
}: {
  controlRef: React.RefObject<MeetAudioControl | null>;
  wanted: boolean;
  /** The inbound leg's capture of Meet's playback; borrowed, never stopped here. */
  farSideTrack: MediaStreamTrack | null;
  /** meetAudioLocalVoiceOn: whether Meet is sending this user's voice right now. */
  localVoiceOn: boolean;
  /** The meeting's chosen input device ("" = default). */
  selectedMicrophoneId: string;
}) {
  const room = useRoomContext();
  const mixRef = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    farGain: GainNode;
    localGain: GainNode;
    far: { track: MediaStreamTrack; node: MediaStreamAudioSourceNode } | null;
    publication: LocalTrackPublication | null;
    drop: () => void;
  } | null>(null);
  const wantedRef = useRef(wanted);
  const farSideRef = useRef(farSideTrack);
  const localVoiceRef = useRef(localVoiceOn);
  const microphoneRef = useRef(selectedMicrophoneId);
  useEffect(() => {
    farSideRef.current = farSideTrack;
    localVoiceRef.current = localVoiceOn;
    microphoneRef.current = selectedMicrophoneId;
  });

  /** Points the mix's far-side input at `track` (or at nothing). */
  const connectFarSide = (track: MediaStreamTrack | null) => {
    const mix = mixRef.current;
    if (!mix || mix.far?.track === track) return;
    mix.far?.node.disconnect();
    mix.far = null;
    if (!track || track.readyState === "ended") return;
    const node = mix.context.createMediaStreamSource(new MediaStream([track]));
    node.connect(mix.farGain);
    mix.far = { track, node };
  };

  useEffect(() => {
    connectFarSide(farSideTrack);
  }, [farSideTrack]);

  useEffect(() => {
    const mix = mixRef.current;
    if (!mix) return;
    mix.localGain.gain.setTargetAtTime(localVoiceOn ? 1 : 0, mix.context.currentTime, MEET_AUDIO_LOCAL_RAMP_S);
  }, [localVoiceOn]);

  useEffect(() => {
    let publishing: Promise<string> | null = null;
    /** False once this effect is cleaned up (unmount, a new Room): nothing may be published after. */
    let alive = true;

    const publish = async (): Promise<string> => {
      if (mixRef.current) return "published";
      if (room.state !== ConnectionState.Connected) return "the meeting is not connected";

      const context = new AudioContext({ sampleRate: 48_000 });
      const destination = context.createMediaStreamDestination();
      const farGain = context.createGain();
      const localGain = context.createGain();
      farGain.connect(destination);
      localGain.connect(destination);
      localGain.gain.value = localVoiceRef.current ? 1 : 0;

      let microphone: MediaStream | null = null;
      try {
        microphone = await navigator.mediaDevices.getUserMedia({
          audio: meetAudioMicrophoneConstraints(microphoneRef.current),
        });
        context.createMediaStreamSource(microphone).connect(localGain);
      } catch (error) {
        // The far side still records. Said in the console, where whoever debugs a file looks.
        console.warn("[bridge] Recording without the microphone in meet-audio:", error);
        microphone = null;
      }
      // The desktop window is never throttled, but a context created without a gesture can start
      // suspended; resume is a no-op when it is already running.
      void context.resume().catch(() => {});

      const [mixed] = destination.stream.getAudioTracks();
      const release = () => {
        microphone?.getTracks().forEach((track) => track.stop());
        void context.close().catch(() => {});
      };
      if (!mixed || !alive) {
        mixed?.stop();
        release();
        return mixed ? "the meeting window closed" : "the browser produced no mixed track";
      }

      const drop = () => {
        const current = mixRef.current;
        if (!current || current.drop !== drop) return;
        mixRef.current = null;
        current.far?.node.disconnect();
        const published = current.publication?.track;
        if (published) void room.localParticipant.unpublishTrack(published, true).catch(() => {});
        else mixed.stop();
        release();
      };
      mixRef.current = { context, destination, farGain, localGain, far: null, publication: null, drop };
      connectFarSide(farSideRef.current);

      try {
        const publication = await room.localParticipant.publishTrack(mixed, {
          name: MEET_AUDIO_TRACK_NAME,
          source: Track.Source.ScreenShareAudio,
          // A conference mix, not a voice at a mic: no DTX (it would cut the far side's quiet
          // passages), RED for loss, and none of the mic enhancements (the inputs have their own).
          dtx: false,
          red: true,
        });
        if (mixRef.current?.drop !== drop) {
          // Torn down while the publish was in flight.
          void room.localParticipant.unpublishTrack(mixed, true).catch(() => {});
          return "the recording no longer needs it";
        }
        mixRef.current.publication = publication;
      } catch {
        drop();
        return "the publish was refused";
      }
      if (!wantedRef.current || !alive) {
        drop();
        return "the recording no longer needs it";
      }
      return "published";
    };

    controlRef.current = {
      publishMeetAudio: () => {
        if (!publishing) publishing = publish().finally(() => (publishing = null));
        return publishing;
      },
    };

    const onDisconnected = () => mixRef.current?.drop();
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      alive = false;
      room.off(RoomEvent.Disconnected, onDisconnected);
      controlRef.current = null;
      mixRef.current?.drop();
    };
  }, [room, controlRef]);

  useEffect(() => {
    wantedRef.current = wanted;
    if (!wanted) {
      mixRef.current?.drop();
      return;
    }
    // The start chain publishes before asking the server; this covers everything after it: the
    // recording turned on from elsewhere (hub), the leg reopening, a reconnect.
    void controlRef.current?.publishMeetAudio().then((result) => {
      if (result !== "published") console.warn(`[bridge] Meet audio not published: ${result}.`);
    });
  }, [wanted, controlRef]);

  return null;
}
