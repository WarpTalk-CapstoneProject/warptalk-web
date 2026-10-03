"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useRoomContext } from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Track,
  TrackEvent,
  type LocalTrack,
  type LocalTrackPublication,
  type Room,
} from "livekit-client";

import {
  INITIAL_MIC_HEAL,
  MIC_FAULT_CONFIRM_MS,
  MIC_HEAL_CHECK_INTERVAL_MS,
  checkMicHealth,
  micDeviceLogLine,
  micFaultSuspectedLine,
  micHealAction,
  micHealAttemptLine,
  micHealOutcomeLine,
  micHealSettled,
  type LocalMicObservation,
  type MicFault,
  type MicHealState,
} from "@/lib/meeting/mic-self-heal";

/**
 * Keeps this person's microphone on the wire while it is meant to be on, says which device it is
 * recording, and reports LiveKit's active microphone to the session (the popup's picker ticks it).
 * Rendered in bridge rooms only, where the evidence is and where `intentRef` has a source (the
 * Meet-follow); a native meeting's `microphoneEnabled` mirrors LiveKit and so cannot say what the
 * mic was MEANT to be. The rules are lib/meeting/mic-self-heal.ts, which is tested.
 *
 * A child of <LiveKitRoom> for the same reason LocalMediaController is: PersistentMeetingSession
 * RENDERS the provider and so cannot call useRoomContext() itself.
 *
 * WHEN IT LOOKS
 *   Right after RoomEvent.Reconnected — which livekit-client emits for a signal-only reconnect and a
 *   full one alike; there is no separate SignalReconnected — where the field evidence lost the
 *   microphone (LiveKit's own re-publish after a full reconnect failed and was only logged); when
 *   the local mic is unpublished or a device error is reported, and every
 *   MIC_HEAL_CHECK_INTERVAL_MS while connected. A suspected fault is looked at again after
 *   MIC_FAULT_CONFIRM_MS, and only then healed.
 *
 * WHAT IT NEVER DOES
 *   Turn on a microphone whose intent is off or unknown: `intentRef` is the Meet-follow's last
 *   applied value (the popup's override and the host's ForceMuted included), so a Meet mute is
 *   never fought. Two heals at once. Retry a failing one faster than the back-off.
 */
