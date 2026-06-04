"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Headphones,
  Languages,
  Mic,
  MonitorSpeaker,
  ShieldCheck,
  VideoOff,
  Volume2,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const languages = [
  { value: "en-US", label: "English" },
  { value: "vi-VN", label: "Vietnamese" },
  { value: "ja-JP", label: "Japanese" },
];

type SinkVideoElement = HTMLVideoElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export default function RoomSetupPage({ params }: { params: { id: string } }) {
  const videoRef = useRef<SinkVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const [displayName, setDisplayName] = useState("Host");
  const [speakLanguage, setSpeakLanguage] = useState("en-US");
  const [listenLanguage, setListenLanguage] = useState("vi-VN");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [summaryEnabled, setSummaryEnabled] = useState(true);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(true);
  const [approvalEnabled, setApprovalEnabled] = useState(true);

  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    void startMedia();
    return () => stopMedia();
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
    setSelectedCameraId((current) => current || cameras[0]?.deviceId || "");
    setSelectedMicrophoneId((current) => current || microphones[0]?.deviceId || "");
    setSelectedSpeakerId((current) => current || speakers[0]?.deviceId || "");
  }

  async function startMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("This browser does not support camera and microphone preview.");
      return;
    }

    stopMedia();
    setMediaError("");

    if (!cameraEnabled && !microphoneEnabled) {
      if (videoRef.current) videoRef.current.srcObject = null;
      await refreshDevices();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraEnabled ? { deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined } : false,
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
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Unable to access camera or microphone.");
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }

  function stopMedia() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    analyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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

  function updateCameraEnabled(value: boolean) {
    setCameraEnabled(value);
  }

  function updateMicrophoneEnabled(value: boolean) {
    setMicrophoneEnabled(value);
  }

  const cameraLabel = cameraDevices.find((device) => device.deviceId === selectedCameraId)?.label || "Default camera";
  const microphoneLabel = microphoneDevices.find((device) => device.deviceId === selectedMicrophoneId)?.label || "Default microphone";
  const speakerLabel = speakerDevices.find((device) => device.deviceId === selectedSpeakerId)?.label || "Default speaker";

  return (
    <main className="relative h-screen overflow-hidden bg-white p-4 text-neutral-950">
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90 saturate-0 brightness-[1.08] contrast-105"
        src="/assets/backgrounds/dashboard-light-motion.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-white/45" />

      <div className="relative z-10 grid h-full grid-rows-[52px_minmax(0,1fr)] gap-3">
        <header className="flex items-center justify-between gap-3 rounded-[28px] border border-white/70 bg-white/72 px-3 py-2 shadow-sm backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/rooms/${params.id}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm transition hover:bg-neutral-50">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">Meeting setup</h1>
              <p className="truncate text-xs text-neutral-500">{params.id} - camera, audio, language, and host policy check</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/rooms/${params.id}/waiting`} className={cn(buttonVariants({ variant: "outline" }), "h-9 rounded-full bg-white px-4")}>
              Waiting room
            </Link>
            <Link href={`/room/${params.id}`} className={cn(buttonVariants(), "h-9 rounded-full bg-neutral-950 px-5 text-white hover:bg-neutral-800")}>
              Start meeting
            </Link>
          </div>
        </header>

        <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_116px] gap-3">
            <div className="relative overflow-hidden rounded-[30px] bg-neutral-950 shadow-sm">
              {cameraEnabled ? (
                <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
              ) : (
                <div className="flex h-full items-center justify-center text-white/50">
                  <div className="text-center">
                    <VideoOff className="mx-auto h-10 w-10" />
                    <p className="mt-3 text-sm">Camera is off</p>
                  </div>
                </div>
              )}
              <div className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur">
                {displayName || "Host"}
              </div>
              {mediaError ? (
                <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {mediaError}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <StatusTile icon={<Camera />} label="Camera" value={cameraEnabled ? cameraLabel : "Off"} />
              <StatusTile icon={<Mic />} label="Microphone" value={microphoneEnabled ? microphoneLabel : "Muted"} meter={microphoneEnabled ? micLevel : 0} />
              <StatusTile icon={<Headphones />} label="Speaker" value={speakerEnabled ? speakerLabel : "Off"} />
              <StatusTile icon={<Languages />} label="Language route" value={`${speakLanguage} -> ${listenLanguage}`} />
            </div>
          </section>

          <aside className="grid min-h-0 content-start gap-3 overflow-hidden">
            <Panel title="Identity">
              <Field label="Display name">
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-9 bg-white" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Speak">
                  <Select value={speakLanguage} onValueChange={(value) => value && setSpeakLanguage(value)}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{languages.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Listen">
                  <Select value={listenLanguage} onValueChange={(value) => value && setListenLanguage(value)}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{languages.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </Panel>

            <Panel title="Devices">
              <DeviceSelect label="Camera" value={selectedCameraId} devices={cameraDevices} fallback="Default camera" onChange={setSelectedCameraId} />
              <DeviceSelect label="Microphone" value={selectedMicrophoneId} devices={microphoneDevices} fallback="Default microphone" onChange={setSelectedMicrophoneId} />
              <DeviceSelect label="Speaker" value={selectedSpeakerId} devices={speakerDevices} fallback="Default speaker" onChange={setSelectedSpeakerId} disabled={speakerDevices.length === 0} />
              <div className="grid grid-cols-2 gap-2">
                <Toggle icon={<Camera />} label="Camera" checked={cameraEnabled} onCheckedChange={updateCameraEnabled} />
                <Toggle icon={<Mic />} label="Mic" checked={microphoneEnabled} onCheckedChange={updateMicrophoneEnabled} />
                <Toggle icon={<Headphones />} label="Speaker" checked={speakerEnabled} onCheckedChange={setSpeakerEnabled} />
                <Toggle icon={<Volume2 />} label="Noise" checked={noiseSuppression} onCheckedChange={setNoiseSuppression} />
              </div>
            </Panel>

            <Panel title="Host policy">
              <div className="grid grid-cols-2 gap-2">
                <Toggle icon={<MonitorSpeaker />} label="Record" checked={recordingEnabled} onCheckedChange={setRecordingEnabled} />
                <Toggle icon={<ShieldCheck />} label="AI summary" checked={summaryEnabled} onCheckedChange={setSummaryEnabled} />
                <Toggle icon={<ShieldCheck />} label="Waiting" checked={waitingRoomEnabled} onCheckedChange={setWaitingRoomEnabled} />
                <Toggle icon={<CheckCircle2 />} label="Approval" checked={approvalEnabled} onCheckedChange={setApprovalEnabled} />
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-[24px] border bg-white/86 p-3 shadow-sm">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  fallback,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  devices: MediaDeviceInfo[];
  fallback: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Select
        value={value || "default"}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          onChange(nextValue === "default" ? "" : nextValue);
        }}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 bg-white">
          <SelectValue placeholder={fallback} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">{fallback}</SelectItem>
          {devices.map((device, index) => (
            <SelectItem key={device.deviceId || `${label}-${index}`} value={device.deviceId || `device-${index}`}>
              {device.label || `${label} ${index + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function Toggle({ icon, label, checked, onCheckedChange }: { icon: ReactNode; label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex h-10 items-center justify-between rounded-2xl border bg-white px-2.5">
      <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-950 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusTile({ icon, label, value, meter }: { icon: ReactNode; label: string; value: string; meter?: number }) {
  return (
    <div className="rounded-[22px] border bg-white/86 p-3 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-neutral-950">{value}</p>
      {typeof meter === "number" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-neutral-950 transition-[width]" style={{ width: `${meter}%` }} />
        </div>
      ) : null}
    </div>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
