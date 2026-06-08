"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import gsap from "gsap";
import { Calendar, CheckCircle, CaretDown, Clock, Copy, Translate, ArrowCounterClockwise, SlidersHorizontal, Users, X, XCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const languageOptions = [
  { code: "vi-VN", label: "Vietnamese" },
  { code: "en-US", label: "English" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "es-ES", label: "Spanish" },
  { code: "pt-BR", label: "Portuguese" },
  { code: "th-TH", label: "Thai" },
  { code: "id-ID", label: "Indonesian" },
  { code: "ms-MY", label: "Malay" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ar-SA", label: "Arabic" },
  { code: "it-IT", label: "Italian" },
  { code: "nl-NL", label: "Dutch" },
  { code: "ru-RU", label: "Russian" },
  { code: "tr-TR", label: "Turkish" },
  { code: "pl-PL", label: "Polish" },
  { code: "sv-SE", label: "Swedish" },
];

const previewSchedules = [
  { time: "09:00", title: "Board Review Translation", status: "completed" },
  { time: "11:30", title: "Customer Onboarding", status: "setup needed" },
  { time: "14:00", title: "Partner Sync Room", status: "scheduled" },
  { time: "16:30", title: "Investor Q&A Translation", status: "meeting now" },
];

function startTimeFromDateParam(dateValue: string | null) {
  if (!dateValue) return "";
  const parsed = new Date(`${dateValue}T09:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

export default function CreateRoomPage() {
  return (
    <Suspense fallback={null}>
      <CreateRoomContent />
    </Suspense>
  );
}

function CreateRoomContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const initialStartAt = useMemo(() => startTimeFromDateParam(dateParam), [dateParam]);
  const [title, setTitle] = useState("");
  const [capacity, setCapacity] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(initialStartAt);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [touched, setTouched] = useState({
    title: false,
    capacity: false,
    languages: false,
    startAt: Boolean(initialStartAt),
  });
  const completionRef = useRef<HTMLDivElement | null>(null);
  const returnIconRef = useRef<HTMLAnchorElement | null>(null);

  const selectedLabels = useMemo(
    () => selectedLanguages.map((code) => languageOptions.find((language) => language.code === code)?.label ?? code).join(", "),
    [selectedLanguages]
  );
  const participantCount = Number(capacity);
  const validation = {
    title: title.trim().length > 0,
    capacity: Number.isFinite(participantCount) && participantCount >= 1,
    languages: selectedLanguages.length > 0,
    startAt: Boolean(startAt) && !Number.isNaN(new Date(startAt).getTime()),
  };
  const canCreate = Object.values(validation).every(Boolean);
  const hasReviewedSummary = touched.capacity && touched.languages && touched.startAt;
  const canSubmit = canCreate && hasReviewedSummary;
  const inviteLink = typeof window === "undefined" ? "http://localhost:3000/join?code=WARP-241" : `${window.location.origin}/join?code=WARP-241`;

  useEffect(() => {
    if (!createdRoomId) return;
    if (completionRef.current) {
      gsap.fromTo(
        completionRef.current,
        { autoAlpha: 0, y: 16, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.38, ease: "power3.out" }
      );
    }
    if (returnIconRef.current) {
      gsap.fromTo(
        returnIconRef.current,
        { autoAlpha: 0, y: 18, rotate: -16, scale: 0.8 },
        { autoAlpha: 1, y: 0, rotate: 0, scale: 1, duration: 0.46, ease: "back.out(1.7)" }
      );
    }
  }, [createdRoomId]);

  function markTouched(field: keyof typeof touched) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function createPreviewRoom() {
    setTouched({ title: true, capacity: true, languages: true, startAt: true });
    if (!canSubmit) {
      toast.error("Complete valid room summary items before creating the room.");
      return;
    }

    setCreatedRoomId("preview-investor-qa");
    toast.success("Room created. Continue to setup.");
  }

  async function copyInviteLink() {
    await navigator.clipboard?.writeText(inviteLink);
    toast.success("Invite link copied.");
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="grid gap-4">
        <Card>
          <CardContent className="grid gap-4 p-5">
            <div className="mx-auto grid w-full max-w-3xl gap-4">
              <Field label="Room name">
                <Input
                  value={title}
                  placeholder="Enter a clear meeting name, e.g. Investor Q&A Translation"
                  onFocus={() => markTouched("title")}
                  onChange={(event) => {
                    markTouched("title");
                    setTitle(event.target.value);
                  }}
                  className="h-12 rounded-2xl text-center text-lg font-semibold tracking-tight"
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <LanguageMultiSelect
                selected={selectedLanguages}
                onChange={(languages) => {
                  markTouched("languages");
                  setSelectedLanguages(languages);
                }}
              />
              <Field label="Participant limit">
                <div className="flex min-h-11 items-center gap-3 rounded-2xl border bg-white px-3">
                  <Users weight="light" className="h-4 w-4 text-neutral-400" />
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={capacity}
                    placeholder="1+"
                    onFocus={() => markTouched("capacity")}
                    onChange={(event) => {
                      markTouched("capacity");
                      setCapacity(event.target.value);
                    }}
                    className="h-9 border-0 bg-transparent p-0 text-base font-semibold shadow-none focus-visible:ring-0"
                  />
                  <span className="text-xs text-neutral-400">max</span>
                </div>
              </Field>
            </div>

            <StartTimePicker
              startAt={startAt}
              onChange={(value) => {
                markTouched("startAt");
                setStartAt(value);
              }}
            />

            {!createdRoomId ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Link href="/rooms" className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-medium transition hover:bg-muted">
                  Back to rooms
                </Link>
                <Button
                  onClick={createPreviewRoom}
                  disabled={!canSubmit}
                  className="rounded-full bg-neutral-950 text-white hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-40"
                >
                  Create Room
                </Button>
              </div>
            ) : (
              <Link
                ref={returnIconRef}
                href="/rooms"
                className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white text-neutral-950 opacity-0 shadow-sm transition hover:bg-neutral-50"
                aria-label="Back to rooms"
                title="Back to rooms"
              >
                <ArrowCounterClockwise weight="light" className="h-4 w-4" />
              </Link>
            )}
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
            <SummaryRow
              icon={<Users weight="light" />}
              label="Participants"
              value={`${capacity || "0"} max`}
              valid={validation.capacity}
              touched={touched.capacity}
            />
            <SummaryRow
              icon={<Translate weight="light" />}
              label="Translate"
              value={selectedLabels || "No language selected"}
              valid={validation.languages}
              touched={touched.languages}
            />
            <SummaryRow
              icon={<SlidersHorizontal weight="light" />}
              label="Language route"
              value={selectedLabels || "Not configured"}
              valid={validation.languages}
              touched={touched.languages}
            />
            <SummaryRow
              icon={<Calendar weight="light" />}
              label="Starts"
              value={startAt ? startAt.replace("T", " ") : "Choose date and time"}
              valid={validation.startAt}
              touched={touched.startAt}
            />
            {createdRoomId ? (
              <div ref={completionRef} className="grid gap-2 border-t pt-4 opacity-0">
                <Link href={`/rooms/${createdRoomId}/setup`} className="inline-flex h-9 items-center justify-center rounded-full bg-neutral-950 px-3 text-sm font-medium text-white transition hover:bg-neutral-800">
                  <SlidersHorizontal weight="light" className="mr-2 h-4 w-4" />
                  Continue to setup
                </Link>
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-white px-3 text-sm font-medium transition hover:bg-muted"
                >
                  <Copy weight="light" className="mr-2 h-4 w-4" />
                  Copy invite link
                </button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function LanguageMultiSelect({ selected, onChange }: { selected: string[]; onChange: (languages: string[]) => void }) {
  function toggleLanguage(code: string) {
    if (selected.includes(code)) {
      onChange(selected.filter((item) => item !== code));
      return;
    }
    onChange([...selected, code]);
  }

  const selectedLanguageLabels = selected
    .map((code) => languageOptions.find((language) => language.code === code))
    .filter(Boolean) as typeof languageOptions;

  return (
    <Field label="Translate used in meeting">
      <Popover>
        <PopoverTrigger className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border bg-white px-3 py-2 text-left text-sm transition hover:bg-neutral-50">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {selectedLanguageLabels.length ? (
              selectedLanguageLabels.slice(0, 4).map((language) => (
                <span key={language.code} className="inline-flex max-w-[150px] items-center gap-1 rounded-full bg-neutral-950 px-2.5 py-1 text-xs font-medium text-white">
                  <span className="truncate">{language.label}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleLanguage(language.code);
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    <X weight="light" className="h-3 w-3" />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-neutral-400">Search and choose languages</span>
            )}
            {selectedLanguageLabels.length > 4 ? (
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
                +{selectedLanguageLabels.length - 4}
              </span>
            ) : null}
          </div>
          <CaretDown weight="light" className="h-4 w-4 shrink-0 text-neutral-400" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-xl">
          <Command>
            <CommandInput placeholder="Search languages..." />
            <CommandList className="max-h-72">
              <CommandEmpty>No language found.</CommandEmpty>
              <CommandGroup heading="Available languages">
                {languageOptions.map((language) => {
                  const active = selected.includes(language.code);
                  return (
                    <CommandItem
                      key={language.code}
                      value={`${language.label} ${language.code}`}
                      onSelect={() => toggleLanguage(language.code)}
                      data-checked={active}
                      className="rounded-xl"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-500">
                        {language.code.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{language.label}</p>
                        <p className="text-xs text-neutral-400">{language.code}</p>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function StartTimePicker({ startAt, onChange }: { startAt: string; onChange: (value: string) => void }) {
  const hasStartAt = Boolean(startAt);
  const selectedDate = hasStartAt ? new Date(startAt) : null;
  const dateLabel = selectedDate
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "2-digit", year: "numeric" }).format(selectedDate)
    : "Choose meeting date";
  const timeLabel = selectedDate
    ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(selectedDate)
    : "Select start time";

  return (
    <Field label="Start time">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_52px]">
        <label className="relative flex min-h-20 cursor-pointer items-center justify-between gap-4 rounded-2xl border bg-white px-4 shadow-sm transition hover:bg-neutral-50">
          <div className="min-w-0">
            <p className={cn("truncate text-lg font-semibold", hasStartAt ? "text-neutral-950" : "text-neutral-400")}>{dateLabel}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
              <Clock weight="light" className="h-4 w-4" />
              {timeLabel}
            </p>
          </div>
          <Calendar weight="light" className="h-5 w-5 shrink-0 text-neutral-400" />
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Start time"
          />
        </label>
        <SchedulePopover startAt={startAt} />
      </div>
    </Field>
  );
}

function SchedulePopover({ startAt }: { startAt: string }) {
  return (
    <Popover>
      <PopoverTrigger className="flex h-12 w-12 items-center justify-center rounded-full border bg-white text-neutral-950 shadow-sm transition hover:bg-neutral-50">
        <Calendar weight="light" className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[680px] max-w-[calc(100vw-2rem)] rounded-[24px] bg-white p-0 shadow-2xl">
        <DaySchedulePreview startAt={startAt} />
      </PopoverContent>
    </Popover>
  );
}

function DaySchedulePreview({ startAt }: { startAt: string }) {
  const selectedDate = startAt ? new Date(startAt) : new Date();
  const selectedTime = startAt ? startAt.slice(11, 16) : "";

  return (
    <div className="overflow-hidden rounded-[24px] border bg-white">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-neutral-950">Schedule on this day</p>
          <p className="text-sm text-neutral-500">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "2-digit", year: "numeric" }).format(selectedDate)}
          </p>
        </div>
        <span className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-neutral-600">{previewSchedules.length} meetings</span>
      </div>
      <div className="max-h-[380px] overflow-y-auto border-t">
        {["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((hour) => {
          const hourSchedules = previewSchedules.filter((item) => item.time.startsWith(hour.slice(0, 2)));
          const isSelectedHour = selectedTime.startsWith(hour.slice(0, 2));
          return (
            <div key={hour} className="grid min-h-16 grid-cols-[72px_minmax(0,1fr)] border-b last:border-b-0">
              <div className="border-r px-3 py-3 text-xs font-medium text-neutral-400">{hour}</div>
              <div className="grid gap-2 px-3 py-2">
                {hourSchedules.map((item) => (
                  <div key={`${item.time}-${item.title}`} className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 rounded-2xl bg-neutral-950 px-4 py-3 text-white">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="mt-0.5 text-xs text-white/55">{item.time} - English to Vietnamese</p>
                    </div>
                    <span className="rounded-full bg-white/15 px-2 py-1 text-center text-xs font-medium">{item.status}</span>
                  </div>
                ))}
                {isSelectedHour ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 rounded-2xl border border-neutral-950 bg-white px-4 py-3 text-neutral-950">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">New room draft</p>
                      <p className="mt-0.5 text-xs text-neutral-500">{selectedTime} - selected start time</p>
                    </div>
                    <span className="rounded-full bg-neutral-950 px-2 py-1 text-center text-xs font-medium text-white">selected</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
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

function SummaryRow({
  icon,
  label,
  value,
  valid,
  touched,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valid: boolean;
  touched: boolean;
}) {
  const statusIcon = !touched ? null : valid ? (
    <CheckCircle weight="light" className="h-4 w-4 text-emerald-600" />
  ) : (
    <XCircle weight="light" className="h-4 w-4 text-red-500" />
  );

  return (
    <div className="flex items-center gap-3">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        <p className="truncate text-sm font-medium text-neutral-950">{value}</p>
      </div>
      {statusIcon}
    </div>
  );
}
