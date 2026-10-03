"use client";

import { useEffect, useRef } from "react";
import { ConnectionState, RoomEvent, Track, type LocalTrackPublication } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";

import { useSupervisedPublish } from "@/hooks/use-supervised-publish";
import { MEET_AUDIO_MIC_ATTRIBUTE, MEET_AUDIO_TRACK_NAME } from "@/lib/meeting/egress-participants";
import {
  INITIAL_FAR_SPEECH,
  MEET_AUDIO_LOCAL_RAMP_S,
  MEET_AUDIO_VAD_TICK_MS,
  farSpeechActive,
  meetAudioMicGain,
  meetAudioMicrophoneCandidates,
  meetAudioMicrophoneConstraints,
  reduceFarSpeech,
  rmsToDbfs,
  shouldReopenMeetAudioMic,
  type FarSpeechState,
} from "@/lib/meeting/meet-audio-track";

/** The parent's handle: "published", or why not, in words for the console. */
export interface MeetAudioControl {
  publishMeetAudio: () => Promise<string>;
}

interface Mix {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  farGain: GainNode;
  localGain: GainNode;
  /** Measures the far side for the echo duck (meet-audio-track.ts). */
  farAnalyser: AnalyserNode;
  far: { track: MediaStreamTrack; node: MediaStreamAudioSourceNode } | null;
  mic: { stream: MediaStream; node: MediaStreamAudioSourceNode; deviceId: string } | null;
  farSpeech: FarSpeechState;
  vadTimer: ReturnType<typeof setInterval>;
  publication: LocalTrackPublication | null;
  drop: () => void;
}

