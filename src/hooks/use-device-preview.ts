"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Camera/microphone preview shared by every pre-join surface.
 *
 * Lifted verbatim out of SetupRoomModal so the waiting room does not grow a second copy.
 * Two screens owning their own getUserMedia handling is how you end up with one of them
 * leaking a camera light after navigation while the other does not — and this codebase has
 * already paid for duplicated logic eleven times over.
 *
 * The generation counter is the important part and the reason this is not three useStates:
 * every restart bumps it, and any async work that resolves against a stale generation stops
 * the tracks it just opened instead of adopting them. Without it, toggling the camera twice
 * quickly leaves an orphaned stream alive with no reference to stop it.
 */

type UseDevicePreviewOptions = {
  /** Preview runs only while this is true. Turning it off stops every track. */
  active: boolean;
  /** Applied to the audio constraint; the real Krisp filter is a LiveKit track processor. */
  noiseSuppression?: boolean;
};

export type DevicePreview = ReturnType<typeof useDevicePreview>;

export function useDevicePreview({
  active,
  noiseSuppression = true,
}: UseDevicePreviewOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);

  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");

  const [mediaError, setMediaError] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  // Speaker selection is output-only; it never restarts the capture stream.
  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    }) | null;
    if (!video?.setSinkId || !selectedSpeakerId) return;
    void video
      .setSinkId(selectedSpeakerId)
      .catch(() => setMediaError("Browser could not switch speaker output."));
  }, [selectedSpeakerId, cameraEnabled, active]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => {
      void refreshDevices(generationRef.current);
    };
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, []);

  async function refreshDevices(expectedGeneration?: number) {
    if (!navigator.mediaDevices?.enumerateDevices) return true;
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (expectedGeneration !== undefined && expectedGeneration !== generationRef.current) {
      return false;
    }
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const microphones = devices.filter((device) => device.kind === "audioinput");
    const speakers = devices.filter((device) => device.kind === "audiooutput");
    setCameraDevices(cameras);
    setMicrophoneDevices(microphones);
    setSpeakerDevices(speakers);

    setSelectedCameraId((current) => current || (cameras[0]?.deviceId ?? ""));
    setSelectedMicrophoneId((current) => current || (microphones[0]?.deviceId ?? ""));
    setSelectedSpeakerId((current) => current || (speakers[0]?.deviceId ?? ""));
    return true;
  }

  function startMicMeter(stream: MediaStream) {
    if (stream.getAudioTracks().length === 0) return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 256;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setMicLevel(Math.min(100, Math.round((average / 128) * 100)));
      animationRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopMedia() {
    generationRef.current += 1;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setMicLevel(0);
  }

  async function startMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("This browser does not support camera and microphone preview.");
      return null;
    }

    stopMedia();
    const generation = generationRef.current;
    setMediaError("");

    if (!cameraEnabled && !microphoneEnabled) {
      if (videoRef.current) videoRef.current.srcObject = null;
      await refreshDevices(generation);
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraEnabled
          ? selectedCameraId
            ? { deviceId: { exact: selectedCameraId } }
            : true
          : false,
        audio: microphoneEnabled
          ? {
              deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
              noiseSuppression,
              echoCancellation: true,
            }
          : false,
      });

      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const isCurrent = await refreshDevices(generation);
      if (!isCurrent || generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        return null;
      }
      startMicMeter(stream);
      return stream;
    } catch (error) {
      if (generation !== generationRef.current) return null;
      // Denying the permission prompt lands here. It is a normal outcome, not a fault —
      // the surface stays usable and the message explains why there is no picture.
      setMediaError(
        error instanceof Error ? error.message : "Unable to access camera or microphone.",
      );
      if (videoRef.current) videoRef.current.srcObject = null;
      return null;
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!active) return;
      const stream = await startMedia();
      if (!isMounted && stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    }

    void init();

    return () => {
      isMounted = false;
      stopMedia();
    };
    // These are the controls that must restart capture; the helpers close over them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    cameraEnabled,
    microphoneEnabled,
    noiseSuppression,
    selectedCameraId,
    selectedMicrophoneId,
  ]);

  return {
    videoRef,
    cameraEnabled,
    setCameraEnabled,
    microphoneEnabled,
    setMicrophoneEnabled,
    cameraDevices,
    microphoneDevices,
    speakerDevices,
    selectedCameraId,
    setSelectedCameraId,
    selectedMicrophoneId,
    setSelectedMicrophoneId,
    selectedSpeakerId,
    setSelectedSpeakerId,
    mediaError,
    micLevel,
  };
}
