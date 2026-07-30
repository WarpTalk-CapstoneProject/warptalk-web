"use client";

import {
  ArrowLeft,
  Microphone,
  MicrophoneSlash,
  SpeakerHigh,
  SpeakerSlash,
  VideoCamera,
  VideoCameraSlash,
} from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { AvEffectsToggle } from "@/components/rooms/setup/av-effects-toggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useJoinTranslationRoomByCode } from "@/hooks/use-translationRooms";
import { NOISE_SUPPRESSION_PREFERENCE_VERSION } from "@/lib/track-effects-preferences";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "sonner";

const languages = [
  { value: "en-US", label: "English" },
  { value: "vi-VN", label: "Vietnamese" },
  { value: "ja-JP", label: "Japanese" },
];

const getFlagEmoji = (countryCode: string) => {
  if (!countryCode) return "";
  const code = countryCode.split("-")[1] || countryCode.toUpperCase();
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

type SinkVideoElement = HTMLVideoElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export default function JoinMeetingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <p className="text-sm text-ink-muted">Loading...</p>
        </div>
      }
    >
      <JoinMeetingContent />
    </Suspense>
  );
}

function JoinMeetingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );

  const videoRef = useRef<SinkVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const displayName = user?.fullName || user?.email || "Guest";
  const [roomCode] = useState(searchParams.get("code") ?? "");
  const [speakLanguage, setSpeakLanguage] = useState("vi-VN");
  const [listenLanguage, setListenLanguage] = useState("en-US");
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [noiseSuppression] = useState(true);

  // Krisp noise filter / background blur — applied as LiveKit track processors once in
  // the room (see src/hooks/use-track-processors.ts), not to this raw preview stream.
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(false);
  const [backgroundBlurEnabled, setBackgroundBlurEnabled] = useState(false);

  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>(
    [],
  );
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  const joinMutation = useJoinTranslationRoomByCode();
  const normalizedCode = useMemo(() => roomCode.trim(), [roomCode]);
  const canJoin = displayName.trim().length > 1 && normalizedCode.length >= 4;

  useEffect(() => {
    if (!videoRef.current?.setSinkId || !selectedSpeakerId) return;
    void videoRef.current
      .setSinkId(selectedSpeakerId)
      .catch(() => setMediaError("Browser could not switch speaker output."));
  }, [selectedSpeakerId]);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const microphones = devices.filter(
      (device) => device.kind === "audioinput",
    );
    const speakers = devices.filter((device) => device.kind === "audiooutput");
    setCameraDevices(cameras);
    setMicrophoneDevices(microphones);
    setSpeakerDevices(speakers);

    setSelectedCameraId(
      (current) => current || (cameras.length > 0 ? cameras[0].deviceId : ""),
    );
    setSelectedMicrophoneId(
      (current) =>
        current || (microphones.length > 0 ? microphones[0].deviceId : ""),
    );
    setSelectedSpeakerId(
      (current) => current || (speakers.length > 0 ? speakers[0].deviceId : ""),
    );
  }

  async function startMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError(
        "This browser does not support camera and microphone preview.",
      );
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
        video: cameraEnabled
          ? selectedCameraId
            ? { deviceId: { exact: selectedCameraId } }
            : true
          : false,
        audio: microphoneEnabled
          ? {
              deviceId: selectedMicrophoneId
                ? { exact: selectedMicrophoneId }
                : undefined,
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
      setMediaError(
        error instanceof Error
          ? error.message
          : "Unable to access camera or microphone.",
      );
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

  useEffect(() => {
    let isMounted = true;

    async function init() {
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
    // Media helpers intentionally restart the preview when these controls change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cameraEnabled,
    microphoneEnabled,
    noiseSuppression,
    selectedCameraId,
    selectedMicrophoneId,
  ]);

  async function handleJoin() {
    if (!canJoin) {
      toast.error("Enter your display name and room code first.");
      return;
    }

    try {
      const result = await joinMutation.mutateAsync({
        translationRoomCode: normalizedCode,
        displayName: displayName.trim(),
        speakLanguage,
        listenLanguage,
        cameraEnabled,
        microphoneEnabled,
        speakerEnabled: true,
      });

      if (result.status === "success" && result.room) {
        window.sessionStorage.setItem(
          `warptalk.join.preview`,
          JSON.stringify({
            displayName: displayName.trim(),
            roomCode: normalizedCode,
            speakLanguage,
            listenLanguage,
            voiceEnabled,
            cameraEnabled,
            microphoneEnabled,
            speakerEnabled: true,
            roomId: result.room.id,
            participantId: result.participant?.id,
          }),
        );
        window.sessionStorage.setItem(
          "warptalk.devices.preview",
          JSON.stringify({
            cameraEnabled,
            microphoneEnabled,
            noiseSuppressionEnabled,
            noiseSuppressionPreferenceVersion:
              NOISE_SUPPRESSION_PREFERENCE_VERSION,
            backgroundBlurEnabled,
          }),
        );

        toast.success("Joined room successfully.");
        // Go straight to the room since they just setup their devices!
        router.push(`/room/${result.room.id}`);
      } else {
        toast.error(result.message || "Failed to join room.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not join room.",
      );
    }
  }

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 h-full overflow-y-auto">
      {/* Top Header Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-[960px] flex items-center justify-between mb-4 mt-4"
      >
        <button
          onClick={() =>
            router.push(`/${activeWorkspaceSlug || "workspace"}/rooms`)
          }
          className="flex items-center gap-2 text-[13px] text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Meetings
        </button>
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full max-w-[960px] space-y-1 mb-6"
      >
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
          Join Translation Room
        </h1>
        <p className="text-[14px] text-ink-muted tracking-[-0.05px]">
          Enter the meeting code and configure your devices.
        </p>
      </motion.div>

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 0.5,
          delay: 0.2,
          type: "spring",
          stiffness: 200,
          damping: 20,
        }}
        className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch pb-12"
      >
        {/* Left Side: Video Preview Panel (Surface 1) */}
        <div className="w-full bg-surface-1 border border-border rounded-[8px] shadow-linear overflow-hidden relative flex flex-col h-full min-h-[460px]">
          {cameraEnabled ? (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover -scale-x-100"
              autoPlay
              muted
              playsInline
            />
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
                microphoneEnabled
                  ? "bg-surface-2 text-ink hover:bg-surface-3"
                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20",
              )}
            >
              {microphoneEnabled ? (
                <Microphone className="w-4 h-4" />
              ) : (
                <MicrophoneSlash className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => setCameraEnabled(!cameraEnabled)}
              className={cn(
                "w-10 h-10 rounded-[8px] flex items-center justify-center transition-colors text-[14px]",
                cameraEnabled
                  ? "bg-surface-2 text-ink hover:bg-surface-3"
                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20",
              )}
            >
              {cameraEnabled ? (
                <VideoCamera className="w-4 h-4" />
              ) : (
                <VideoCameraSlash className="w-4 h-4" />
              )}
            </button>

            <div className="h-6 w-[1px] bg-border/60 mx-0.5" />

            <AvEffectsToggle
              noiseSuppressionEnabled={noiseSuppressionEnabled}
              onToggleNoiseSuppression={() =>
                setNoiseSuppressionEnabled((current) => !current)
              }
              backgroundBlurEnabled={backgroundBlurEnabled}
              onToggleBackgroundBlur={() =>
                setBackgroundBlurEnabled((current) => !current)
              }
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
        <div className="w-full bg-surface-1 border border-border rounded-[8px] shadow-linear overflow-hidden flex flex-col h-full min-h-[460px]">
          <div className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar">
            {/* Join Details Section */}
            <div className="space-y-4">
              <h4 className="text-[13px] font-medium text-ink tracking-[0.4px]">
                Language Routing
              </h4>
              <div className="flex items-center gap-1 p-1 w-fit rounded-full border border-border/60 bg-transparent select-none text-[13px]">
                <Select
                  value={speakLanguage}
                  onValueChange={(val) => val && setSpeakLanguage(val)}
                >
                  <SelectTrigger className="flex items-center gap-1.5 px-2.5 py-[3px] h-auto border-0 bg-transparent shadow-none rounded-full hover:bg-surface-2 focus:ring-0 [&>svg]:hidden">
                    <span className="leading-none text-[14px]">
                      {getFlagEmoji(speakLanguage)}
                    </span>
                    <span className="font-medium text-ink">
                      {speakLanguage.split("-")[0].toUpperCase()}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/50 shadow-xl">
                    {languages.map((l) => (
                      <SelectItem
                        key={l.value}
                        value={l.value}
                        className="text-[13px] cursor-pointer rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] leading-none">
                            {getFlagEmoji(l.value)}
                          </span>
                          <span className="font-medium">{l.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-muted-foreground/40 font-bold px-1 text-[11px]">
                  →
                </span>

                <Select
                  value={listenLanguage}
                  onValueChange={(val) => val && setListenLanguage(val)}
                >
                  <SelectTrigger className="flex items-center gap-1.5 px-2.5 py-[3px] h-auto border-0 bg-transparent shadow-none rounded-full hover:bg-surface-2 focus:ring-0 [&>svg]:hidden">
                    <span className="leading-none text-[14px]">
                      {getFlagEmoji(listenLanguage)}
                    </span>
                    <span className="font-medium text-ink">
                      {listenLanguage.split("-")[0].toUpperCase()}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/50 shadow-xl">
                    {languages.map((l) => (
                      <SelectItem
                        key={l.value}
                        value={l.value}
                        className="text-[13px] cursor-pointer rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] leading-none">
                            {getFlagEmoji(l.value)}
                          </span>
                          <span className="font-medium">{l.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Audio Output Section */}
            <div className="space-y-4">
              <h4 className="text-[13px] font-medium text-ink tracking-[0.4px]">
                Audio Output
              </h4>
              <div className="flex items-center gap-1 p-1 w-fit rounded-full border border-border/60 bg-transparent select-none text-[13px]">
                <button
                  type="button"
                  onClick={() => setVoiceEnabled(true)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-[3px] rounded-full font-medium transition-colors",
                    voiceEnabled
                      ? "bg-surface-2 text-ink"
                      : "text-ink-muted hover:bg-surface-2",
                  )}
                >
                  <SpeakerHigh className="w-3.5 h-3.5" />
                  Voice + Text
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceEnabled(false)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-[3px] rounded-full font-medium transition-colors",
                    !voiceEnabled
                      ? "bg-surface-2 text-ink"
                      : "text-ink-muted hover:bg-surface-2",
                  )}
                >
                  <SpeakerSlash className="w-3.5 h-3.5" />
                  Text only
                </button>
              </div>
              <p className="text-[12px] text-ink-muted">
                {voiceEnabled
                  ? "You'll hear the AI interpreter and see the transcript."
                  : "You'll only see the live transcript — no AI voice will play."}
              </p>
            </div>

            {/* Devices Section */}
            <div className="space-y-4">
              <h4 className="text-[13px] font-medium text-ink tracking-[0.4px]">
                Devices
              </h4>
              <div className="space-y-4">
                <DeviceSelect
                  label="Camera"
                  icon={<VideoCamera className="w-4 h-4 text-ink-muted" />}
                  value={selectedCameraId}
                  onChange={setSelectedCameraId}
                  devices={cameraDevices}
                  fallback="Default Camera"
                />
                <DeviceSelect
                  label="Microphone"
                  icon={<Microphone className="w-4 h-4 text-ink-muted" />}
                  value={selectedMicrophoneId}
                  onChange={setSelectedMicrophoneId}
                  devices={microphoneDevices}
                  fallback="Default Microphone"
                />
                <DeviceSelect
                  label="Speaker"
                  icon={<SpeakerHigh className="w-4 h-4 text-ink-muted" />}
                  value={selectedSpeakerId}
                  onChange={setSelectedSpeakerId}
                  devices={speakerDevices}
                  fallback="Default Speaker"
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-border bg-surface-1">
            <Button
              onClick={handleJoin}
              disabled={!canJoin || joinMutation.isPending}
              className="flex items-center justify-center w-full bg-foreground text-white text-[13px] font-medium h-[32px] px-4 rounded-[6px] hover:opacity-90 transition-opacity shadow-sm"
            >
              {joinMutation.isPending ? "Joining..." : "Join Meeting"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Sub-components

function DeviceSelect({
  label,
  icon,
  value,
  devices,
  fallback,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  devices: MediaDeviceInfo[];
  fallback: string;
  onChange: (val: string) => void;
}) {
  const selectedDevice = devices.find((d) => d.deviceId === value);
  const validValue = selectedDevice ? value : "default";

  let displayValue = fallback;
  if (selectedDevice) {
    let deviceName =
      selectedDevice.label && selectedDevice.label.trim() !== ""
        ? selectedDevice.label
        : `${label} ${devices.indexOf(selectedDevice) + 1}`;
    if (deviceName === selectedDevice.deviceId || deviceName.length > 40) {
      deviceName = `${label} ${devices.indexOf(selectedDevice) + 1}`;
    }
    displayValue = deviceName;
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium flex items-center gap-1.5 text-ink-muted">
        {icon} {label}
      </label>
      <Select
        value={validValue}
        onValueChange={(val) => onChange(val === "default" ? "" : (val ?? ""))}
      >
        <SelectTrigger className="h-[32px] bg-canvas border border-border text-ink text-[13px] rounded-[6px] w-full truncate focus:ring-2 focus:ring-ring/50 focus:border-ring">
          {displayValue}
        </SelectTrigger>
        <SelectContent className="bg-surface-1 border-border text-ink rounded-[6px]">
          <SelectItem
            value="default"
            className="focus:bg-surface-2 focus:text-ink text-[13px]"
          >
            {fallback}
          </SelectItem>
          {devices.map((d, i: number) => {
            let deviceName =
              d.label && d.label.trim() !== "" ? d.label : `${label} ${i + 1}`;
            if (deviceName === d.deviceId || deviceName.length > 40) {
              deviceName = `${label} ${i + 1}`;
            }
            const deviceId = d.deviceId || `device-${i}`;
            return (
              <SelectItem
                key={deviceId}
                value={deviceId}
                className="focus:bg-surface-2 focus:text-ink text-[13px] truncate"
              >
                {deviceName}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
