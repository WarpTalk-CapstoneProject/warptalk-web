"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  VideoCamera,
  VideoCameraSlash,
  Microphone,
  MicrophoneSlash,
  SpeakerHigh,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { motion } from "motion/react";
import { useTranslationRoom } from "@/hooks/use-translationRooms";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { DeviceSelect } from "@/components/rooms/setup/device-select";
import { LanguageRoleConfirm } from "@/components/rooms/setup/language-role-confirm";

const languages = [
  { value: "en-US", label: "English" },
  { value: "vi-VN", label: "Vietnamese" },
  { value: "ja-JP", label: "Japanese" },
];

type SinkVideoElement = HTMLVideoElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export default function RoomSetupPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomId = params.id;
  const user = useAuthStore(state => state.user);
  
  const { data: room, isLoading: isLoadingRoom } = useTranslationRoom(roomId);
  const { isAdmin, isOwner } = useWorkspaceRole(room?.workspaceId);
  const isHost = Boolean(room && user && (room.hostId === user.id || isAdmin || isOwner));

  const videoRef = useRef<SinkVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const [speakLanguage, setSpeakLanguage] = useState("vi");
  const [listenLanguage, setListenLanguage] = useState("vi");
  const [transcriptEnabled, setTranscriptEnabled] = useState(true);
  
  useEffect(() => {
    if (room && room.targetLanguages?.length > 0) {
      // Default to the first target language if available
      setListenLanguage(room.targetLanguages[0]);
      setSpeakLanguage(room.targetLanguages[0]);
    } else if (room) {
      setListenLanguage(room.sourceLanguage);
      setSpeakLanguage(room.sourceLanguage);
    }
  }, [room]);
  
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);

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
  }, [cameraEnabled, microphoneEnabled, noiseSuppression, selectedCameraId, selectedMicrophoneId]);

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

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 h-full overflow-y-auto">
      {/* Top Header Navigation */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="w-full max-w-[960px] flex items-center justify-between mb-4"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[13px] text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </motion.div>

      {/* Title */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full max-w-[960px] space-y-1 mb-6"
      >
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
          {isLoadingRoom ? "Loading room..." : room?.title || "Ready to join?"}
        </h1>
        <p className="text-[14px] text-ink-muted tracking-[-0.05px]">Room Code: {room?.translationRoomCode || roomId}</p>
      </motion.div>

      {/* Main Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
        className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch"
      >
        
        {/* Left Side: Video Preview Panel (Surface 1) */}
        <div className="w-full bg-surface-1 border border-border rounded-[8px] shadow-linear overflow-hidden relative flex flex-col h-full min-h-[460px]">
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
        <div className="w-full bg-surface-1 border border-border rounded-[8px] shadow-linear overflow-hidden flex flex-col h-full min-h-[460px]">
          
          <div className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar">
            
            {/* Devices Section */}
            <div className="space-y-4">
              <h4 className="text-[13px] font-medium text-ink tracking-[0.4px]">Devices</h4>
              <div className="space-y-4">
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
                roomSourceLanguage={room.sourceLanguage}
                roomTargetLanguages={room.targetLanguages ?? []}
                listenLanguage={listenLanguage}
                setListenLanguage={setListenLanguage}
                speakLanguage={speakLanguage}
                setSpeakLanguage={setSpeakLanguage}
              />
            )}
          </div>

          <div className="p-6 border-t border-border bg-surface-1">
            <button
              onClick={() => {
                window.sessionStorage.setItem('warptalk.devices.preview', JSON.stringify({
                  cameraEnabled,
                  microphoneEnabled,
                }));
                router.push(`/room/${roomId}`);
              }}
              className="flex items-center justify-center w-full bg-foreground text-white text-[13px] font-medium h-[32px] px-4 rounded-[6px] hover:opacity-90 transition-opacity shadow-sm"
            >
              {isHost ? "Start Meeting" : "Join Meeting"}
            </button>
          </div>
        </div>

      </motion.div>
    </div>
  );
}





declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
