"use client";

import { useEffect, useRef } from "react";
import { ConnectionState, RoomEvent, Track, type LocalTrack } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";

import { useSupervisedPublish } from "@/hooks/use-supervised-publish";
import { rms, rmsToDbfs } from "@/lib/meeting/barge-in";
import { MEET_AUDIO_MIC_ATTRIBUTE, MEET_AUDIO_TRACK_NAME } from "@/lib/meeting/egress-participants";
import {
  INITIAL_FAR_SPEECH,
  MEET_AUDIO_ATTRIBUTE_TIMEOUT_MS,
  MEET_AUDIO_LOCAL_RAMP_S,
  MEET_AUDIO_VAD_TICK_MS,
  createLatestRequest,
  farSpeechActive,
  meetAudioMicGain,
  meetAudioMicrophoneCandidates,
  meetAudioMicrophoneConstraints,
  meetAudioPublicationStatus,
  reduceFarSpeech,
  settleLatest,
  settleWithin,
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
  /** The gain last scheduled on localGain: a new ramp only when the target changes. */
  gainTarget: number;
  vadTimer: ReturnType<typeof setInterval>;
  /**
   * The LiveKit track the mix was published as. Its publication is looked up by this object at
   * every check: LiveKit's own republish creates a new publication for the same track.
   */
  localTrack: LocalTrack | null;
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

    /**
     * Says in MEET_AUDIO_MIC_ATTRIBUTE whether the microphone is in the mix. Awaited (bounded) before
     * the first publish, so the template knows from the track's first second; later changes are
     * sent the same way. A refusal (a token without canUpdateOwnMetadata) or a timeout is logged:
     * the template then assumes the microphone is in, which is wrong exactly when it is not.
     */
    const announceMic = async (inMix: boolean): Promise<void> => {
      if (!inMix) {
        console.warn(
          "[bridge] meet-audio has NO microphone: the recording falls back to your WarpTalk microphone, which only carries your voice while it is on in WarpTalk.",
        );
      }
      const answer = await settleWithin(
        room.localParticipant.setAttributes({ [MEET_AUDIO_MIC_ATTRIBUTE]: inMix ? "1" : "0" }),
        MEET_AUDIO_ATTRIBUTE_TIMEOUT_MS,
      );
      if (answer.outcome !== "ok") {
        console.warn(
          `[bridge] Could not tell the recorder whether meet-audio has the microphone (${answer.outcome}):`,
          answer.outcome === "error" ? answer.error : `no answer in ${MEET_AUDIO_ATTRIBUTE_TIMEOUT_MS} ms`,
        );
      }
    };

    /** Serializes openMic: a getUserMedia that lands after a newer request is discarded. */
    const micRequests = createLatestRequest();

    /** The newest openMic call: publish() waits for the one that wins (settleLatest). */
    let latestMicOpen: Promise<boolean> = Promise.resolve(false);
    const openMic = (mix: Mix): Promise<boolean> => {
      latestMicOpen = openMicNow(mix);
      return latestMicOpen;
    };

    /** Opens the microphone copy into `mix`, replacing the one there. Device first, then default. */
    const openMicNow = async (mix: Mix): Promise<boolean> => {
      const request = micRequests.begin();
      const current = () => micRequests.isLatest(request) && mixRef.current === mix && alive;
      const wantedDevice = deviceRef.current;
      for (const deviceId of meetAudioMicrophoneCandidates(wantedDevice)) {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: meetAudioMicrophoneConstraints(deviceId),
          });
        } catch (error) {
          console.warn(`[bridge] meet-audio could not open the microphone (${deviceId || "default"}):`, error);
          if (!current()) return false;
          continue;
        }
        const [track] = stream.getAudioTracks();
        if (!current() || !track) {
          // Superseded by a newer open (or the mix went away) while this one was in getUserMedia.
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
          void announceMic(false);
        });
        await announceMic(true);
        return true;
      }
      if (current()) {
        // Nothing opened: the far side still records, and the template keeps the WarpTalk mic.
        mix.mic?.node.disconnect();
        mix.mic?.stream.getTracks().forEach((t) => t.stop());
        mix.mic = null;
        await announceMic(false);
      }
      return false;
    };

    reopenMicRef.current = () => {
      const mix = mixRef.current;
      if (mix && mix.mic?.deviceId !== deviceRef.current) void openMic(mix);
    };

    /** The local publication of `track`, if the participant has one (by object, not by sid). */
    const publicationOf = (track: LocalTrack | null) => {
      if (!track) return undefined;
      for (const publication of room.localParticipant.trackPublications.values()) {
        if (publication.track === track) return publication;
      }
      return undefined;
    };

    /** Unpublishes every `meet-audio` this participant still has: never two of them. */
    const unpublishEveryMeetAudio = async () => {
      const stale = Array.from(room.localParticipant.trackPublications.values()).filter(
        (publication) => publication.trackName === MEET_AUDIO_TRACK_NAME && publication.track,
      );
      await Promise.all(
        stale.map((publication) =>
          room.localParticipant.unpublishTrack(publication.track as LocalTrack, true).catch(() => undefined),
        ),
      );
    };

    const publish = async (): Promise<string> => {
      // The ONE lifecycle check (meetAudioPublicationStatus), run by the supervisor every few
      // seconds. No event handler drops the mix: LiveKit's republishAllTracks unpublishes and
      // republishes the same track, and tearing it down in between left two publications.
      const existing = mixRef.current;
      const status = meetAudioPublicationStatus({
        hasMix: Boolean(existing),
        publicationPresent: Boolean(publicationOf(existing?.localTrack ?? null)),
        roomConnected: room.state === ConnectionState.Connected,
        // Private in livekit-client; set for exactly the length of republishAllTracks.
        liveKitRepublishing: Boolean(
          (room.localParticipant as unknown as { republishPromise?: unknown }).republishPromise,
        ),
      });
      if (status === "present") return "published";
      if (status === "republishing") return "LiveKit is reconnecting or republishing meet-audio";
      if (status === "lost") {
        console.warn("[bridge] meet-audio was no longer published; publishing it again.");
        existing?.drop();
      }
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
          mix.farSpeech = reduceFarSpeech(mix.farSpeech, { dbfs: rmsToDbfs(rms(samples)), nowMs: now });
        }
        const gain = meetAudioMicGain({
          localVoiceOn: localVoiceRef.current,
          farSpeechActive: farSpeechActive(mix.farSpeech, now),
        });
        // Only when the target changes: re-scheduling a ramp every tick stacks automation events.
        if (gain !== mix.gainTarget) {
          mix.gainTarget = gain;
          mix.localGain.gain.cancelScheduledValues(mix.context.currentTime);
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
        // Unpublished only if the participant still has it; the track and the context are always
        // stopped here, whatever unpublishTrack does (it returns early, without stopping anything,
        // for a publication that is already gone).
        const published = publicationOf(current.localTrack);
        if (published?.track) void room.localParticipant.unpublishTrack(published.track, true).catch(() => {});
        current.localTrack?.stop();
        mixed.stop();
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
        gainTarget: 0,
        vadTimer,
        localTrack: null,
        drop,
      };
      mixRef.current = mix;
      connectFarSide(farSideRef.current);
      // Before the publish, so MEET_AUDIO_MIC_ATTRIBUTE is set (or its failure logged, at most
      // MEET_AUDIO_ATTRIBUTE_TIMEOUT_MS later) when the template first sees the track.
      // If a newer open (a device switch, an unplug) superseded this one, wait for the one that
      // won, so the attribute published before the track describes the microphone actually in it.
      void openMic(mix);
      await settleLatest(() => latestMicOpen);
      if (mixRef.current !== mix || !alive) {
        drop();
        return "the recording no longer needs it";
      }

      // Never two: whatever meet-audio is still on this participant goes before the new one.
      await unpublishEveryMeetAudio();
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
          publication.track?.stop();
          return "the recording no longer needs it";
        }
        mix.localTrack = publication.track ?? null;
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
