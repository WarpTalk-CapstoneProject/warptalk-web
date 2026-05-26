"use client";

import { Suspense, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Globe2,
  Headphones,
  Mic,
  MonitorSpeaker,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const languages = [
  { value: "vi", label: "Vietnamese" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
];

export default function JoinMeetingPage() {
  return (
    <Suspense fallback={<JoinLoading />}>
      <JoinMeetingContent />
    </Suspense>
  );
}

function JoinMeetingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState("Guest host");
  const [roomCode, setRoomCode] = useState(searchParams.get("code") ?? "");
  const [speakLanguage, setSpeakLanguage] = useState("vi");
  const [listenLanguage, setListenLanguage] = useState("en");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [status, setStatus] = useState<"idle" | "ready">("idle");

  const normalizedCode = useMemo(() => roomCode.trim().toUpperCase(), [roomCode]);
  const canJoin = displayName.trim().length > 1 && normalizedCode.length >= 4;

  function handleJoin() {
    if (!canJoin) {
      toast.error("Enter your display name and room code first.");
      return;
    }

    window.sessionStorage.setItem(
      `warptalk.join.preview`,
      JSON.stringify({
        displayName: displayName.trim(),
        roomCode: normalizedCode,
        speakLanguage,
        listenLanguage,
        cameraEnabled,
        microphoneEnabled,
        speakerEnabled,
      })
    );
    setStatus("ready");
    toast.success("Join settings saved for preview.");
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }))}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>
          <Badge variant="outline" className="bg-background">
            Preview join flow
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <Card className="overflow-hidden shadow-sm">
            <div className="relative min-h-[460px] bg-neutral-950">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.14),transparent_26%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,1))]" />
              <div className="absolute inset-6 flex flex-col justify-between rounded-lg border border-white/10 bg-white/[0.03] p-6 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/60">Camera preview</p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight">Join translation room</h1>
                  </div>
                  <div className="flex gap-2">
                    <DevicePill active={cameraEnabled} icon={<Camera />} label="Camera" />
                    <DevicePill active={microphoneEnabled} icon={<Mic />} label="Mic" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <PreviewTile icon={<Users />} label="Display name" value={displayName || "Not set"} />
                  <PreviewTile icon={<ShieldCheck />} label="Room code" value={normalizedCode || "Required"} />
                  <PreviewTile icon={<Globe2 />} label="Languages" value={`${speakLanguage} to ${listenLanguage}`} />
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Preflight settings</CardTitle>
                <CardDescription>Configure room access before opening the meeting surface.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Display name">
                  <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </Field>
                <Field label="Room code">
                  <Input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value)}
                    placeholder="Enter meeting code"
                    className="font-mono uppercase"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="I speak">
                    <Select value={speakLanguage} onValueChange={(value) => value && setSpeakLanguage(value)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languages.map((language) => (
                          <SelectItem key={language.value} value={language.value}>
                            {language.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="I listen in">
                    <Select value={listenLanguage} onValueChange={(value) => value && setListenLanguage(value)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languages.map((language) => (
                          <SelectItem key={language.value} value={language.value}>
                            {language.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Device checks</CardTitle>
                <CardDescription>Frontend-only toggles for the join screen.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <DeviceRow icon={<Video />} label="Camera" checked={cameraEnabled} onCheckedChange={setCameraEnabled} />
                <DeviceRow icon={<Mic />} label="Microphone" checked={microphoneEnabled} onCheckedChange={setMicrophoneEnabled} />
                <DeviceRow icon={<Headphones />} label="Speaker" checked={speakerEnabled} onCheckedChange={setSpeakerEnabled} />
              </CardContent>
            </Card>

            <Card className={cn("shadow-sm", status === "ready" ? "border-primary/30 bg-primary/5" : "")}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{status === "ready" ? "Ready to enter" : "Waiting for room details"}</p>
                    <p className="text-sm text-muted-foreground">
                      Authentication and backend room validation are intentionally skipped for now.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={handleJoin} disabled={!canJoin}>
                    Join preview
                  </Button>
                  <Button variant="outline" onClick={() => router.push("/dashboard")}>
                    Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function DeviceRow({
  icon,
  label,
  checked,
  onCheckedChange,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </div>
        <span className="font-medium">{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function DevicePill({ active, icon, label }: { active: boolean; icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium">
      <span className={cn("flex h-5 w-5 items-center justify-center [&_svg]:h-3.5 [&_svg]:w-3.5", active ? "text-emerald-300" : "text-white/40")}>
        {icon}
      </span>
      {label}
    </span>
  );
}

function PreviewTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-4">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/80 [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <p className="text-xs text-white/60">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

function JoinLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm shadow-sm">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <MonitorSpeaker className="h-4 w-4 animate-pulse" />
          Preparing join page...
        </CardContent>
      </Card>
    </main>
  );
}
