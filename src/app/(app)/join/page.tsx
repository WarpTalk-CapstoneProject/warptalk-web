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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useJoinLanguagePolicy, useJoinTranslationRoomByCode } from "@/hooks/use-translationRooms";
import { getErrorMessage } from "@/lib/api/errors";
import { getFlagEmoji } from "@/lib/language/language-flag";
import { getLanguageName, meetingLanguagesForPolicy } from "@/lib/language/languages";
import { NOISE_SUPPRESSION_PREFERENCE_VERSION } from "@/lib/meeting/track-effects-preferences";
import { completeMeetingJoin } from "@/lib/meeting/meeting-join-state";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toast } from "sonner";

// WT-438 (Linear): the list moved INSIDE the component, filtered by the workspace's
// allowedTargetLanguages policy. As a module-level constant it was computed once at import
// time, could not see any workspace, and offered every meeting-scope language — so a
// workspace whose Owner had restricted meetings to JA/VI/EN still showed Korean, French and
// Spanish on the pre-join screen. See languageOptions in JoinMeetingContent.
//
// (The previous fix here went the other way: a hardcoded three prevented joining rooms
// created in the other legitimate languages. The policy filter is the middle both needed.)

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
  // WT-468 removed the last reader of activeWorkspaceId on this screen. The joiner's own
  // workspace has no say in which languages a room offers — that belongs to the workspace that
  // owns the room, which useJoinLanguagePolicy resolves from the code below.
  const videoRef = useRef<SinkVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const displayName = user?.fullName || user?.email || "Guest";
  // WT-368 — the room code is DERIVED from the URL until somebody types.
  //
  // This was `useState(searchParams.get("code") ?? "")`. /join is a statically rendered route,
  // so useSearchParams() is empty during the render that the initialiser runs in, and useState
  // ignores every later initialiser value. An invite link therefore landed on a screen with an
  // empty code box and no sign that a code had been supplied at all — the user had to read it
  // back out of their own URL bar and retype it.
  //
  // Derived rather than synced in an effect: there is no moment where the two can disagree, and
  // no render where the box is briefly empty. `typedCode` is null until the field is touched, so
  // deliberately CLEARING it stays cleared instead of being refilled from the URL on the next
  // render — which a `roomCode === ""` test would get wrong.
  const codeFromUrl = searchParams.get("code") ?? "";
  const [typedCode, setTypedCode] = useState<string | null>(null);
  const roomCode = typedCode ?? codeFromUrl;
  // WT-468: the languages this screen offers belong to the workspace that OWNS THE ROOM.
  //
  // This used to read `useWorkspaceSettings(activeWorkspaceId)` — the joiner's own currently
  // selected workspace — and the file carried the approximation as a known one. It is not a
  // harmless approximation: someone in workspace A joining a room in workspace B was offered A's
  // languages. Too few, when B permits more (the reported symptom: only EN and VI, and no way
  // forward); or too many, when A restricts nothing and B does, in which case the server refuses
  // the pick only after it has been made. An external guest, who belongs to no workspace at all,
  // got the policy of nothing.
  //
  // Keyed by the room code, so it re-resolves as the user finishes typing one. The endpoint
  // answers 200 with an empty list for an unknown or half-typed code, and empty means
  // unrestricted — so a partially typed code shows the full set rather than an error or a
  // momentarily empty picker.
  const { data: joinLanguagePolicy } = useJoinLanguagePolicy(roomCode);
  const languages = useMemo(
    () =>
      meetingLanguagesForPolicy(joinLanguagePolicy?.allowedTargetLanguages).map(
        (language) => ({ value: language.locale, label: language.name }),
      ),
    [joinLanguagePolicy?.allowedTargetLanguages],
  );

  const [speakLanguage, setSpeakLanguage] = useState("vi-VN");
  const [listenLanguage, setListenLanguage] = useState("en-US");
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // WT-438: the hardcoded defaults above can name a language the policy forbids — a workspace
  // restricted to JA/EN would still preset speak=vi-VN, and submitting it is a server-side 403
  // the user never chose. Snapped to the first offered option the moment the policy resolves,
  // derived during render like create-room-dialog's reconcile (an effect would flash the
  // forbidden value first). Keyed by the resolved option set so a mid-session policy change
  // re-applies, while the user's own later picks are left alone.
  const [appliedLanguagePolicyKey, setAppliedLanguagePolicyKey] = useState<string | null>(null);
  // WT-468: gated on the ROOM's policy having resolved. Snapping before it arrives would pin the
  // pair to the unfiltered list and then leave it there, because this only re-runs when the
  // offered set changes — the user would keep a language the room's workspace forbids.
  const languagePolicyKey = joinLanguagePolicy
    ? languages.map((language) => language.value).join(",")
    : null;
  if (languagePolicyKey && appliedLanguagePolicyKey !== languagePolicyKey) {
    setAppliedLanguagePolicyKey(languagePolicyKey);
    const offered = new Set(languages.map((language) => language.value));
    if (!offered.has(speakLanguage) && languages[0]) setSpeakLanguage(languages[0].value);
    if (!offered.has(listenLanguage) && languages[0]) setListenLanguage(languages[0].value);
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
            {/* Room Code Section */}
            <div className="space-y-4">
              <h4 className="text-[13px] font-medium text-ink tracking-[0.4px]">
                Meeting Code
              </h4>
              <Input
                value={roomCode}
                // Typing takes ownership of the field from the URL. See the note above.
                onChange={(event) => setTypedCode(event.target.value)}
                placeholder="e.g. abc-defg-hij"
                autoFocus={!roomCode}
                className="h-[36px] text-[13px] font-mono"
              />
            </div>

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
