"use client";

import { Suspense, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Camera, CheckCircle, Globe, Headphones, Microphone, Monitor, ShieldCheck, Users, VideoCamera } from "@phosphor-icons/react/dist/ssr";
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
import { useJoinTranslationRoomByCode } from "@/hooks/use-translationRooms";

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
  const joinMutation = useJoinTranslationRoomByCode();

  const normalizedCode = useMemo(() => roomCode.trim().toUpperCase(), [roomCode]);
  const canJoin = displayName.trim().length > 1 && normalizedCode.length >= 4;

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
        speakerEnabled,
      });

      if (result.status === "success" && result.room) {
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
            roomId: result.room.id,
            participantId: result.participant?.id,
          })
        );
        setStatus("ready");
        toast.success("Joined room successfully.");
        router.push(`/rooms/${result.room.id}/setup`);
      } else {
        toast.error(result.message || "Failed to join room.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join room.");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas p-4 text-ink flex flex-col">
      <div className="relative z-10 mx-auto flex w-full flex-1 max-w-7xl flex-col gap-6 py-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/participant/dashboard" className={cn(buttonVariants({ variant: "outline" }), "rounded-full bg-surface-1")}>
            <ArrowLeft weight="light" className="mr-2 h-4 w-4" />
            Participant dashboard
          </Link>
          <Badge variant="outline" className="bg-surface-1">Preview join flow</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card className="dashboard-glass-surface overflow-hidden">
            <CardHeader>
              <CardTitle>Join translation room</CardTitle>
              <CardDescription>Use the invite code, confirm language routing, and run a quick device check.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <PreviewTile icon={<Users weight="light" />} label="Display name" value={displayName || "Not set"} />
                <PreviewTile icon={<ShieldCheck weight="light" />} label="Room code" value={normalizedCode || "Required"} />
                <PreviewTile icon={<Globe weight="light" />} label="Languages" value={`${speakLanguage} to ${listenLanguage}`} />
              </div>
              <div className="mt-4 rounded-[28px] border border-border bg-surface-2 p-4">
                <div className="flex min-h-[260px] flex-col justify-between rounded-[24px] bg-neutral-950 p-5 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-white/55">Camera preview</p>
                      <h2 className="mt-1 text-2xl font-semibold">Ready room check</h2>
                    </div>
                    <div className="flex gap-2">
                      <DevicePill active={cameraEnabled} icon={<Camera weight="light" />} label="Camera" />
                      <DevicePill active={microphoneEnabled} icon={<Microphone weight="light" />} label="Microphone" />
                    </div>
                  </div>
                  <p className="max-w-lg text-sm text-white/60">This preview keeps participant join consistent with the white shadcn dashboard shell.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="dashboard-glass-surface">
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

            <Card className="dashboard-glass-surface">
              <CardHeader>
                <CardTitle>Device checks</CardTitle>
                <CardDescription>Frontend-only toggles for the join screen.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <DeviceRow icon={<VideoCamera weight="light" />} label="Camera" checked={cameraEnabled} onCheckedChange={setCameraEnabled} />
                <DeviceRow icon={<Microphone weight="light" />} label="Microphone" checked={microphoneEnabled} onCheckedChange={setMicrophoneEnabled} />
                <DeviceRow icon={<Headphones weight="light" />} label="Speaker" checked={speakerEnabled} onCheckedChange={setSpeakerEnabled} />
              </CardContent>
            </Card>

            <Card className={cn("bg-surface-1", status === "ready" ? "border-primary/50 bg-surface-2" : "")}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CheckCircle weight="light" className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{status === "ready" ? "Ready to enter" : "Waiting for room details"}</p>
                    <p className="text-sm text-muted-foreground">
                      Confirm your language and devices before joining the room.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-1">
                  <Button onClick={handleJoin} disabled={!canJoin || joinMutation.isPending}>
                    {joinMutation.isPending ? "Joining..." : "Join Room"}
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
    <div className="rounded-[12px] border border-border bg-surface-1 p-4">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-ink [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 truncate font-medium text-neutral-950">{value}</p>
    </div>
  );
}

function JoinLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm shadow-sm">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Monitor weight="light" className="h-4 w-4 animate-pulse" />
          Preparing join page...
        </CardContent>
      </Card>
    </main>
  );
}
