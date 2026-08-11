"use client";

import {
  ArrowLeft,
  ArrowRight,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useJoinTranslationRoomByCode } from "@/hooks/use-translationRooms";
import { getErrorMessage } from "@/lib/api/errors";
import { getFlagEmoji } from "@/lib/language/language-flag";
import { getLanguageName, languagesInScope } from "@/lib/language/languages";
import { NOISE_SUPPRESSION_PREFERENCE_VERSION } from "@/lib/meeting/track-effects-preferences";
import { completeMeetingJoin } from "@/lib/meeting/meeting-join-state";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "sonner";

// Was a hardcoded three — English, Vietnamese, Japanese — while a meeting can be created in
// six. A room declaring Korean, French or Spanish could not be joined in the language it was
// created for, because this screen simply never offered it.
const languages = languagesInScope("meeting").map((language) => ({
  value: language.locale,
  label: language.name,
}));

function getLanguageBadge(locale: string) {
  const [, region] = locale.split(/[-_]/);
  return (region || locale.slice(0, 2)).toUpperCase();
}

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
  const [roomCode, setRoomCode] = useState(searchParams.get("code") ?? "");
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

  const normalizedCode = useMemo(() => roomCode.trim(), [roomCode]);

  // The preflight call this screen used to make has no endpoint behind it — there is no
  // `preflight` route anywhere in translation-room. Every request 404'd, which tripped the
  // error branch below, which returned a dead end reading "This meeting or workspace is
  // inactive or no longer exists." So /join?code=<anything> was unreachable, and it blamed
  // the room for it.
  //
  // Joining does not need it: useJoinTranslationRoomByCode validates the code server-side
  // and returns the real reason when it refuses. The redirect this used to drive
  // (requiresJoinRequest -> /workspace/join) only ever fired when preflight SUCCEEDED, which
  // never happened, so nothing that worked is being removed here.
  const joinMutation = useJoinTranslationRoomByCode();
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
        completeMeetingJoin({
          storage: window.sessionStorage,
          roomId: result.room.id,
          workspaceSlug: activeWorkspaceSlug,
          joinState: {
            displayName: displayName.trim(),
            roomCode: normalizedCode,
            speakLanguage,
            listenLanguage,
            voiceEnabled,
            cameraEnabled,
            microphoneEnabled,
            speakerEnabled: true,
            participantId: result.participant?.id,
          },
          deviceState: {
            cameraEnabled,
            microphoneEnabled,
            noiseSuppressionEnabled,
            noiseSuppressionPreferenceVersion:
              NOISE_SUPPRESSION_PREFERENCE_VERSION,
            backgroundBlurEnabled,
          },
          navigate: (path) => router.push(path),
          closePreview: () => undefined,
        });

        toast.success("Joined room successfully.");
      } else {
        toast.error(result.message || "Failed to join room.");
      }
    } catch (error) {
      // WT-201: an AxiosError IS an Error, and its `.message` is only ever the generic
      // "Request failed with status code 400" — the reason the API actually gave
      // ("This room has already ended or has been cancelled.") lives in the response body.
      // getErrorMessage reads the body first, exactly as create-room-dialog already does.
      toast.error(getErrorMessage(error, "Could not join room."));
    }
  }

  // The "Checking meeting access…" spinner and the "inactive or no longer exists" dead end
  // that used to sit here were both driven by the preflight call removed above. With no
  // endpoint behind it the error branch caught every single visit, so this screen only ever
  // rendered its own failure. Whether the code is good is now answered by the join attempt,
  // which reports the actual reason.
  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-hidden px-4 py-3 sm:px-5">
      {/* Top Header Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-3 flex w-full items-center justify-start"
      >
        <button
          onClick={() =>
            router.push(`/${activeWorkspaceSlug || "workspace"}/rooms`)
          }
          className="flex items-center gap-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Meetings
        </button>
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
        className="grid min-h-0 w-full max-w-[1200px] flex-1 grid-cols-1 items-stretch gap-4 pb-2 md:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]"
      >
        {/* Left Side: Video Preview Panel (Surface 1) */}
        <div className="relative flex min-h-[360px] w-full flex-col overflow-hidden rounded-[8px] border border-border bg-surface-1 shadow-linear md:min-h-0">
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
                <VideoCameraSlash className="h-10 w-10" weight="light" />
                <span className="text-[13px] font-medium">Camera is off</span>
              </div>
            </div>
          )}

          {mediaError && (
            <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white text-[12px] px-3 py-2 rounded-[6px]">
              {mediaError}
            </div>
          )}

          {/* Quick Toggles Overlay */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-[12px] border border-border bg-surface-1/80 p-1.5 backdrop-blur-xl">
            <button
              onClick={() => setMicrophoneEnabled(!microphoneEnabled)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-[8px] text-[13px] transition-colors",
                microphoneEnabled
                  ? "bg-surface-2 text-ink hover:bg-surface-3"
                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20",
              )}
            >
              {microphoneEnabled ? (
                <Microphone className="h-4 w-4" />
              ) : (
                <MicrophoneSlash className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setCameraEnabled(!cameraEnabled)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-[8px] text-[13px] transition-colors",
                cameraEnabled
                  ? "bg-surface-2 text-ink hover:bg-surface-3"
                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20",
              )}
            >
              {cameraEnabled ? (
                <VideoCamera className="h-4 w-4" />
              ) : (
                <VideoCameraSlash className="h-4 w-4" />
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
        <div className="flex min-h-[360px] w-full flex-col overflow-hidden rounded-[8px] border border-border bg-surface-1 shadow-linear md:min-h-0">
          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
            {/* Room Code Section */}
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
              <h4 className="text-[12px] font-medium leading-[34px] tracking-[0.3px] text-ink">
                Meeting Code
              </h4>
              <Input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder="e.g. abc-defg-hij"
                autoFocus={!roomCode}
                className="h-[34px] rounded-[12px] border-border bg-canvas text-[12px] font-mono"
              />
            </div>

            {/* Join Details Section */}
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
              <h4 className="text-[12px] font-medium leading-[34px] tracking-[0.3px] text-ink">
                Language Routing
              </h4>
              <div className="grid h-[34px] w-full select-none grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-center gap-1 overflow-hidden rounded-[12px] border border-[#e2e3e7] bg-transparent p-1 text-[12px] dark:border-[#25272b]">
                <Select
                  value={speakLanguage}
                  onValueChange={(val) => val && setSpeakLanguage(val)}
                >
                  <SelectTrigger
                    size="sm"
                    className="!flex !h-[26px] !w-full !min-w-0 max-w-full items-center justify-center gap-1.5 overflow-hidden rounded-[8px] border border-[#d5d6dc] bg-[#ececf0] !px-2 !py-0 text-[12px] text-[#08090a] shadow-none hover:bg-[#e2e3e7] focus:ring-0 dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white dark:hover:bg-[#333438] [&>svg]:hidden"
                  >
                    <span className="w-5 shrink-0 text-center text-[10px] font-semibold leading-none tracking-[0.02em] text-current">
                      {getLanguageBadge(speakLanguage)}
                    </span>
                    <span className="min-w-0 truncate font-semibold text-current">
                      {getLanguageName(speakLanguage)}
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

                <span className="flex h-full items-center justify-center text-muted-foreground/45">
                  <ArrowRight className="h-3 w-3" />
                </span>

                <Select
                  value={listenLanguage}
                  onValueChange={(val) => val && setListenLanguage(val)}
                >
                  <SelectTrigger
                    size="sm"
                    className="!flex !h-[26px] !w-full !min-w-0 max-w-full items-center justify-center gap-1.5 overflow-hidden rounded-[8px] border border-[#d5d6dc] bg-[#ececf0] !px-2 !py-0 text-[12px] text-[#08090a] shadow-none hover:bg-[#e2e3e7] focus:ring-0 dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white dark:hover:bg-[#333438] [&>svg]:hidden"
                  >
                    <span className="w-5 shrink-0 text-center text-[10px] font-semibold leading-none tracking-[0.02em] text-current">
                      {getLanguageBadge(listenLanguage)}
                    </span>
                    <span className="min-w-0 truncate font-semibold text-current">
                      {getLanguageName(listenLanguage)}
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
            <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
              <h4 className="pt-[7px] text-[12px] font-medium tracking-[0.3px] text-ink">
                Audio Output
              </h4>
              <div className="space-y-1.5">
                <div className="grid h-[34px] w-full select-none grid-cols-2 items-center gap-1 rounded-[12px] border border-[#e2e3e7] bg-transparent p-1 text-[12px] dark:border-[#25272b]">
                  <button
                    type="button"
                    onClick={() => setVoiceEnabled(true)}
                    className={cn(
                      "flex h-full min-w-0 items-center justify-center gap-1.5 rounded-[9px] px-2 py-0 font-medium transition-colors",
                      voiceEnabled
                        ? "border border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
                        : "border border-transparent text-[#6b7280] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:text-[#9fa0a5] dark:hover:bg-[#232524] dark:hover:text-white",
                    )}
                  >
                    <SpeakerHigh className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Voice + Text</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoiceEnabled(false)}
                    className={cn(
                      "flex h-full min-w-0 items-center justify-center gap-1.5 rounded-[9px] px-2 py-0 font-medium transition-colors",
                      !voiceEnabled
                        ? "border border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
                        : "border border-transparent text-[#6b7280] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:text-[#9fa0a5] dark:hover:bg-[#232524] dark:hover:text-white",
                    )}
                  >
                    <SpeakerSlash className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Text only</span>
                  </button>
                </div>
                <p className="text-[11px] leading-4 text-ink-muted">
                  {voiceEnabled
                    ? "You'll hear the AI interpreter and see the transcript."
                    : "You'll only see the live transcript — no AI voice will play."}
                </p>
              </div>
            </div>

            {/* Devices Section */}
            <div className="space-y-2 border-t border-border/60 pt-3">
              <h4 className="text-[12px] font-medium tracking-[0.3px] text-ink">
                Devices
              </h4>
              <div className="space-y-2">
                <DeviceSelect
                  label="Camera"
                  icon={<VideoCamera className="h-3.5 w-3.5 text-ink-muted" />}
                  value={selectedCameraId}
                  onChange={setSelectedCameraId}
                  devices={cameraDevices}
                  fallback="Default Camera"
                />
                <DeviceSelect
                  label="Microphone"
                  icon={<Microphone className="h-3.5 w-3.5 text-ink-muted" />}
                  value={selectedMicrophoneId}
                  onChange={setSelectedMicrophoneId}
                  devices={microphoneDevices}
                  fallback="Default Microphone"
                />
                <DeviceSelect
                  label="Speaker"
                  icon={<SpeakerHigh className="h-3.5 w-3.5 text-ink-muted" />}
                  value={selectedSpeakerId}
                  onChange={setSelectedSpeakerId}
                  devices={speakerDevices}
                  fallback="Default Speaker"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-surface-1 p-4">
            <Button
              onClick={handleJoin}
              disabled={!canJoin || joinMutation.isPending}
              className="flex h-[34px] w-full items-center justify-center rounded-[6px] bg-primary px-4 text-[12px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:!bg-surface-3 disabled:!text-ink-muted disabled:!opacity-100"
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
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
        {icon} {label}
      </label>
      <Select
        value={validValue}
        onValueChange={(val) => onChange(val === "default" ? "" : (val ?? ""))}
      >
        <SelectTrigger className="h-[30px] w-full truncate rounded-[12px] border border-border bg-canvas text-[12px] text-ink focus:border-ring focus:ring-2 focus:ring-ring/50">
          {displayValue}
        </SelectTrigger>
        <SelectContent className="bg-surface-1 border-border text-ink rounded-[6px]">
          <SelectItem
            value="default"
            className="text-[12px] focus:bg-surface-2 focus:text-ink"
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
                className="truncate text-[12px] focus:bg-surface-2 focus:text-ink"
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
