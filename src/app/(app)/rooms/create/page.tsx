"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { 
  ChevronRight, Calendar as CalendarIcon, Clock, Globe, 
  Check, CheckCircle2, Info, Search, Filter,
  FileText, Users, Lock, Upload,
  X
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCreateTranslationRoom } from "@/hooks/use-translationRooms";
import {
  SUPPORTED_LANGUAGES,
  getAvailableTargets,
  getLanguageName,
  getLanguageRegion,
  serializeTargetLanguages,
} from "@/lib/languages";
import { useAuthStore } from "@/stores/auth-store";
import type { CreateTranslationRoomRequest } from "@/types/translationRoom";

type CreateRoomFormData = {
  meetingTitle: string;
  scheduleMode: "later" | "now";
  date: string;
  startTime: string;
  timeZone: string;
  primaryLanguage: string;
  translationMode: "single" | "multi";
  roomName: string;
  maxParticipants: number | string;
  hostNote: string;
  visibility: string;
  joinRule: string;
  permissions: string;
  targetLanguages: string[];
};

type UpdateForm = <K extends keyof CreateRoomFormData>(key: K, value: CreateRoomFormData[K]) => void;

const mockFiles = [
  { id: 1, name: "Medical Terms Q2.pdf", tag: "Medical", date: "May 17, 2026", size: "1.2 MB", selected: true },
  { id: 2, name: "Legal Glossary EN-VI.csv", tag: "Legal", date: "May 16, 2026", size: "840 KB", selected: true },
  { id: 3, name: "Product Launch Terms.xlsx", tag: "Product", date: "May 15, 2026", size: "1.6 MB", selected: true },
  { id: 4, name: "Marketing Glossary.pdf", tag: "Marketing", date: "May 12, 2026", size: "2.4 MB", selected: true },
  { id: 5, name: "Finance Terms.csv", tag: "Finance", date: "May 10, 2026", size: "920 KB", selected: true },
];

