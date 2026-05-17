"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Copy,
  Download,
  Globe2,
  Lock,
  Mic,
  Settings,
  Speaker,
  Tags,
  Users,
  Volume2,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJoinTranslationRoomByCode } from "@/hooks/use-translationRooms";
import {
  SUPPORTED_LANGUAGES,
  getAvailableTargets,
  getLanguageName,
  getLanguageNativeName,
  normalizeLanguageCode,
} from "@/lib/languages";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type {
  JoinTranslationRoomAccessStatus,
  JoinTranslationRoomResultDto,
} from "@/types/translationRoom";

const DEFAULT_ROOM_CODE = "GSS-7X2Q";
const DEFAULT_ROOM_TITLE = "Global Strategy Sync";

const statusCopy: Record<JoinTranslationRoomAccessStatus, { title: string; body: string }> = {
  idle: {
    title: "",
    body: "",
  },
  loading: {
    title: "Preparing meeting",
    body: "Checking your access and device setup.",
  },
  invalid_code: {
    title: "Invalid room code",
    body: "Check the code and try again.",
  },
  room_unavailable: {
    title: "Room unavailable",
    body: "This meeting is not available yet or has already ended.",
  },
  room_full: {
    title: "Room full",
    body: "The participant limit has been reached.",
  },
  kicked: {
    title: "Access removed",
    body: "You were removed from this room and cannot rejoin.",
  },
  rejected: {
    title: "Join rejected",
    body: "The host rejected this join request.",
  },
  success: {
    title: "Joining meeting",
    body: "Opening the room experience.",
  },
};

export default function JoinMeetingPage() {
  return (
    <Suspense fallback={<JoinPageLoading />}>
      <JoinMeetingContent />
    </Suspense>
  );
}

function JoinMeetingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const joinByCode = useJoinTranslationRoomByCode();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [displayName, setDisplayName] = useState(user?.fullName ?? user?.email?.split("@")[0] ?? "Trisha Nguyen");
  const [roomCode, setRoomCode] = useState(searchParams.get("code") ?? DEFAULT_ROOM_CODE);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [speakLanguage, setSpeakLanguage] = useState("en");
  const [listenLanguage, setListenLanguage] = useState("es");
  const [accessStatus, setAccessStatus] = useState<JoinTranslationRoomAccessStatus>("idle");
  const [accessMessage, setAccessMessage] = useState("");
  const [joiningRoom, setJoiningRoom] = useState<JoinTranslationRoomResultDto["room"] | null>(null);

  const normalizedRoomCode = useMemo(() => roomCode.trim().toUpperCase(), [roomCode]);
  const isPreparing = accessStatus === "loading" || accessStatus === "success";
  const previewReady = cameraEnabled && cameraReady;
  const targetLanguageOptions = useMemo(() => getAvailableTargets(speakLanguage), [speakLanguage]);

  useEffect(() => {
    if (!cameraEnabled) {
      return;
    }

    let stream: MediaStream | null = null;
    let disposed = false;

    async function prepareCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraDenied(false);
        setCameraReady(true);
      } catch {
        setCameraDenied(true);
        setCameraReady(false);
      }
    }

    let unavailableTimer: number | undefined;

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    ) {
      void prepareCamera();
    } else {
      unavailableTimer = window.setTimeout(() => setCameraDenied(true), 0);
    }

    return () => {
      disposed = true;
      if (unavailableTimer) {
        window.clearTimeout(unavailableTimer);
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraEnabled]);

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (displayName.trim().length < 2) {
      setAccessStatus("rejected");
      setAccessMessage("Enter the name you want other participants to see.");
      return;
    }

    if (!/^[A-Z0-9]{3}-?[A-Z0-9]{4,6}$/i.test(normalizedRoomCode) && normalizedRoomCode.length !== 36) {
      setAccessStatus("invalid_code");
      setAccessMessage("Enter a valid room code, for example GSS-7X2Q.");
      return;
    }

    setAccessStatus("loading");
    setAccessMessage(statusCopy.loading.body);

    try {
      const result = await joinByCode.mutateAsync({
        translationRoomCode: normalizedRoomCode,
        displayName: displayName.trim(),
        listenLanguage,
        speakLanguage,
        cameraEnabled,
        microphoneEnabled,
        speakerEnabled,
      });

      setAccessStatus(result.status);
      setAccessMessage(result.message);

      if (result.status !== "success" || !result.room) {
        return;
      }

      setJoiningRoom(result.room);
      window.sessionStorage.setItem(
        `warptalk.join.${result.room.id}`,
        JSON.stringify({
          displayName: displayName.trim(),
          speakLanguage,
          listenLanguage,
          cameraEnabled,
          microphoneEnabled,
          speakerEnabled,
          translationRoomCode: normalizedRoomCode,
          sourceLanguage: result.room.sourceLanguage,
          targetLanguages: result.room.targetLanguages,
          translationMode: result.room.translationMode,
        })
      );

      window.setTimeout(() => {
        router.push(
          `/room/${result.room?.id}?displayName=${encodeURIComponent(displayName.trim())}&speakLanguage=${speakLanguage}&listenLanguage=${listenLanguage}`
        );
      }, 1100);
    } catch {
      setAccessStatus("room_unavailable");
      setAccessMessage("Unable to reach the meeting service. Try again in a moment.");
    }
  }

  if (isPreparing) {
    return (
      <PreparingMeetingScreen
        roomTitle={joiningRoom?.title ?? DEFAULT_ROOM_TITLE}
        topics={joiningRoom?.topics ?? ["quarterly strategy", "regional expansion", "product roadmap"]}
        keyTerms={joiningRoom?.keyTerms ?? ["APAC", "compliance", "revenue forecast", "investor update"]}
        onBack={() => {
          setAccessStatus("idle");
          setJoiningRoom(null);
        }}
        onExit={() => router.push("/dashboard")}
      />
    );
  }

  const errorCopy = accessStatus !== "idle" ? statusCopy[accessStatus] : null;

  return (
    <main className="min-h-screen bg-[#fdfcf6] px-4 py-8 text-black sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1440px] items-center justify-center">
        <div className="grid w-full gap-7 rounded-[28px] border border-[#e4eef9] bg-white/75 p-5 shadow-[0_24px_70px_rgba(0,52,118,0.08)] backdrop-blur md:p-8 lg:grid-cols-[1.28fr_0.95fr] lg:p-9">
          <section className="overflow-hidden rounded-[24px] border border-[#e4eef9] bg-[#fdfcf6] shadow-[0_18px_42px_rgba(0,52,118,0.08)]">
            <div className="relative aspect-[1.23/1] min-h-[360px] overflow-hidden rounded-b-[22px] bg-black">
              {cameraEnabled && !cameraDenied ? (
                <video
                  ref={videoRef}
                  className="h-full w-full scale-105 object-cover opacity-70 blur-[2px]"
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_25%_70%,rgba(253,252,246,0.18),transparent_24%),radial-gradient(circle_at_74%_40%,rgba(228,238,249,0.22),transparent_18%),linear-gradient(135deg,#003476,#000_62%,#003476)]" />
              )}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_68%,rgba(253,252,246,0.22),transparent_18%),linear-gradient(90deg,rgba(0,0,0,0.1),rgba(0,0,0,0.32))]" />
              <div className="absolute left-7 top-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium shadow-sm">
                <Camera className="size-4 fill-current" />
                Camera Preview
              </div>
              <div className="absolute bottom-6 left-7 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium shadow-sm">
                <span className={cn("size-3 rounded-full", previewReady ? "bg-[#003476]" : "bg-black/45")} />
                {previewReady ? "Camera is ready" : cameraDenied ? "Camera preview unavailable" : "Preparing camera"}
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[#e4eef9] px-6 py-7 sm:grid-cols-4">
              <DeviceControl
                active={cameraEnabled}
                icon={<Camera />}
                label="Camera"
                onClick={() => setCameraEnabled((value) => !value)}
              />
              <DeviceControl
                active={microphoneEnabled}
                icon={<Mic />}
                label="Microphone"
                onClick={() => setMicrophoneEnabled((value) => !value)}
              />
              <DeviceControl
                active={speakerEnabled}
                icon={<Speaker />}
                label="Speaker"
                onClick={() => setSpeakerEnabled((value) => !value)}
              />
              <DeviceControl active={false} icon={<Settings />} label="Settings" onClick={() => undefined} />
            </div>
          </section>

          <section className="flex flex-col gap-5">
            <form
              onSubmit={handleJoin}
              className="rounded-[28px] border border-[#e4eef9] bg-white p-7 shadow-[0_18px_44px_rgba(0,52,118,0.08)] sm:p-8"
            >
              <div className="mb-7 flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl bg-[#003476] text-white shadow-sm">
                  <Waves className="size-5" />
                </div>
                <span className="text-lg font-bold">WarpTalk</span>
              </div>

              <h1 className="text-3xl font-bold tracking-normal text-black">Join Meeting</h1>
              <p className="mt-2 max-w-[28rem] leading-7 text-black/65">
                You&apos;re joining from the web. Review your setup before entering the meeting.
              </p>

              <div className="my-7 h-px bg-[#e4eef9]" />

              <div className="mb-7 flex items-center gap-4">
                <div className="grid size-12 place-items-center rounded-full bg-[#e4eef9] text-[#003476]">
                  <Users className="size-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-black">{DEFAULT_ROOM_TITLE}</p>
                  <p className="mt-1 text-sm text-black/60">Room Code: {normalizedRoomCode || DEFAULT_ROOM_CODE}</p>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-medium text-black/65" htmlFor="display-name">
                  Your Name
                </label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="h-12 rounded-xl border-[#e4eef9] bg-white px-4 text-base shadow-sm"
                  placeholder="Trisha Nguyen"
                />

                <label className="sr-only" htmlFor="room-code">
                  Room Code
                </label>
                <div className="relative">
                  <Input
                    id="room-code"
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value)}
                    className="h-12 rounded-xl border-[#e4eef9] bg-white px-4 pr-12 text-base uppercase tracking-wide shadow-sm"
                    placeholder="Room Code: GSS-7X2Q"
                  />
                  <button
                    type="button"
                    aria-label="Copy room code"
                    onClick={() => void navigator.clipboard?.writeText(normalizedRoomCode)}
                    className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-black hover:bg-[#e4eef9]"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </div>

              {errorCopy && (
                <div className="mt-4 rounded-xl border border-[#003476] bg-[#e4eef9] px-4 py-3 text-sm text-black">
                  <p className="font-semibold">{errorCopy.title}</p>
                  <p className="mt-1">{accessMessage || errorCopy.body}</p>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={joinByCode.isPending}
                className="mt-5 h-13 w-full rounded-xl bg-[#003476] text-base font-semibold text-white shadow-[0_12px_24px_rgba(0,52,118,0.22)] hover:bg-black"
              >
                Join Meeting
                <ArrowRight className="ml-auto size-5" />
              </Button>

              <button
                type="button"
                onClick={() => router.back()}
                className="mx-auto mt-6 block text-sm font-semibold text-[#003476] underline underline-offset-2"
              >
                Back
              </button>
            </form>

            <DesktopTranslationCard
              sourceLanguage={speakLanguage}
              targetLanguage={listenLanguage}
              targetLanguageOptions={targetLanguageOptions}
              onSourceLanguageChange={(nextSource) => {
                const normalizedSource = normalizeLanguageCode(nextSource);
                const nextTargets = getAvailableTargets(normalizedSource);
                setSpeakLanguage(normalizedSource);
                if (!nextTargets.some((language) => language.code === listenLanguage)) {
                  setListenLanguage(nextTargets[0]?.code ?? "es");
                }
              }}
              onTargetLanguageChange={(nextTarget) => setListenLanguage(normalizeLanguageCode(nextTarget))}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

function JoinPageLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#fdfcf6] px-6 text-black">
      <div className="rounded-3xl border border-[#e4eef9] bg-white px-8 py-6 text-sm font-semibold text-[#003476] shadow-sm">
        Preparing join preflight...
      </div>
    </main>
  );
}

function DeviceControl({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-28 flex-col items-center justify-center gap-3 px-4">
      <span
        className={cn(
          "grid size-14 place-items-center rounded-xl border text-white shadow-[0_10px_20px_rgba(0,52,118,0.18)] [&_svg]:size-6",
          active ? "border-[#003476] bg-[#003476]" : "border-[#e4eef9] bg-white text-black"
        )}
      >
        {icon}
      </span>
      <span className="text-base font-medium text-black">{label}</span>
      <span className={cn("text-sm", active ? "text-[#003476]" : "text-black/55")}>{active ? "On" : "Off"}</span>
    </button>
  );
}

function DesktopTranslationCard({
  sourceLanguage,
  targetLanguage,
  targetLanguageOptions,
  onSourceLanguageChange,
  onTargetLanguageChange,
}: {
  sourceLanguage: string;
  targetLanguage: string;
  targetLanguageOptions: typeof SUPPORTED_LANGUAGES;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-[#e4eef9] bg-white p-6 shadow-[0_18px_44px_rgba(0,52,118,0.08)]">
      <div className="grid gap-5 lg:grid-cols-[1fr_150px]">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <Globe2 className="size-6 text-black" />
            <h2 className="text-lg font-bold">Want live translation?</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-black/65">
            Real-time language translation is available only in the WarpTalk Desktop App.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="text-xs font-semibold text-black/65">
              Speak
              <select
                value={sourceLanguage}
                onChange={(event) => onSourceLanguageChange(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#e4eef9] bg-white px-3 text-sm font-medium text-black outline-none focus:border-[#003476]"
              >
                {SUPPORTED_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-black/65">
              Listen
              <select
                value={targetLanguage}
                onChange={(event) => onTargetLanguageChange(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#e4eef9] bg-white px-3 text-sm font-medium text-black outline-none focus:border-[#003476]"
              >
                {targetLanguageOptions.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="inline-flex h-10 items-center rounded-xl border border-[#e4eef9] bg-white px-4 text-sm font-semibold text-black">
              {getLanguageName(sourceLanguage)} -&gt; {getLanguageNativeName(targetLanguage)}
            </span>
            <span className="inline-flex items-center gap-2 text-sm text-black/65">
              <Lock className="size-4 fill-current" />
              Desktop app required
            </span>
          </div>
        </div>
        <div className="relative mx-auto grid size-36 place-items-center rounded-full bg-[#e4eef9]">
          <div className="absolute size-24 rounded-full border border-white" />
          <Globe2 className="size-16 text-[#003476]" />
          <span className="absolute left-0 top-10 rounded-lg border border-[#e4eef9] bg-white px-3 py-2 text-lg font-bold text-[#003476]">
            A
          </span>
          <span className="absolute right-3 top-2 rounded-lg border border-[#e4eef9] bg-white px-3 py-2 text-lg font-bold text-[#003476]">
            B
          </span>
          <span className="absolute bottom-5 right-0 grid size-9 place-items-center rounded-full border border-[#e4eef9] bg-white">
            <Lock className="size-4 text-[#003476]" />
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        className="mt-4 h-12 w-full rounded-xl border-[#003476] text-base font-semibold text-[#003476] hover:bg-[#e4eef9]"
      >
        Download Desktop App
        <Download className="ml-2 size-5" />
      </Button>
    </div>
  );
}

function PreparingMeetingScreen({
  roomTitle,
  topics,
  keyTerms,
  onBack,
  onExit,
}: {
  roomTitle: string;
  topics: string[];
  keyTerms: string[];
  onBack: () => void;
  onExit: () => void;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(0,52,118,0.42),transparent_23%),radial-gradient(circle_at_50%_55%,rgba(228,238,249,0.12),transparent_21%),#000]" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center px-6 py-14">
        <div className="flex items-center gap-4 text-2xl font-light tracking-wide text-white/90">
          <span className="grid size-9 place-items-center rounded-full border border-[#e4eef9] shadow-[0_0_20px_rgba(228,238,249,0.8)]">
            <span className="size-2 rounded-full bg-white" />
          </span>
          WarpTalk
        </div>

        <div className="mt-32 grid size-[360px] place-items-center rounded-full border-[14px] border-[#fdfcf6] bg-[radial-gradient(circle,rgba(228,238,249,0.16),rgba(0,52,118,0.52)_34%,#000_68%)] shadow-[0_0_24px_rgba(228,238,249,0.9),0_0_92px_rgba(0,52,118,0.75)] max-sm:size-64">
          <div className="size-14 rounded-full bg-white shadow-[0_0_24px_rgba(228,238,249,0.9)]" />
        </div>

        <h1 className="mt-20 text-center text-4xl font-light tracking-normal text-white sm:text-5xl">{roomTitle}</h1>

        <div className="mt-10 w-full max-w-3xl space-y-5 text-lg">
          <LoadingLine icon={<span className="size-5 animate-spin rounded-full border-2 border-[#e4eef9] border-t-transparent" />} active>
            Preparing meeting context...
          </LoadingLine>
          <LoadingLine icon={<Volume2 className="size-6" />}>
            Topics: {topics.join(", ")}
          </LoadingLine>
          <LoadingLine icon={<Tags className="size-6" />}>
            Key terms: {keyTerms.join(", ")}
          </LoadingLine>
          <LoadingLine icon={<Waves className="size-6" />} muted>
            AI is reviewing company materials and terminology...
          </LoadingLine>
        </div>

        <div className="mt-auto flex w-full max-w-4xl items-center justify-center border-t border-white/10 pt-6 text-[#e4eef9]">
          <button className="flex h-12 min-w-44 items-center justify-center gap-3" onClick={onBack}>
            <ArrowLeft className="size-5" />
            Back
          </button>
          <div className="h-10 w-px bg-white/18" />
          <button className="flex h-12 min-w-44 items-center justify-center gap-3" onClick={onExit}>
            <ArrowRight className="size-5 rotate-180" />
            Exit
          </button>
        </div>
      </div>
    </main>
  );
}

function LoadingLine({
  icon,
  active,
  muted,
  children,
}: {
  icon: ReactNode;
  active?: boolean;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-5", active && "text-[#e4eef9]", muted && "text-white/30")}>
      <span className="grid size-8 place-items-center text-current">{icon}</span>
      <span>{children}</span>
      {active && <Check className="ml-auto size-5 text-[#e4eef9]" />}
    </div>
  );
}