export function LocalMicSupervisor({
  intentRef,
  onActiveMicrophoneChange,
}: {
  /** What the mic is meant to be; null for "nobody has said". */
  intentRef: RefObject<boolean | null>;
  /** LiveKit's active audioinput id, after connect and on every change; null when not known. */
  onActiveMicrophoneChange?: (deviceId: string | null) => void;
}) {
  const room = useRoomContext();
  const onActiveRef = useRef(onActiveMicrophoneChange);
  useEffect(() => {
    onActiveRef.current = onActiveMicrophoneChange;
  });

  useEffect(() => {
    let state: MicHealState = INITIAL_MIC_HEAL;
    let inFlight = false;
    let attempts = 0;
    let confirmTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    /** The device line already said on this connection, so it is said once and on each change. */
    let loggedDevice: string | null = null;
    let deviceLookup = 0;

    const reportActive = () => {
      if (room.state !== ConnectionState.Connected) return;
      onActiveRef.current?.(room.getActiveDevice("audioinput") ?? null);
    };

    const logDevice = () => {
      if (room.state !== ConnectionState.Connected) return;
      const track = micPublication(room)?.track;
      const lookup = ++deviceLookup;
      void micDeviceLabel(track).then((label) => {
        if (disposed || lookup !== deviceLookup) return;
        const line = micDeviceLogLine(loggedDevice, label);
        if (!line) return;
        loggedDevice = label?.trim() || null;
        console.warn(line);
      });
    };

    const runHeal = async (fault: MicFault) => {
      inFlight = true;
      attempts += 1;
      console.warn(micHealAttemptLine(fault, attempts));
      let ok = false;
      let detail = "";
      try {
        const localParticipant = room.localParticipant;
        if (micHealAction(fault) === "republish") {
          const track = micPublication(room)?.track;
          // Stops the dead track too: LiveKit then creates a fresh capture on the active device.
          if (track) await localParticipant.unpublishTrack(track, true);
        }
        const publication = await localParticipant.setMicrophoneEnabled(true);
        const after = observe(room, true);
        ok = detectsHealthy(after);
        detail = ok
          ? `track ${publication?.trackSid || after.publication?.trackSid || "?"}`
          : "the microphone is still not on the wire after the attempt";
      } catch (error) {
        detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      } finally {
        inFlight = false;
      }
      if (disposed) return;
      state = micHealSettled(state, ok, Date.now());
      console.warn(micHealOutcomeLine({ ok, fault, detail, failures: state.failures }));
      if (ok) {
        attempts = 0;
        logDevice();
      }
    };

    const check = (cause: string) => {
      if (disposed) return;
      const decision = checkMicHealth(state, observe(room, intentRef.current), Date.now(), inFlight);
      state = decision.state;
      if (decision.newlySuspected) {
        console.warn(micFaultSuspectedLine(decision.newlySuspected, cause));
        // Looked at again once the confirmation window is over, not only at the next interval.
        if (confirmTimer) clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          confirmTimer = null;
          check("confirming");
        }, MIC_FAULT_CONFIRM_MS + 50);
      }
      if (decision.cleared) {
        console.warn(`[bridge] WarpTalk mic recovered by itself (it was suspected: ${decision.cleared})`);
      }
      if (decision.heal) void runHeal(decision.heal);
    };

    const onConnected = () => {
      // A new connection: nothing from the last one carries over, the device is said again.
      state = INITIAL_MIC_HEAL;
      attempts = 0;
      loggedDevice = null;
      reportActive();
      logDevice();
      check("connected");
    };
    const onReconnected = () => {
      reportActive();
      logDevice();
      check("after a LiveKit reconnect");
    };
    const onPublicationChange = (publication: LocalTrackPublication) => {
      if (publication.source !== Track.Source.Microphone) return;
      reportActive();
      logDevice();
      check("the mic publication changed");
    };
    const onDeviceChanged = (kind: MediaDeviceKind) => {
      if (kind !== "audioinput") return;
      reportActive();
      logDevice();
    };
    const onMediaDevicesError = (error: Error) => {
      console.warn(`[bridge] WarpTalk mic: LiveKit reported a device error: ${error.name}: ${error.message}`);
      check("a device error");
    };
    const onDisconnected = () => {
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = null;
    };

    room
      .on(RoomEvent.Connected, onConnected)
      .on(RoomEvent.Reconnected, onReconnected)
      .on(RoomEvent.LocalTrackPublished, onPublicationChange)
      .on(RoomEvent.LocalTrackUnpublished, onPublicationChange)
      .on(RoomEvent.ActiveDeviceChanged, onDeviceChanged)
      .on(RoomEvent.MediaDevicesError, onMediaDevicesError)
      .on(RoomEvent.Disconnected, onDisconnected);

    // A restarted track (device switch, unplug) is the same publication with a new capture.
    let watched: LocalTrack | null = null;
    const onRestarted = () => logDevice();
    const watchTrack = () => {
      const next = micPublication(room)?.track ?? null;
      if (next === watched) return;
      watched?.off(TrackEvent.Restarted, onRestarted);
      watched = next;
      watched?.on(TrackEvent.Restarted, onRestarted);
    };
    room.on(RoomEvent.LocalTrackPublished, watchTrack).on(RoomEvent.LocalTrackUnpublished, watchTrack);

    // Already connected when this mounted (a remount inside a live meeting).
    if (room.state === ConnectionState.Connected) {
      watchTrack();
      reportActive();
      logDevice();
    }

    const interval = setInterval(() => {
      if (room.state === ConnectionState.Connected) check("periodic check");
    }, MIC_HEAL_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(interval);
      if (confirmTimer) clearTimeout(confirmTimer);
      watched?.off(TrackEvent.Restarted, onRestarted);
      room
        .off(RoomEvent.Connected, onConnected)
        .off(RoomEvent.Reconnected, onReconnected)
        .off(RoomEvent.LocalTrackPublished, onPublicationChange)
        .off(RoomEvent.LocalTrackUnpublished, onPublicationChange)
        .off(RoomEvent.ActiveDeviceChanged, onDeviceChanged)
        .off(RoomEvent.MediaDevicesError, onMediaDevicesError)
        .off(RoomEvent.Disconnected, onDisconnected)
        .off(RoomEvent.LocalTrackPublished, watchTrack)
        .off(RoomEvent.LocalTrackUnpublished, watchTrack);
    };
  }, [room, intentRef]);

  return null;
}

function micPublication(room: Room): LocalTrackPublication | undefined {
  return room.localParticipant.getTrackPublication(Track.Source.Microphone);
}

function observe(room: Room, intent: boolean | null): LocalMicObservation {
  const publication = micPublication(room);
  const track = publication?.track;
  return {
    connected: room.state === ConnectionState.Connected,
    intent,
    publication: publication
      ? {
          trackSid: publication.trackSid,
          muted: publication.isMuted,
          hasTrack: Boolean(track),
          trackEnded: track?.mediaStreamTrack?.readyState === "ended",
        }
      : null,
  };
}

function detectsHealthy(observation: LocalMicObservation): boolean {
  const publication = observation.publication;
  return Boolean(publication && publication.hasTrack && !publication.trackEnded && publication.trackSid && !publication.muted);
}

/**
 * The capture device's name. `mediaStreamTrack` is the noise filter's OUTPUT while one is attached,
 * whose label names the filter rather than the microphone, so the source track's device id is
 * looked up in the device list first; the track's own label is the fallback.
 */
async function micDeviceLabel(track: LocalTrack | undefined): Promise<string | null> {
  if (!track) return null;
  let deviceId: string | undefined;
  try {
    deviceId = track.getSourceTrackSettings().deviceId;
  } catch {
    deviceId = undefined;
  }
  if (deviceId) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const device = devices.find((d) => d.kind === "audioinput" && d.deviceId === deviceId);
      if (device?.label) return device.label;
    } catch {
      // No list (permission, a locked-down profile): the track's own label below.
    }
  }
  return track.mediaStreamTrack?.label || null;
}