export default function CreateRoomPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const createRoom = useCreateTranslationRoom();
  const [step, setStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState<CreateRoomFormData>({
    meetingTitle: "Global Strategy Sync",
    scheduleMode: "later",
    date: "2026-05-22",
    startTime: "10:00 AM",
    timeZone: "(UTC-04:00) Eastern Time (US & Canada)",
    primaryLanguage: "en",
    translationMode: "multi",
    roomName: "Global Strategy Sync",
    maxParticipants: 50,
    hostNote: "",
    visibility: "Private",
    joinRule: "Invited users only",
    permissions: "Host only",
    targetLanguages: ["es", "vi", "ja"]
  });

  const updateForm: UpdateForm = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);
  const isParticipantOnly = user?.roles?.includes("participant") && !user?.roles?.includes("host");

  const handleCreateRoom = async () => {
    const title = (formData.roomName || formData.meetingTitle).trim();
    const maxParticipants = Number(formData.maxParticipants);

    if (!title) {
      toast.error("Room name is required.");
      return;
    }

    if (!Number.isFinite(maxParticipants) || maxParticipants < 2 || maxParticipants > 500) {
      toast.error("Max participants must be between 2 and 500.");
      return;
    }

    const request: CreateTranslationRoomRequest = {
      title,
      description: formData.hostNote.trim() || formData.meetingTitle.trim(),
      translationRoomType: formData.scheduleMode === "now" ? "instant" : "scheduled",
      maxParticipants,
      sourceLanguage: formData.primaryLanguage,
      targetLanguages: serializeTargetLanguages(formData.targetLanguages),
      scheduledAt:
        formData.scheduleMode === "later"
          ? buildScheduledAt(formData.date, formData.startTime, formData.timeZone)
          : undefined,
    };

    try {
      const room = await createRoom.mutateAsync(request);
      toast.success("Room created. Opening the Module 1 flow.");
      router.push(`/rooms?created=${room.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the room.";
      toast.error(message);
    }
  };

  if (isParticipantOnly) {
    return (
      <div className="mx-auto flex min-h-[520px] w-full max-w-3xl items-center justify-center">
        <div className="rounded-2xl border border-[#e4eef9] bg-[#fdfcf6] p-8 text-center shadow-sm">
          <Lock className="mx-auto mb-4 h-8 w-8 text-[#003476]" />
          <h1 className="text-2xl font-bold text-black">Host permission required</h1>
          <p className="mt-2 text-sm text-slate-600">
            Participants can join a room from the preflight screen, but only hosts can create or schedule rooms.
          </p>
          <Button onClick={() => router.push("/join")} className="mt-5 bg-[#003476] text-white hover:bg-[#003476]/90">
            Go to join preflight
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 pb-24">
      {/* Breadcrumbs */}
      <div className="flex items-center text-sm">
        <span className="text-slate-500 font-medium">WarpTalk</span>
        <ChevronRight className="h-4 w-4 text-slate-400 mx-1" />
        <span className="text-slate-500 font-medium">Create Room</span>
        <ChevronRight className="h-4 w-4 text-slate-400 mx-1" />
        <span className="text-slate-900 font-semibold">New Meeting</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {step === 1 ? "Create Meeting" : "Create Translation Room"}
        </h1>
        {step === 1 && (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            Step 1 of 2
          </span>
        )}
      </div>
      
      {step === 2 && (
        <p className="text-sm text-slate-500 mt-1">
          Configure your translation room settings. All fields marked <span className="text-red-500">*</span> are required.
        </p>
      )}

      {/* Progress Bar (Step 1 only) */}
      {step === 1 && (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-4 px-8 shadow-sm">
          <div className="flex w-full max-w-2xl items-center">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#003476] text-xs font-bold text-white">1</div>
              <span className="text-sm font-semibold text-slate-900">Meeting basics</span>
            </div>
            <div className="mx-4 flex-1 h-px bg-slate-200"></div>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-400">2</div>
              <span className="text-sm font-medium text-slate-400">Room setup</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: Forms */}
        <div className="xl:col-span-2 space-y-6">
          {step === 1 ? (
            <Step1Form data={formData} update={updateForm} />
          ) : (
            <Step2Form data={formData} update={updateForm} />
          )}
        </div>

        {/* RIGHT COLUMN: Summary */}
        <div className="space-y-6">
          {step === 1 ? (
            <Step1Sidebar data={formData} />
          ) : (
            <Step2Sidebar data={formData} />
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 -mx-6 -mb-24 mt-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-8 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
        <Button variant="outline" className="h-10 px-6 font-medium text-slate-700">
          Cancel
        </Button>
        {step === 2 && (
          <Button variant="outline" onClick={handleBack} className="h-10 px-6 font-medium text-slate-700">
            Back
          </Button>
        )}
        <Button variant="outline" className="h-10 px-6 font-medium text-slate-700">
          Save Draft
        </Button>
        {step === 1 ? (
          <Button onClick={handleNext} className="h-10 px-6 font-medium bg-[#003476] hover:bg-[#003476]/90 text-white">
            Continue to Room Setup <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleCreateRoom}
            disabled={createRoom.isPending}
            className="h-10 px-6 font-medium bg-[#003476] hover:bg-[#003476]/90 text-white"
          >
            {createRoom.isPending ? "Creating..." : "Create Room"} <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// STEP 1 COMPONENTS
// ============================================================================

const fallbackTimeZones = [
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const totalMinutes = index * 15;
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
});

function getSupportedTimeZones() {
  if (typeof Intl === "undefined" || typeof Intl.supportedValuesOf !== "function") {
    return fallbackTimeZones;
  }

  return Intl.supportedValuesOf("timeZone");
}

function buildScheduledAt(dateValue: string, timeValue: string, timeZoneValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const match = timeValue.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!year || !month || !day || !match) return undefined;

  const [, hourText, minuteText, meridiem] = match;
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (meridiem.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (meridiem.toUpperCase() === "AM" && hour === 12) hour = 0;

  const scheduled = new Date(year, month - 1, day, hour, minute);
  if (Number.isNaN(scheduled.getTime())) return undefined;

  const selectedZone = parseTimeZoneValue(timeZoneValue);
  if (selectedZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) {
    return scheduled.toISOString();
  }

  return scheduled.toISOString();
}

function getTimeZoneOffset(timeZone: string) {
  const date = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC");

  return offset || "UTC";
}

function formatTimeZone(timeZone: string) {
  return `(${getTimeZoneOffset(timeZone)}) ${timeZone.replace(/_/g, " ")}`;
}

function parseTimeZoneValue(value: string) {
  const match = value.match(/\)\s(.+)$/);
  return (match?.[1] || value).trim().replace(/\s/g, "_");
}

function formatDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getCalendarDays(value: string) {
  const [year, month] = value.split("-").map(Number);
  const safeDate = year && month ? new Date(year, month - 1, 1) : new Date();
  const firstDay = new Date(safeDate.getFullYear(), safeDate.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(safeDate.getFullYear(), safeDate.getMonth() + 1, 0).getDate();
  const cells: Array<{ label: number; value: string } | null> = [];

  for (let index = 0; index < startOffset; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const monthValue = String(safeDate.getMonth() + 1).padStart(2, "0");
    const dayValue = String(day).padStart(2, "0");
    cells.push({ label: day, value: `${safeDate.getFullYear()}-${monthValue}-${dayValue}` });
  }

  return cells;
}

function shiftMonthValue(value: string, months: number) {
  const [year, month] = value.split("-").map(Number);
  const baseDate = year && month ? new Date(year, month - 1, 1) : new Date();
  const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + months, 1);
  const nextYear = nextDate.getFullYear();
  const nextMonth = String(nextDate.getMonth() + 1).padStart(2, "0");

  return `${nextYear}-${nextMonth}-01`;
}

function Step1Form({ data, update }: { data: CreateRoomFormData; update: UpdateForm }) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [timeZones, setTimeZones] = useState(() => fallbackTimeZones.map(formatTimeZone));
  const calendarDays = useMemo(() => getCalendarDays(data.date), [data.date]);
  const selectedTimeZone = parseTimeZoneValue(data.timeZone);
  const languageTargets = getAvailableTargets(data.primaryLanguage).slice(0, 3);

  const loadWorldTimeZones = () => {
    if (timeZones.length === fallbackTimeZones.length) {
      setTimeZones(getSupportedTimeZones().map(formatTimeZone));
    }
  };


  return (
    <>
      {/* Block 1 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003476] text-sm font-bold text-white">1</div>
          <h2 className="text-xl font-bold text-slate-900">Meeting Basics</h2>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-900">Meeting Title *</label>
          <div className="relative">
            <input 
              type="text" 
              value={data.meetingTitle}
              onChange={(e) => update("meetingTitle", e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-[#000000] outline-none focus:border-[#003476] focus:ring-1 focus:ring-[#003476]"
            />
            {data.meetingTitle && (
              <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
            )}
          </div>
        </div>
      </div>

      {/* Block 2 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003476] text-sm font-bold text-white">2</div>
          <h2 className="text-xl font-bold text-slate-900">Schedule</h2>
        </div>
        
        <div className="flex items-center gap-6 mb-6">
          <button
            type="button"
            onClick={() => update("scheduleMode", "later")}
            className="flex items-center gap-2"
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded border ${
                data.scheduleMode === "later" ? "border-[#003476] bg-[#003476]" : "border-slate-300 bg-white"
              }`}
            >
              {data.scheduleMode === "later" && <Check className="h-3 w-3 text-white" />}
            </span>
            <span className="text-sm font-medium text-slate-900">Schedule for later</span>
          </button>
          <button
            type="button"
            onClick={() => update("scheduleMode", "now")}
            className="flex items-center gap-2"
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded border ${
                data.scheduleMode === "now" ? "border-[#003476] bg-[#003476]" : "border-slate-300 bg-white"
              }`}
            >
              {data.scheduleMode === "now" && <Check className="h-3 w-3 text-white" />}
            </span>
            <span className="text-sm font-medium text-slate-900">Start now</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Date *</label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={data.date}
                onFocus={() => setIsDatePickerOpen(true)}
                onClick={() => setIsDatePickerOpen(true)}
                onChange={(e) => update("date", e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#003476]"
              />
              {isDatePickerOpen && (
                <div className="absolute left-0 top-12 z-20 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => update("date", shiftMonthValue(data.date, -1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </button>
                    <p className="text-sm font-bold text-slate-900">{formatDateValue(data.date)}</p>
                    <button
                      type="button"
                      onClick={() => update("date", shiftMonthValue(data.date, 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(false)}
                      className="text-xs font-semibold text-[#003476] hover:underline"
                    >
                      Done
                    </button>
                  </div>
                  <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400">
                    {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, index) =>
                      day ? (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            update("date", day.value);
                            setIsDatePickerOpen(false);
                          }}
                          className={`h-8 rounded-lg text-xs font-semibold ${
                            data.date === day.value
                              ? "bg-[#003476] text-white"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {day.label}
                        </button>
                      ) : (
                        <span key={`empty-${index}`} />
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Start Time *</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={data.startTime}
                list="meeting-start-times"
                onFocus={() => setIsTimePickerOpen(true)}
                onClick={() => setIsTimePickerOpen(true)}
                onChange={(e) => update("startTime", e.target.value)}
                className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#003476]"
              />
              <datalist id="meeting-start-times">
                {timeOptions.map((time) => (
                  <option key={time} value={time} />
                ))}
              </datalist>
              {isTimePickerOpen && (
                <div className="absolute left-0 top-12 z-20 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {timeOptions.map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => {
                        update("startTime", time);
                        setIsTimePickerOpen(false);
                      }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${
                        data.startTime === time ? "bg-[#003476] text-white" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Time Zone *</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={data.timeZone}
                list="world-time-zones"
                onFocus={loadWorldTimeZones}
                onClick={loadWorldTimeZones}
                onChange={(e) => update("timeZone", e.target.value)}
                className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none text-ellipsis focus:border-[#003476]"
              />
              <datalist id="world-time-zones">
                {timeZones.map((timeZone) => (
                  <option key={timeZone} value={timeZone} />
                ))}
              </datalist>
            </div>
            <p className="text-xs text-slate-500">Current zone: {selectedTimeZone.replace(/_/g, " ")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Info className="h-4 w-4" />
          <span>Duration: 1 hour</span>
        </div>
      </div>

      {/* Block 3 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003476] text-sm font-bold text-white">3</div>
          <h2 className="text-xl font-bold text-slate-900">Language Policy</h2>
        </div>
        
        <div className="space-y-2 mb-4">
          <label className="text-sm font-semibold text-slate-900">Source Language *</label>
          <div className="relative max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 rounded bg-[#fdfcf6] px-1.5 py-0.5 text-[10px] font-bold text-[#003476]">
              {getLanguageRegion(data.primaryLanguage)}
            </span>
            <select
              value={data.primaryLanguage}
              onChange={(e) => {
                const nextSource = e.target.value;
                const nextTargets = getAvailableTargets(nextSource).slice(0, data.translationMode === "single" ? 1 : 3);
                update("primaryLanguage", nextSource);
                update("targetLanguages", nextTargets.map((language) => language.code));
              }}
              className="w-full appearance-none rounded-lg border border-slate-200 pl-10 pr-8 py-2.5 text-sm text-slate-900 outline-none bg-white"
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name} ({language.nativeName})
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Info className="h-4 w-4" />
          <span>
            Default targets: {languageTargets.map((language) => language.name).join(", ")}. You can refine single or multi-language mode in Step 2.
          </span>
        </div>
      </div>
    </>
  );
}

function Step1Sidebar({ data }: { data: CreateRoomFormData }) {
  return (
    <>
      {/* Summary Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-5 w-5 text-[#003476]" />
          <h3 className="text-lg font-bold text-slate-900">Setup Summary</h3>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><FileText className="h-3 w-3"/> Meeting Title</p>
            <p className="text-sm font-semibold text-slate-900">{data.meetingTitle}</p>
          </div>
          <div className="h-px bg-slate-100"></div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><CalendarIcon className="h-3 w-3"/> Schedule</p>
            <p className="text-sm font-semibold text-slate-900">{formatDateValue(data.date)}</p>
            <p className="text-sm font-semibold text-slate-900">{data.startTime}</p>
            <p className="text-xs text-slate-500 mt-0.5">{data.timeZone}</p>
          </div>
          <div className="h-px bg-slate-100"></div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><Clock className="h-3 w-3"/> Meeting Mode</p>
            <span className="inline-block mt-1 rounded-full border border-[#e4eef9]/30 bg-[#fdfcf6] px-2.5 py-0.5 text-xs font-medium text-[#003476]">
              {data.scheduleMode === "later" ? "Scheduled for later" : "Start now"}
            </span>
          </div>
          <div className="h-px bg-slate-100"></div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><Globe className="h-3 w-3"/> Source Language</p>
            <p className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
              <span className="rounded bg-[#fdfcf6] px-1.5 py-0.5 text-[10px] font-bold text-[#003476]">{getLanguageRegion(data.primaryLanguage)}</span>
              {getLanguageName(data.primaryLanguage)}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-[#fdfcf6] p-3 border border-[#fdfcf6] flex gap-2">
          <Info className="h-4 w-4 text-[#e4eef9] shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 leading-relaxed">
            Permissions, terminology files, invitees, and target languages will be configured in Step 2.
          </p>
        </div>
      </div>

    </>
  );
}

// ============================================================================
// STEP 2 COMPONENTS
// ============================================================================

function Step2Form({ data, update }: { data: CreateRoomFormData; update: UpdateForm }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Room setup</h2>
          <p className="mt-1 text-sm text-slate-500">Configure the essentials before creating the translation room.</p>
        </div>
        <span className="inline-flex w-fit items-center rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
          Step 2 of 2
        </span>
      </div>

      <FormSection title="Basics" icon={<FileText className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-900">Room Name *</label>
              <div className="relative">
                <input
                  type="text"
                  value={data.roomName}
                  onChange={(e) => update("roomName", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 pr-10 text-sm text-slate-900 outline-none focus:border-[#003476] focus:ring-1 focus:ring-[#003476]"
                />
                <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#003476]" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                  Max Participants * <Info className="h-3 w-3 text-slate-400" />
                </label>
                <input
                  type="number"
                  value={data.maxParticipants}
                  onChange={(e) => update("maxParticipants", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#003476] focus:ring-1 focus:ring-[#003476]"
                />
                <p className="text-xs text-slate-500">2 to 500 people.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-900">Host Note</label>
                <textarea
                  value={data.hostNote}
                  onChange={(e) => update("hostNote", e.target.value)}
                  placeholder="Add a short note for yourself or your team..."
                  rows={3}
                  maxLength={200}
                  className="w-full resize-none rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#003476] focus:ring-1 focus:ring-[#003476]"
                />
                <p className="text-right text-xs text-slate-400">{data.hostNote.length} / 200</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Room code</span>
              <Button variant="outline" size="sm" className="h-7 bg-white px-2 text-xs">
                Copy
              </Button>
            </div>
            <p className="font-mono text-2xl font-bold tracking-widest text-slate-900">GSS-7X2Q</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Generated after the room is created.</p>
          </div>
        </div>
      </FormSection>

      <FormSection title="Access" icon={<Lock className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">Room Visibility *</label>
            <div className="grid grid-cols-1 gap-2">
              <ChoiceTile
                icon={<Globe className="h-4 w-4" />}
                title="Public"
                description="Anyone with the room code can join"
                selected={data.visibility === "Public"}
                onClick={() => update("visibility", "Public")}
              />
              <ChoiceTile
                icon={<Lock className="h-4 w-4" />}
                title="Private"
                description="Only invited users can join"
                selected={data.visibility === "Private"}
                onClick={() => update("visibility", "Private")}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">Who can join *</label>
            <div className="grid grid-cols-1 gap-2">
              <ChoiceTile
                title="Anyone with the room code"
                selected={data.joinRule === "Anyone with the room code"}
                onClick={() => update("joinRule", "Anyone with the room code")}
              />
              <ChoiceTile
                title="Invited users only"
                selected={data.joinRule === "Invited users only"}
                onClick={() => update("joinRule", "Invited users only")}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">Permissions in room *</label>
            <div className="grid grid-cols-1 gap-2">
              <ChoiceTile
                title="Host only"
                description="Only the host can manage the room"
                selected={data.permissions === "Host only"}
                onClick={() => update("permissions", "Host only")}
              />
              <ChoiceTile
                title="Host + Organizers"
                description="Assign organizers to help manage the room"
                selected={data.permissions === "Host + Organizers"}
                onClick={() => update("permissions", "Host + Organizers")}
              />
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection title="Languages" icon={<Globe className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-900">Source Language *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 rounded bg-[#fdfcf6] px-1.5 py-0.5 text-[10px] font-bold text-[#003476]">
                {getLanguageRegion(data.primaryLanguage)}
              </span>
              <select
                value={data.primaryLanguage}
                onChange={(e) => {
                  const nextSource = e.target.value;
                  const nextTargets = getAvailableTargets(nextSource).slice(0, data.translationMode === "single" ? 1 : 3);
                  update("primaryLanguage", nextSource);
                  update("targetLanguages", nextTargets.map((language) => language.code));
                }}
                className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-8 text-sm text-slate-900 outline-none focus:border-[#003476] focus:ring-1 focus:ring-[#003476]"
              >
                {SUPPORTED_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name} ({language.nativeName})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <ChevronRight className="h-4 w-4 rotate-90" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-end justify-between gap-3">
              <label className="text-sm font-semibold text-slate-900">Target Translation Languages *</label>
              <span className="text-xs font-medium text-[#003476]">
                {data.translationMode === "single" ? "Single target" : "Up to 3 target languages"}
              </span>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <ChoiceTile
                title="Single-language room"
                description="One shared translation target"
                selected={data.translationMode === "single"}
                onClick={() => {
                  update("translationMode", "single");
                  update("targetLanguages", data.targetLanguages.slice(0, 1));
                }}
              />
              <ChoiceTile
                title="Multi-language room"
                description="Participants can choose from targets"
                selected={data.translationMode === "multi"}
                onClick={() => update("translationMode", "multi")}
              />
            </div>
            <div className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
              {data.targetLanguages.map((lang: string) => (
                <button
                  type="button"
                  key={lang}
                  onClick={() => {
                    const nextTargets = data.targetLanguages.filter((language) => language !== lang);
                    update("targetLanguages", nextTargets.length > 0 ? nextTargets : [lang]);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                >
                  {getLanguageName(lang)} <X className="h-3 w-3 cursor-pointer text-slate-400 hover:text-slate-600" />
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {getAvailableTargets(data.primaryLanguage).map((language) => {
                const selected = data.targetLanguages.includes(language.code);
                const disabled =
                  !selected &&
                  (data.translationMode === "single" || data.targetLanguages.length >= 3);

                return (
                  <button
                    key={language.code}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (selected) {
                        const nextTargets = data.targetLanguages.filter((target) => target !== language.code);
                        update("targetLanguages", nextTargets.length > 0 ? nextTargets : [language.code]);
                        return;
                      }
                      update(
                        "targetLanguages",
                        data.translationMode === "single"
                          ? [language.code]
                          : [...data.targetLanguages, language.code].slice(0, 3)
                      );
                    }}
                    className={`flex min-h-12 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                      selected
                        ? "border-[#003476] bg-[#fdfcf6] text-[#003476] ring-1 ring-[#003476]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-45"
                    }`}
                  >
                    <span>
                      <span className="block font-semibold">{language.name}</span>
                      <span className="text-xs text-slate-500">{language.nativeName}</span>
                    </span>
                    {selected && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              Backend payload: sourceLanguage={data.primaryLanguage}, targetLanguages={serializeTargetLanguages(data.targetLanguages)}
            </p>
          </div>
        </div>
      </FormSection>

      <FormSection title="Terminology files" icon={<Upload className="h-4 w-4" />} last>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex border-b border-slate-200">
              <button className="border-b-2 border-[#003476] px-3 py-2 text-sm font-semibold text-[#003476]">
                Company files
              </button>
              <button className="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">
                Upload files
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-56">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search files..."
                  className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-900 outline-none focus:border-[#003476]"
                />
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs">
                <Filter className="h-3 w-3" /> Filter
              </Button>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <span className="rounded bg-[#003476] px-2.5 py-1 text-xs font-medium text-white">All</span>
            {["PDF", "CSV", "Excel", "Termbase", "Glossary"].map((filter) => (
              <span key={filter} className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                {filter}
              </span>
            ))}
          </div>

          <div className="max-h-[310px] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="w-8 p-2">
                    <input type="checkbox" className="rounded-sm text-[#003476]" />
                  </th>
                  <th className="p-2 font-medium">File Name</th>
                  <th className="p-2 font-medium">Tags</th>
                  <th className="p-2 font-medium">Uploaded</th>
                  <th className="p-2 font-medium">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50">
                    <td className="p-2">
                      <input type="checkbox" defaultChecked={file.selected} className="rounded-sm text-[#003476]" />
                    </td>
                    <td className="flex items-center gap-1.5 p-2 font-medium text-slate-900">
                      <CheckCircle2 className="h-3 w-3 text-[#003476]" /> {file.name}
                    </td>
                    <td className="p-2">
                      <span className="rounded bg-[#fdfcf6] px-1.5 py-0.5 text-[#003476]">{file.tag}</span>
                    </td>
                    <td className="p-2">{file.date}</td>
                    <td className="p-2">{file.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-slate-900">12 files selected</span>
            <span className="text-xs font-medium text-slate-500">Medical Terms Q2, Legal Glossary EN-VI, +10 more</span>
          </div>
        </div>
      </FormSection>
    </div>
  );
}

function FormSection({
  title,
  icon,
  children,
  last = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`p-6 ${last ? "" : "border-b border-slate-100"}`}>
      <div className="mb-4 flex items-center gap-2 text-slate-900">
        <span className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[#003476]">
          {icon}
        </span>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function SquareIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
        selected ? "border-[#003476] bg-[#003476]" : "border-slate-300 bg-white"
      }`}
    >
      {selected && <Check className="h-3 w-3 text-white" />}
    </span>
  );
}

function ChoiceTile({
  title,
  description,
  icon,
  selected,
  onClick,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-[64px] w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-[#003476] bg-[#fdfcf6] shadow-sm ring-1 ring-[#003476]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <SquareIndicator selected={selected} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {icon && <span className={selected ? "text-[#003476]" : "text-slate-500"}>{icon}</span>}
          <p className="text-sm font-semibold text-slate-900">{title}</p>
        </div>
        {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
      </div>
    </button>
  );
}

function Step2Sidebar({ data }: { data: CreateRoomFormData }) {
  return (
    <>
      {/* Room Summary Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#003476]" />
            <h3 className="text-lg font-bold text-slate-900">Room Summary</h3>
          </div>
        </div>
        <p className="text-sm text-green-600 font-medium mb-6">Your room is ready to create.</p>

        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><FileText className="h-3 w-3"/> Room Name</p>
            <p className="text-sm font-semibold text-slate-900">{data.roomName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><Users className="h-3 w-3"/> Max Participants</p>
            <p className="text-sm font-semibold text-slate-900">{data.maxParticipants}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><Lock className="h-3 w-3"/> Visibility</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{data.visibility}</p>
              <span className="rounded bg-[#fdfcf6] px-1.5 py-0.5 text-[10px] font-medium text-[#003476] border border-blue-100">50 invitees</span>
            </div>
          </div>
          <div className="h-px bg-slate-100"></div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><Globe className="h-3 w-3"/> Source Language</p>
            <p className="text-sm font-semibold text-slate-900">{getLanguageName(data.primaryLanguage)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><Globe className="h-3 w-3"/> Target Languages ({data.targetLanguages.length})</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {data.targetLanguages.map((language) => (
                <span key={language} className="rounded bg-[#fdfcf6] px-1.5 py-0.5 text-xs font-medium text-[#003476]">
                  {getLanguageName(language)}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 capitalize">{data.translationMode.replace("-", " ")} policy</p>
          </div>
          <div className="h-px bg-slate-100"></div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><Upload className="h-3 w-3"/> Terminology Files</p>
            <p className="text-sm font-semibold text-slate-900">12 files selected</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><Globe className="h-3 w-3"/> Permissions in room</p>
            <p className="text-sm font-semibold text-slate-900">{data.permissions}</p>
          </div>
        </div>
      </div>

    </>
  );
}
