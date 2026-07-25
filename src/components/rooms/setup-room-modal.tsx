"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  VideoCamera,
  VideoCameraSlash,
  Microphone,
  MicrophoneSlash,
  SpeakerHigh,
  X,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useTranslationRoom, useJoinTranslationRoomByCode } from "@/hooks/use-translationRooms";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { toast } from "sonner";
import { DeviceSelect } from "@/components/rooms/setup/device-select";
import { LanguageRoleConfirm } from "@/components/rooms/setup/language-role-confirm";
import { AvEffectsToggle } from "@/components/rooms/setup/av-effects-toggle";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";

type SinkVideoElement = HTMLVideoElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function SetupRoomModal() {
  const router = useRouter();
  const roomId = useUIStore((state) => state.setupRoomId);
  const isOpen = useUIStore((state) => state.setupRoomModalOpen);
  const setIsOpen = useUIStore((state) => state.setSetupRoomModalOpen);
  const user = useAuthStore(state => state.user);
  
  const { data: room, isLoading: isLoadingRoom } = useTranslationRoom(roomId ?? "");
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";
  // Host is strictly the room owner (room.hostId). Workspace admins/owners are NOT the host:
  // the backend rejects a room start from a non-host with 403, so they enter as participants.
  const isHost = Boolean(room && user && room.hostId === user.id);
  const joinRoom = useJoinTranslationRoomByCode();
  const [isJoining, setIsJoining] = useState(false);

  const videoRef = useRef<SinkVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const [speakLanguage, setSpeakLanguage] = useState("vi");
  const [listenLanguage, setListenLanguage] = useState("vi");
  
  useEffect(() => {
    if (room && room.targetLanguages?.length > 0) {
      setListenLanguage(room.targetLanguages[0]);
      setSpeakLanguage(room.targetLanguages[0]);
    } else if (room) {
      setListenLanguage(room.sourceLanguage || "en");
      setSpeakLanguage(room.sourceLanguage || "en");
    }
  }, [room]);
  
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);

  // Krisp noise filter / background blur — applied as LiveKit track processors once in
  // the room (see src/hooks/use-track-processors.ts), not to this raw preview stream.
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);
  const [backgroundBlurEnabled, setBackgroundBlurEnabled] = useState(false);

  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    async function init() {
      if (!isOpen) return;
      const stream = await startMedia();
      if (!isMounted && stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    }
    
    void init();

    return () => {
      isMounted = false;
      stopMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraEnabled, microphoneEnabled, noiseSuppression, selectedCameraId, selectedMicrophoneId, isOpen]);

  useEffect(() => {
    if (!videoRef.current?.setSinkId || !selectedSpeakerId) return;
    void videoRef.current.setSinkId(selectedSpeakerId).catch(() => setMediaError("Browser could not switch speaker output."));
  }, [selectedSpeakerId]);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const microphones = devices.filter((device) => device.kind === "audioinput");
    const speakers = devices.filter((device) => device.kind === "audiooutput");
    setCameraDevices(cameras);
    setMicrophoneDevices(microphones);
    setSpeakerDevices(speakers);
    
    setSelectedCameraId((current) => current || (cameras.length > 0 ? cameras[0].deviceId : ""));
    setSelectedMicrophoneId((current) => current || (microphones.length > 0 ? microphones[0].deviceId : ""));
    setSelectedSpeakerId((current) => current || (speakers.length > 0 ? speakers[0].deviceId : ""));
  }

  async function startMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("This browser does not support camera and microphone preview.");
      return null;
    }

    stopMedia();
    setMediaError("");

    if (!cameraEnabled && !microphoneEnabled) {
      if (videoRef.current) videoRef.current.srcObject = null;
      await refreshDevices();
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraEnabled ? (selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true) : false,
        audio: microphoneEnabled
          ? {
              deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
              noiseSuppression,
              echoCancellation: true,
            }
          : false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      await refreshDevices();
      startMicMeter(stream);
      return stream;
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Unable to access camera or microphone.");
      if (videoRef.current) videoRef.current.srcObject = null;
      return null;
    }
  }

  function stopMedia() {
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
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setMicLevel(0);
  }

  function startMicMeter(stream: MediaStream) {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
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

  async function handleConfirm() {
    if (!room || isJoining) return;
    const displayName = (user?.fullName || user?.email || "Participant").trim();

    setIsJoining(true);
    try {
      // Register the user as a participant (translation_room_participants) BEFORE entering.
      // The old flow only cached device prefs and router.push'd straight to /room/{id},
      // so joiners were never recorded on the backend.
      const result = await joinRoom.mutateAsync({
        translationRoomCode: room.translationRoomCode,
        displayName,
        speakLanguage,
        listenLanguage,
        cameraEnabled,
        microphoneEnabled,
        speakerEnabled: true,
      });

      if (result.status !== "success" || !result.room) {
        toast.error(result.message || "Unable to join the room.");
        return;
      }

      window.sessionStorage.setItem('warptalk.join.preview', JSON.stringify({
        displayName,
        roomCode: room.translationRoomCode,
        speakLanguage,
        listenLanguage,
        cameraEnabled,
        microphoneEnabled,
        speakerEnabled: true,
        roomId: result.room.id,
        participantId: result.participant?.id,
      }));
      window.sessionStorage.setItem('warptalk.devices.preview', JSON.stringify({
        cameraEnabled,
        microphoneEnabled,
        noiseSuppressionEnabled,
        backgroundBlurEnabled,
      }));

      setIsOpen(false);
      router.push(`/room/${result.room.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join the room.");
    } finally {
      setIsJoining(false);
    }
  }

  if (!roomId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent 
        overlayClassName="!bg-black/40 !backdrop-blur-none" 
        className="max-w-[calc(100vw-2rem)] sm:max-w-[900px] w-full p-6 border-border/60 bg-white dark:bg-zinc-950 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden flex flex-col gap-6"
      >
        <DialogTitle className="sr-only">Setup Room</DialogTitle>

        <button 
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors z-10"
        >
          <X weight="bold" size={16} />
        </button>

        {/* Title Area */}
        <div className="w-full space-y-1">
          <h2 className="text-[20px] font-semibold tracking-tight text-foreground pr-8 flex items-center gap-3">
            {isLoadingRoom ? <><Lumidot variant={lumidotVariant} pattern="frame" glow={4} /> <span>Loading room...</span></> : room?.title || "Ready to join?"}
          </h2>
          <p className="text-[13px] text-ink-muted tracking-[-0.05px]">Room Code: {room?.translationRoomCode || roomId}</p>
        </div>

        {/* Main Container */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch min-h-[380px]">
          
          {/* Left Side: Video Preview Panel (Surface 1) */}
          <div className="w-full bg-surface-1 border border-border rounded-[8px] shadow-linear overflow-hidden relative flex flex-col">
            {cameraEnabled ? (
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover -scale-x-100" autoPlay muted playsInline />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-canvas">
                <div className="flex flex-col items-center gap-3 text-ink-muted">
                  <VideoCameraSlash className="w-12 h-12" weight="light" />
                  <span className="text-[14px] font-medium">Camera is off</span>
                </div>
              </div>
            )}

            {mediaError && (
              <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white text-[12px] px-3 py-2 rounded-[6px]">
                {mediaError}
              </div>
            )}

            {/* Quick Toggles Overlay */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-surface-1/80 backdrop-blur-xl border border-border p-1.5 rounded-[12px]">
              <button
                onClick={() => setMicrophoneEnabled(!microphoneEnabled)}
                className={cn(
                  "w-10 h-10 rounded-[8px] flex items-center justify-center transition-colors text-[14px]",
                  microphoneEnabled ? "bg-surface-2 text-ink hover:bg-surface-3" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                )}
              >
                {microphoneEnabled ? <Microphone className="w-4 h-4" /> : <MicrophoneSlash className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setCameraEnabled(!cameraEnabled)}
                className={cn(
                  "w-10 h-10 rounded-[8px] flex items-center justify-center transition-colors text-[14px]",
                  cameraEnabled ? "bg-surface-2 text-ink hover:bg-surface-3" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                )}
              >
                {cameraEnabled ? <VideoCamera className="w-4 h-4" /> : <VideoCameraSlash className="w-4 h-4" />}
              </button>

              <div className="h-6 w-[1px] bg-border/60 mx-0.5" />

              <AvEffectsToggle
                noiseSuppressionEnabled={noiseSuppressionEnabled}
                onToggleNoiseSuppression={() => setNoiseSuppressionEnabled((current) => !current)}
                backgroundBlurEnabled={backgroundBlurEnabled}
                onToggleBackgroundBlur={() => setBackgroundBlurEnabled((current) => !current)}
              />

              {/* Mic Meter */}
              {microphoneEnabled && (
                <div className="w-1.5 h-8 bg-surface-2 rounded-full overflow-hidden flex items-end ml-1 mr-2">
                  <div 
                    className="w-full bg-semantic-success transition-all duration-75 ease-out rounded-full" 
                    style={{ height: `${micLevel}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Settings Panel (Surface 1) */}
          <div className="w-full bg-surface-1 border border-border rounded-[8px] shadow-linear overflow-hidden flex flex-col">
            
            <div className="flex-1 p-5 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Devices Section */}
              <div className="space-y-3">
                <h4 className="text-[13px] font-medium text-ink tracking-[0.4px]">Devices</h4>
                <div className="space-y-3">
                  <DeviceSelect 
                    label="Camera" icon={<VideoCamera className="w-4 h-4 text-ink-muted" />} 
                    value={selectedCameraId} onChange={setSelectedCameraId} 
                    devices={cameraDevices} fallback="Default Camera" 
                  />
                  <DeviceSelect 
                    label="Microphone" icon={<Microphone className="w-4 h-4 text-ink-muted" />} 
                    value={selectedMicrophoneId} onChange={setSelectedMicrophoneId} 
                    devices={microphoneDevices} fallback="Default Microphone" 
                  />
                  <DeviceSelect 
                    label="Speaker" icon={<SpeakerHigh className="w-4 h-4 text-ink-muted" />} 
                    value={selectedSpeakerId} onChange={setSelectedSpeakerId} 
                    devices={speakerDevices} fallback="Default Speaker" 
                  />
                </div>
              </div>

              {room && (
                <LanguageRoleConfirm
                  isHost={isHost}
                  roomSourceLanguage={room.sourceLanguage || "en"}
                  roomTargetLanguages={room.targetLanguages || []}
                  listenLanguage={listenLanguage}
                  setListenLanguage={setListenLanguage}
                  speakLanguage={speakLanguage}
                  setSpeakLanguage={setSpeakLanguage}
                />
              )}
            </div>

            <div className="p-4 border-t border-border bg-surface-1 shrink-0">
              <button
                onClick={handleConfirm}
                disabled={isJoining || isLoadingRoom || !room}
                className="flex items-center justify-center w-full bg-foreground text-white text-[13px] font-medium h-[36px] px-4 rounded-[6px] hover:opacity-90 transition-opacity shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isJoining
                  ? (isHost ? "Starting..." : "Joining...")
                  : (isHost ? "Start Meeting" : "Join Meeting")}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
