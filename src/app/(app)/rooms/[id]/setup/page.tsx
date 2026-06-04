"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Camera, Headphones, Languages, Mic, MonitorSpeaker, ShieldCheck, Volume2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const languages = [
  { value: "en-US", label: "English" },
  { value: "vi-VN", label: "Vietnamese" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
];

export default function RoomSetupPage({ params }: { params: { id: string } }) {
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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="overflow-hidden">
        <div className="relative min-h-[420px] bg-neutral-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(255,255,255,0.18),transparent_28%),linear-gradient(135deg,rgba(20,20,20,0.96),rgba(0,0,0,1))]" />
          <div className="absolute inset-6 flex flex-col justify-between rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-white">
            <div>
              <p className="text-sm text-white/55">Device preview</p>
              <h1 className="mt-1 text-3xl font-semibold">Meeting setup</h1>
              <p className="mt-2 max-w-xl text-sm text-white/60">Confirm camera, microphone, speaker, and language routing before opening the meeting.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Preview label="Camera" value={cameraEnabled ? "On" : "Off"} icon={<Camera />} />
              <Preview label="Microphone" value={microphoneEnabled ? "Ready" : "Muted"} icon={<Mic />} />
              <Preview label="Listen in" value={listenLanguage} icon={<Languages />} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Identity and languages</CardTitle>
            <CardDescription>Used for participant labels, captions, and translated audio routing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Display name">
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="I speak">
                <Select value={speakLanguage} onValueChange={(value) => value && setSpeakLanguage(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{languages.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="I listen in">
                <Select value={listenLanguage} onValueChange={(value) => value && setListenLanguage(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{languages.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Device checks</CardTitle>
            <CardDescription>Frontend preview state for local media readiness.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Toggle icon={<Camera />} label="Camera" checked={cameraEnabled} onCheckedChange={setCameraEnabled} />
            <Toggle icon={<Mic />} label="Microphone" checked={microphoneEnabled} onCheckedChange={setMicrophoneEnabled} />
            <Toggle icon={<Headphones />} label="Speaker" checked={speakerEnabled} onCheckedChange={setSpeakerEnabled} />
            <Toggle icon={<Volume2 />} label="Noise suppression" checked={noiseSuppression} onCheckedChange={setNoiseSuppression} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Host controls</CardTitle>
            <CardDescription>Visible for host/manager setup in v1 preview.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Toggle icon={<MonitorSpeaker />} label="Record meeting" checked={recordingEnabled} onCheckedChange={setRecordingEnabled} />
            <Toggle icon={<ShieldCheck />} label="Generate AI summary" checked={summaryEnabled} onCheckedChange={setSummaryEnabled} />
            <Toggle icon={<ShieldCheck />} label="Waiting room" checked={waitingRoomEnabled} onCheckedChange={setWaitingRoomEnabled} />
            <Toggle icon={<ShieldCheck />} label="Participant approval" checked={approvalEnabled} onCheckedChange={setApprovalEnabled} />
            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              <Link href={`/rooms/${params.id}/waiting`} className={cn(buttonVariants(), "rounded-full bg-neutral-950 text-white hover:bg-neutral-800")}>Open waiting room</Link>
              <Link href={`/room/${params.id}`} className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}>Start meeting</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}

function Toggle({ icon, label, checked, onCheckedChange }: { icon: ReactNode; label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-white p-3">
      <span className="flex items-center gap-3 text-sm font-medium">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-neutral-950 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function Preview({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <p className="text-xs text-white/55">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
