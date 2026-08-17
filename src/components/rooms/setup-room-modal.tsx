"use client";

import {
  Microphone,
  MicrophoneSlash,
  SpeakerHigh,
  VideoCamera,
  VideoCameraSlash,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AvEffectsToggle } from "@/components/rooms/setup/av-effects-toggle";
import { DeviceSelect } from "@/components/rooms/setup/device-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { getFlagEmoji } from "@/lib/language/language-flag";
import { resolvePreJoinLanguages, snapPairIntoOptions } from "@/lib/language/prejoin";
import { parseTargetLanguages } from "@/lib/language/languages";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  useJoinLanguagePolicy,
  useJoinTranslationRoomByCode,
  useTranslationRoom,
} from "@/hooks/use-translationRooms";
import {
  canJoinTranslationRoom,
  shouldEnterWaitingRoom,
} from "@/lib/meeting/translation-room-access";
import { completeMeetingJoin } from "@/lib/meeting/meeting-join-state";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { NOISE_SUPPRESSION_PREFERENCE_VERSION } from "@/lib/meeting/track-effects-preferences";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";
import { toast } from "sonner";

type SinkVideoElement = HTMLVideoElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function SetupRoomModal() {
  const router = useRouter();
  const roomId = useUIStore((state) => state.setupRoomId);
  const isOpen = useUIStore((state) => state.setupRoomModalOpen);
  const setIsOpen = useUIStore((state) => state.setSetupRoomModalOpen);
  const user = useAuthStore((state) => state.user);

  // WT-434: the join payload seeds from the user's remembered languages (see handleConfirm).
  // Loading tolerated — an unresolved query only means the room-default fallback, which is
  // exactly what this modal always sent before.
  const { data: userSettings } = useUserSettings();
  const { data: room, isLoading: isLoadingRoom } = useTranslationRoom(
    roomId ?? "",
  );
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
  const mediaGenerationRef = useRef(0);

  // WT-494 — language IS chosen here again, and by the same rule /join uses.
  //
  // It was removed on the argument that the setup step is about devices and the in-meeting picker
  // can react to who is actually present. But the pair was still being DECIDED here, silently, and
  // /join went on asking for it: the same person joining the same meeting got one pair coming
  // through the meetings list and possibly another through /join, and only /join let them see or
  // correct it. That is the reported bug. Deciding silently is not the same as not deciding.
  //
  // The offered set and the starting pair both come from lib/language/prejoin.ts, so the two
  // surfaces cannot drift again — including WT-490's narrowing by the room's own languages.
  const { data: joinLanguagePolicy } = useJoinLanguagePolicy(room?.translationRoomCode ?? "");
  const preJoin = useMemo(
    () =>
      resolvePreJoinLanguages({
        allowedTargetLanguages: joinLanguagePolicy?.allowedTargetLanguages,
        roomLanguages: joinLanguagePolicy?.roomLanguages,
        savedSpeakLanguage: userSettings?.defaultSpeakLanguage,
        savedListenLanguage: userSettings?.defaultListenLanguage,
        room: room
          ? {
              sourceLanguage: room.sourceLanguage,
              targetLanguages: parseTargetLanguages(room.targetLanguages),
            }
          : null,
      }),
    [
      joinLanguagePolicy?.allowedTargetLanguages,
      joinLanguagePolicy?.roomLanguages,
      userSettings?.defaultSpeakLanguage,
      userSettings?.defaultListenLanguage,
      room,
    ],
  );

  const [speakLanguage, setSpeakLanguage] = useState("");
  const [listenLanguage, setListenLanguage] = useState("");
  const [languagesTouched, setLanguagesTouched] = useState(false);

  // Same seed-or-snap rule as /join, applied during render rather than in an effect so the
  // dropdowns never paint a language the room forbids. Untouched, the whole seed applies; once
  // the user has chosen, only a value that stopped being offered moves.
  const [appliedLanguagePolicyKey, setAppliedLanguagePolicyKey] = useState<string | null>(null);
  const languagePolicyKey = joinLanguagePolicy
    ? preJoin.options.map((language) => language.locale).join(",")
    : null;
  if (languagePolicyKey && appliedLanguagePolicyKey !== languagePolicyKey) {
    setAppliedLanguagePolicyKey(languagePolicyKey);
    if (languagesTouched) {
      const snapped = snapPairIntoOptions({ speakLanguage, listenLanguage }, preJoin.options);
      if (snapped.speakLanguage !== speakLanguage) setSpeakLanguage(snapped.speakLanguage);
      if (snapped.listenLanguage !== listenLanguage) setListenLanguage(snapped.listenLanguage);
    } else {
      setSpeakLanguage(preJoin.speakLanguage);
      setListenLanguage(preJoin.listenLanguage);
    }
  }

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

  useEffect(() => {
    if (!videoRef.current?.setSinkId || !selectedSpeakerId) return;
    void videoRef.current
      .setSinkId(selectedSpeakerId)
      .catch(() => setMediaError("Browser could not switch speaker output."));
  }, [selectedSpeakerId, cameraEnabled, isOpen]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => {
      void refreshDevices(mediaGenerationRef.current);
    };
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, []);

  async function refreshDevices(expectedGeneration?: number) {
    if (!navigator.mediaDevices?.enumerateDevices) return true;
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (
      expectedGeneration !== undefined &&
      expectedGeneration !== mediaGenerationRef.current
    ) {
      return false;
    }
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
    return true;
  }

  async function startMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError(
        "This browser does not support camera and microphone preview.",
      );
      return null;
    }

    stopMedia();
    const generation = mediaGenerationRef.current;
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
              deviceId: selectedMicrophoneId
                ? { exact: selectedMicrophoneId }
                : undefined,
              noiseSuppression,
              echoCancellation: true,
            }
          : false,
      });

      if (generation !== mediaGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      const isCurrent = await refreshDevices(generation);
      if (!isCurrent || generation !== mediaGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        return null;
      }
      startMicMeter(stream);
      return stream;
    } catch (error) {
      if (generation !== mediaGenerationRef.current) return null;
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
    mediaGenerationRef.current += 1;
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
      if (!isOpen) return;
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
    isOpen,
  ]);

  async function handleConfirm() {
    if (!room || isJoining) return;
    if (!canJoinTranslationRoom(room.status)) {
      toast.error("This meeting is no longer available to join.");
      setIsOpen(false);
      return;
    }
    const displayName = (user?.fullName || user?.email || "Participant").trim();

    // WT-494: whatever the dropdowns show is what goes on the wire. It was computed here instead,
    // by a chain that agreed with /join on its first step (the user's remembered languages —
    // WT-434, so a rejoin does not reset a returning speaker) and differed after it, with nothing
    // on screen either way. What goes on the wire here also lands in sessionStorage as this room's
    // saved preference, so a value the user never saw poisons every later in-meeting resolution.
    if (!speakLanguage || !listenLanguage) {
      toast.error("No language is available for this meeting. Ask the host to check its settings.");
      return;
    }

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

      completeMeetingJoin({
        storage: window.sessionStorage,
        roomId: result.room.id,
        workspaceSlug: useWorkspaceStore.getState().activeWorkspaceSlug,
        joinState: {
          displayName,
          roomCode: room.translationRoomCode,
          speakLanguage,
          listenLanguage,
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
        closePreview: () => setIsOpen(false),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not join the room.",
      );
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
            {isLoadingRoom ? (
              <>
                <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />{" "}
                <span>Loading room...</span>
              </>
            ) : (
              room?.title || "Ready to join?"
            )}
          </h2>
          <p className="text-[13px] text-ink-muted tracking-[-0.05px]">
            Room Code: {room?.translationRoomCode || roomId}
          </p>
        </div>

        {/* Main Container */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch min-h-[380px]">
          {/* Left Side: Video Preview Panel (Surface 1) */}
          <div className="w-full bg-surface-1 border border-border rounded-[8px] shadow-linear overflow-hidden relative flex flex-col">
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
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-4">
              {/* WT-494: the same question /join asks, in the same words, narrowed by the same
                  rule. Rendered whenever the room offers anything — including for the host, who
                  used to be told their source language rather than asked, and therefore entered
                  with speak = listen and heard undubbed audio. */}
              {preJoin.options.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Language Routing
                  </h3>
                  <div className="flex items-center gap-1 p-1 w-fit rounded-full border border-border/60 bg-transparent select-none text-[13px]">
                    <Select
                      value={speakLanguage}
                      onValueChange={(value) => {
                        if (!value) return;
                        setLanguagesTouched(true);
                        setSpeakLanguage(value);
                      }}
                    >
                      <SelectTrigger className="flex items-center gap-1.5 px-2.5 py-[3px] h-auto border-0 bg-transparent shadow-none rounded-full hover:bg-surface-2 focus:ring-0 [&>svg]:hidden">
                        <span className="leading-none text-[14px]">
                          {getFlagEmoji(speakLanguage)}
                        </span>
                        <span className="font-medium text-ink">I speak</span>
                      </SelectTrigger>
                      <SelectContent>
                        {preJoin.options.map((language) => (
                          <SelectItem key={language.locale} value={language.locale}>
                            {getFlagEmoji(language.locale)} {language.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <span className="text-ink-subtle px-0.5">→</span>

                    <Select
                      value={listenLanguage}
                      onValueChange={(value) => {
                        if (!value) return;
                        setLanguagesTouched(true);
                        setListenLanguage(value);
                      }}
                    >
                      <SelectTrigger className="flex items-center gap-1.5 px-2.5 py-[3px] h-auto border-0 bg-transparent shadow-none rounded-full hover:bg-surface-2 focus:ring-0 [&>svg]:hidden">
                        <span className="leading-none text-[14px]">
                          {getFlagEmoji(listenLanguage)}
                        </span>
                        <span className="font-medium text-ink">I hear</span>
                      </SelectTrigger>
                      <SelectContent>
                        {preJoin.options.map((language) => (
                          <SelectItem key={language.locale} value={language.locale}>
                            {getFlagEmoji(language.locale)} {language.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Device Settings
                </h3>
                <div className="space-y-3">
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

            <div className="p-4 border-t border-border bg-surface-1 shrink-0">
              <button
                onClick={handleConfirm}
                disabled={
                  isJoining ||
                  isLoadingRoom ||
                  !room ||
                  !canJoinTranslationRoom(room.status)
                }
                className="flex items-center justify-center w-full bg-foreground text-white text-[13px] font-medium h-[36px] px-4 rounded-[6px] hover:opacity-90 transition-opacity shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {!room
                  ? "Join Meeting"
                  : !canJoinTranslationRoom(room.status)
                  ? "Meeting unavailable"
                  : isJoining
                  ? isHost
                    ? "Starting..."
                    : "Joining..."
                  : shouldEnterWaitingRoom(room.status, {
                      isHost,
                      requiresApproval: room.settings?.requiresApproval,
                    })
                  ? "Enter Waiting Room"
                  : isHost && (room.status === "scheduled" || room.status === "waiting")
                  ? "Start Meeting"
                  : "Join Meeting"}
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
