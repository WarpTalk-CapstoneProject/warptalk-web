"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, Check, Languages, Link2, Settings2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const languageOptions = [
  { code: "vi-VN", label: "Vietnamese" },
  { code: "en-US", label: "English" },
  { code: "ja-JP", label: "Japanese" },
];

function defaultStartTime() {
  const date = new Date(Date.now() + 1000 * 60 * 30);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

export default function CreateRoomPage() {
  const [title, setTitle] = useState("Investor Q&A Translation");
  const [capacity, setCapacity] = useState("24");
  const [transcriptLanguage, setTranscriptLanguage] = useState("en-US");
  const [displayLanguage, setDisplayLanguage] = useState("vi-VN");
  const [selectedLanguages, setSelectedLanguages] = useState(["vi-VN", "en-US"]);
  const [startAt, setStartAt] = useState(defaultStartTime());
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);

  const selectedLabels = useMemo(
    () => selectedLanguages.map((code) => languageOptions.find((language) => language.code === code)?.label ?? code).join(", "),
    [selectedLanguages]
  );

  function toggleLanguage(code: string) {
    setSelectedLanguages((current) => {
      if (current.includes(code)) return current.filter((item) => item !== code);
      return [...current, code];
    });
  }

  function createPreviewRoom() {
    if (!title.trim()) {
      toast.error("Room name is required.");
      return;
    }
    if (selectedLanguages.length === 0) {
      toast.error("Choose at least one meeting language.");
      return;
    }

    setCreatedRoomId("preview-investor-qa");
    toast.success("Preview room created. Continue to room setup.");
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="grid gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-500 shadow-sm">
            <CalendarClock className="h-3.5 w-3.5" />
            Simple create room
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">Create room</h1>
          <p className="text-sm text-neutral-500">Only collect the essentials here. Invite, context documents, and room policies are configured in setup.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Core room information</CardTitle>
            <CardDescription>Name, participant count, languages, transcript language, and start time.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="Room name">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Participant limit">
                <Input type="number" min={1} max={500} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
              </Field>
            </div>

            <Field label="Languages used in meeting">
              <div className="grid gap-2 sm:grid-cols-3">
                {languageOptions.map((language) => {
                  const active = selectedLanguages.includes(language.code);
                  return (
                    <button
                      key={language.code}
                      type="button"
                      onClick={() => toggleLanguage(language.code)}
                      className={cn(
                        "flex h-12 items-center justify-between rounded-2xl border bg-white px-4 text-sm font-medium transition hover:bg-neutral-50",
                        active && "border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-900"
                      )}
                    >
                      {language.label}
                      {active ? <Check className="h-4 w-4" /> : null}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Main transcript language">
                <Select value={transcriptLanguage} onValueChange={(value) => value && setTranscriptLanguage(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((language) => <SelectItem key={language.code} value={language.code}>{language.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Default translation display">
                <Select value={displayLanguage} onValueChange={(value) => value && setDisplayLanguage(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((language) => <SelectItem key={language.code} value={language.code}>{language.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Start time">
              <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button onClick={createPreviewRoom} className="rounded-full bg-neutral-950 text-white hover:bg-neutral-800">
                Create preview room
              </Button>
              <Link href="/rooms" className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-white px-3 text-sm font-medium transition hover:bg-muted">
                Back to rooms
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Room summary</CardTitle>
            <CardDescription>Preview before moving into setup.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SummaryRow icon={<Users />} label="Participants" value={`${capacity || "0"} max`} />
            <SummaryRow icon={<Languages />} label="Languages" value={selectedLabels || "No language selected"} />
            <SummaryRow icon={<Settings2 />} label="Transcript" value={transcriptLanguage} />
            <SummaryRow icon={<CalendarClock />} label="Starts" value={startAt.replace("T", " ")} />
          </CardContent>
        </Card>

        {createdRoomId ? (
          <Card className="border-neutral-950/15 bg-white">
            <CardHeader>
              <CardTitle>Next step: setup</CardTitle>
              <CardDescription>Add invite, context documents, and meeting policies after creation.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Link href={`/rooms/${createdRoomId}/setup`} className="inline-flex h-8 items-center justify-center rounded-full bg-neutral-950 px-3 text-sm font-medium text-white transition hover:bg-neutral-800">
                <Settings2 className="mr-2 h-4 w-4" />
                Continue to setup
              </Link>
              <Link href={`/join?code=WARP-241`} className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-white px-3 text-sm font-medium transition hover:bg-muted">
                <Link2 className="mr-2 h-4 w-4" />
                Preview invite link
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
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div>
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        <p className="text-sm font-medium text-neutral-950">{value}</p>
      </div>
    </div>
  );
}