/**
 * Publishes the Google Meet call's sound as `meet-audio` while a bridge recording runs.
 *
 * The far side is the inbound leg's own track (no second capture of Meet), the user is a fresh
 * copy of their microphone gated by Meet's mute button and ducked while the far side sounds (the
 * echo of Meet's speakers, meet-audio-track.ts), mixed in one AudioContext into one published
 * track. Inputs change under it without a republish: the leg reopening hands a new far-side track,
 * a Meet mute or the far side talking moves a gain, a device switch or an unplug reopens the
 * microphone.
 *
 * On the host's own connection, as SCREEN-SHARE AUDIO: the egress template keys on the name, the
 * STT ingest reads only microphone/unknown sources (WT-631), and the live clients play only
 * microphones, so nothing but the recording ever hears it. Whether the microphone is in it is
 * said in the participant attribute MEET_AUDIO_MIC_ATTRIBUTE, so the template can keep the
 * WarpTalk microphone instead when it is not.
 *
 * Kept on the wire by a supervisor (useSupervisedPublish): a publish that failed, or a mix dropped
 * by a disconnect, is published again with back-off for as long as the recording wants it.
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
  /** The meeting's chosen input device at join ("" = default); a mid-meeting switch is followed too. */
  selectedMicrophoneId: string;
}) {
  const room = useRoomContext();
  const mixRef = useRef<Mix | null>(null);
  const wantedRef = useRef(wanted);
  const farSideRef = useRef(farSideTrack);
  const localVoiceRef = useRef(localVoiceOn);
  /** The device the microphone copy should be on: the join pick, then LiveKit's active device. */
  const deviceRef = useRef(selectedMicrophoneId);
  const reopensRef = useRef<number[]>([]);
  /** Bound by the main effect: (re)opens the microphone copy on deviceRef's device. */
  const reopenMicRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    farSideRef.current = farSideTrack;
    localVoiceRef.current = localVoiceOn;
  });

  /** Points the mix's far-side input at `track` (or at nothing). Reads only refs. */
  const connectFarSide = (track: MediaStreamTrack | null) => {
    const mix = mixRef.current;
    if (!mix || mix.far?.track === track) return;
    mix.far?.node.disconnect();
    mix.far = null;
    if (!track || track.readyState === "ended") return;
    const node = mix.context.createMediaStreamSource(new MediaStream([track]));
    node.connect(mix.farGain);
    node.connect(mix.farAnalyser);
    mix.far = { track, node };
  };

  useEffect(() => {
    connectFarSide(farSideTrack);
  }, [farSideTrack]);

  // A device switch: the join pick changing, or LiveKit switching the meeting's microphone.
  useEffect(() => {
    if (deviceRef.current === selectedMicrophoneId) return;
    deviceRef.current = selectedMicrophoneId;
    reopenMicRef.current?.();
  }, [selectedMicrophoneId]);

  useEffect(() => {
    let publishing: Promise<string> | null = null;
    /** False once this effect is cleaned up (unmount, a new Room): nothing may be published after. */
    let alive = true;

    const announceMic = (inMix: boolean) => {
      // Best effort: an older token without canUpdateOwnMetadata refuses, and the template then
      // assumes the microphone is in (the attribute is absent).
      void room.localParticipant
        .setAttributes({ [MEET_AUDIO_MIC_ATTRIBUTE]: inMix ? "1" : "0" })
        .catch(() => {});
    };

    /** Opens the microphone copy into `mix`, replacing the one there. Device first, then default. */
    const openMic = async (mix: Mix): Promise<boolean> => {
      const wantedDevice = deviceRef.current;
      for (const deviceId of meetAudioMicrophoneCandidates(wantedDevice)) {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: meetAudioMicrophoneConstraints(deviceId),
          });
        } catch (error) {
          console.warn(`[bridge] meet-audio could not open the microphone (${deviceId || "default"}):`, error);
          continue;
        }
        const [track] = stream.getAudioTracks();
        if (mixRef.current !== mix || !alive || !track) {
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }
        const previous = mix.mic;
        const node = mix.context.createMediaStreamSource(stream);
        node.connect(mix.localGain);
        mix.mic = { stream, node, deviceId };
        previous?.node.disconnect();
        previous?.stream.getTracks().forEach((t) => t.stop());
        // Unplugged, driver restart: reopened (on the default if the device is gone), bounded.
        track.addEventListener("ended", () => {
          if (mixRef.current !== mix || mix.mic?.stream !== stream) return;
          const { reopen, recent } = shouldReopenMeetAudioMic(reopensRef.current, Date.now());
          reopensRef.current = recent;
          if (reopen) {
            void openMic(mix);
            return;
          }
          console.warn("[bridge] The meet-audio microphone keeps ending; recording without it.");
          mix.mic = null;
          node.disconnect();
          announceMic(false);
        });
        announceMic(true);
        return true;
      }
      if (mixRef.current === mix && alive) {
        // Nothing opened: the far side still records, and the template keeps the WarpTalk mic.
        mix.mic?.node.disconnect();
        mix.mic?.stream.getTracks().forEach((t) => t.stop());
        mix.mic = null;
        announceMic(false);
      }
      return false;
    };

    reopenMicRef.current = () => {
      const mix = mixRef.current;
      if (mix && mix.mic?.deviceId !== deviceRef.current) void openMic(mix);
    };

    const publish = async (): Promise<string> => {
      if (mixRef.current) return "published";
      if (room.state !== ConnectionState.Connected) return "the meeting is not connected";

      const context = new AudioContext({ sampleRate: 48_000 });
      const destination = context.createMediaStreamDestination();
      const farGain = context.createGain();
      const localGain = context.createGain();
      const farAnalyser = context.createAnalyser();
      farAnalyser.fftSize = 1024;
      farGain.connect(destination);
      localGain.connect(destination);
      localGain.gain.value = 0;
      // The desktop window is never throttled, but a context created without a gesture can start
      // suspended; resume is a no-op when it is already running.
      void context.resume().catch(() => {});

      const [mixed] = destination.stream.getAudioTracks();
      if (!mixed || !alive) {
        mixed?.stop();
        void context.close().catch(() => {});
        return mixed ? "the meeting window closed" : "the browser produced no mixed track";
      }

      // The echo duck: measure the far side, gate/duck the microphone copy accordingly.
      const samples = new Float32Array(farAnalyser.fftSize);
      const vadTimer = setInterval(() => {
        const mix = mixRef.current;
        if (!mix || mix.vadTimer !== vadTimer) return;
        const now = Date.now();
        if (mix.far) {
          mix.farAnalyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const value of samples) sum += value * value;
          mix.farSpeech = reduceFarSpeech(mix.farSpeech, {
            dbfs: rmsToDbfs(Math.sqrt(sum / samples.length)),
            nowMs: now,
          });
        }
        const gain = meetAudioMicGain({
          localVoiceOn: localVoiceRef.current,
          farSpeechActive: farSpeechActive(mix.farSpeech, now),
        });
        if (Math.abs(mix.localGain.gain.value - gain) > 0.001) {
          mix.localGain.gain.setTargetAtTime(gain, mix.context.currentTime, MEET_AUDIO_LOCAL_RAMP_S);
        }
      }, MEET_AUDIO_VAD_TICK_MS);

      const drop = () => {
        const current = mixRef.current;
        if (!current || current.drop !== drop) return;
        mixRef.current = null;
        clearInterval(current.vadTimer);
        current.far?.node.disconnect();
        current.mic?.stream.getTracks().forEach((track) => track.stop());
        const published = current.publication?.track;
        if (published) void room.localParticipant.unpublishTrack(published, true).catch(() => {});
        else mixed.stop();
        void context.close().catch(() => {});
      };
      const mix: Mix = {
        context,
        destination,
        farGain,
        localGain,
        farAnalyser,
        far: null,
        mic: null,
        farSpeech: INITIAL_FAR_SPEECH,
        vadTimer,
        publication: null,
        drop,
      };
      mixRef.current = mix;
      connectFarSide(farSideRef.current);
      // Before the publish, so MEET_AUDIO_MIC_ATTRIBUTE is set when the template first sees the track.
      await openMic(mix);
      if (mixRef.current !== mix || !alive) {
        drop();
        return "the recording no longer needs it";
      }

      try {
        const publication = await room.localParticipant.publishTrack(mixed, {
          name: MEET_AUDIO_TRACK_NAME,
          source: Track.Source.ScreenShareAudio,
          // A conference mix, not a voice at a mic: no DTX (it would cut the far side's quiet
          // passages), RED for loss, and none of the mic enhancements (the inputs have their own).
          dtx: false,
          red: true,
        });
        if (mixRef.current !== mix) {
          // Torn down while the publish was in flight.
          void room.localParticipant.unpublishTrack(mixed, true).catch(() => {});
          return "the recording no longer needs it";
        }
        mix.publication = publication;
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

    // A dropped connection takes the publication with it; the supervisor publishes a fresh mix
    // once the room is connected again.
    const onDisconnected = () => mixRef.current?.drop();
    // LiveKit switched the meeting's microphone (media-device-menu): the copy follows it.
    const onActiveDeviceChanged = (kind: MediaDeviceKind, deviceId: string) => {
      if (kind !== "audioinput" || deviceRef.current === deviceId) return;
      deviceRef.current = deviceId;
      reopenMicRef.current?.();
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ActiveDeviceChanged, onActiveDeviceChanged);
    return () => {
      alive = false;
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.ActiveDeviceChanged, onActiveDeviceChanged);
      controlRef.current = null;
      reopenMicRef.current = null;
      mixRef.current?.drop();
    };
  }, [room, controlRef]);

  useEffect(() => {
    wantedRef.current = wanted;
    if (!wanted) mixRef.current?.drop();
  }, [wanted]);

  // The single owner of (re)publishing: an immediate attempt when the recording starts wanting it
  // (the start chain's own call shares it), then every few seconds, with back-off after a failure.
  useSupervisedPublish({
    enabled: wanted,
    kick: true,
    publish: () => controlRef.current?.publishMeetAudio() ?? null,
    label: "Meet audio",
  });

  return null;
}
