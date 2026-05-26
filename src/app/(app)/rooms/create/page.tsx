"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Calendar,
  Check,
  Copy,
  Globe2,
  Link2,
  Lock,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const languageOptions = [
  { code: "en-US", label: "English" },
  { code: "vi-VN", label: "Vietnamese" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
];

const accessOptions = ["Anyone with link", "Workspace only", "Host approval"];

function todayValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeValue() {
  const date = new Date(Date.now() + 1000 * 60 * 30);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function CreateRoomPage() {
  const [title, setTitle] = useState("Investor Q&A Translation");
  const [description, setDescription] = useState("Live translated room for customer, investor, or partner conversations.");
  const [sourceLanguage, setSourceLanguage] = useState("en-US");
  const [targetLanguage, setTargetLanguage] = useState("vi-VN");
  const [date, setDate] = useState(todayValue());
  const [time, setTime] = useState(timeValue());
  const [capacity, setCapacity] = useState("24");
  const [access, setAccess] = useState(accessOptions[0]);
  const [recording, setRecording] = useState(true);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const joinLink = useMemo(() => {
    if (!createdCode) return "";
    if (typeof window === "undefined") return `/join?code=${createdCode}`;
    return `${window.location.origin}/join?code=${createdCode}`;
  }, [createdCode]);

  const createPreviewRoom = () => {
    const code = `WT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;
    setCreatedCode(code);
    toast.success("Preview room created.");
  };

  const copyLink = async () => {
    if (!joinLink) return;
    await navigator.clipboard.writeText(joinLink);
    toast.success("Join link copied.");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Create room
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Create translated room</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Shadcn-style room setup for frontend review while backend creation is offline.
            </p>
          </div>
          <Button onClick={createPreviewRoom}>Create preview room</Button>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Room details</CardTitle>
            <CardDescription>Set the visible room name, description, capacity, and schedule.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Room title">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Capacity">
                <Input type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date">
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              <Field label="Start time">
                <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Translation settings</CardTitle>
            <CardDescription>Configure language direction and room permissions.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Source language">
                <Select value={sourceLanguage} onValueChange={(value) => value && setSourceLanguage(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        {language.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Target language">
                <Select value={targetLanguage} onValueChange={(value) => value && setTargetLanguage(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        {language.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {accessOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setAccess(option)}
                  className={cn(
                    "flex min-h-24 flex-col items-start justify-between rounded-lg border bg-background p-4 text-left text-sm transition hover:bg-muted/60",
                    access === option && "border-primary ring-2 ring-primary/15"
                  )}
                >
                  <span className="font-medium">{option}</span>
                  {access === option ? <Check className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-background p-4">
              <div>
                <p className="font-medium">Retain transcript artifacts</p>
                <p className="text-sm text-muted-foreground">Generate transcript and summary artifacts after the room ends.</p>
              </div>
              <Switch checked={recording} onCheckedChange={setRecording} />
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Setup summary</CardTitle>
            <CardDescription>Preview of the room before sharing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryRow icon={<Globe2 />} label="Languages" value={`${sourceLanguage} -> ${targetLanguage}`} />
            <SummaryRow icon={<Users />} label="Capacity" value={`${capacity || "0"} participants`} />
            <SummaryRow icon={<Calendar />} label="Schedule" value={`${date} at ${time}`} />
            <SummaryRow icon={<Settings2 />} label="Access" value={access} />
          </CardContent>
        </Card>

        {createdCode ? (
          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardHeader>
              <CardTitle>Preview room ready</CardTitle>
              <CardDescription>Share this frontend-only room code for UI testing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground">Room code</p>
                <p className="mt-1 font-mono text-xl font-bold">{createdCode}</p>
              </div>
              <Button className="w-full" onClick={copyLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copy join link
              </Button>
              <Link
                href={`/join?code=${createdCode}`}
                className={cn(buttonVariants({ variant: "outline" }), "w-full bg-background")}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Open join page
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
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

function SummaryRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
