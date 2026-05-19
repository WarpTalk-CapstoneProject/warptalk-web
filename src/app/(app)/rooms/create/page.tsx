"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Check,
  Clock,
  Copy,
  DoorOpen,
  Globe,
  Link2,
  Lock,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCreateTranslationRoom } from "@/hooks/use-translationRooms";
import {
  SUPPORTED_LANGUAGES,
  getAvailableTargets,
  getLanguageName,
  normalizeLanguageCode,
} from "@/lib/languages";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { CreateTranslationRoomRequest, TranslationRoomDto } from "@/types/translationRoom";

const PLAN_DEFAULT_MAX_PARTICIPANTS = 10;

type AdvancedSettings = {
  sourceLanguage: string;
  targetLanguages: string[];
  maxParticipants: string;
  requiresApproval: boolean;
};

function todayValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 30);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function generatedTitle() {
  return `Translated meeting - ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date())}`;
}

function getJoinLink(code: string) {
  if (typeof window === "undefined") return `/join?code=${code}`;
  return `${window.location.origin}/join?code=${code}`;
}

function buildScheduledAt(date: string, time: string) {
  if (!date || !time) return undefined;
  const scheduled = new Date(`${date}T${time}:00`);
  return Number.isNaN(scheduled.getTime()) ? undefined : scheduled.toISOString();
}

function getDefaultSourceLanguage(preferredLanguage?: string) {
  return normalizeLanguageCode(preferredLanguage?.split("-")[0] ?? preferredLanguage ?? "en");
}

function getDefaultTargets(sourceLanguage: string) {
  const targets = getAvailableTargets(sourceLanguage);
  return targets.length > 0 ? [targets[0].code] : ["en"];
}

export default function CreateRoomPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const createRoom = useCreateTranslationRoom();
  const defaultTitle = useMemo(() => generatedTitle(), []);
  const defaultSourceLanguage = useMemo(() => getDefaultSourceLanguage(user?.preferredLanguage), [user?.preferredLanguage]);
  const [title, setTitle] = useState("");
  const [scheduleDate, setScheduleDate] = useState(todayValue());
  const [scheduleTime, setScheduleTime] = useState(currentTimeValue());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<TranslationRoomDto | null>(null);
  const [createdMode, setCreatedMode] = useState<"now" | "later" | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedSettings>(() => ({
    sourceLanguage: defaultSourceLanguage,
    targetLanguages: getDefaultTargets(defaultSourceLanguage),
    maxParticipants: "",
    requiresApproval: false,
  }));

  const isParticipantOnly = user?.roles?.includes("participant") && !user?.roles?.includes("host");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const resolvedTitle = title.trim() || defaultTitle;
  const maxParticipants = Number(advanced.maxParticipants) || PLAN_DEFAULT_MAX_PARTICIPANTS;
  const joinLink = createdRoom ? getJoinLink(createdRoom.translationRoomCode) : "";

  const updateSourceLanguage = (sourceLanguage: string) => {
    const normalized = normalizeLanguageCode(sourceLanguage);
    setAdvanced((current) => ({
      ...current,
      sourceLanguage: normalized,
      targetLanguages: getDefaultTargets(normalized),
    }));
  };

  const toggleTargetLanguage = (language: string) => {
    setAdvanced((current) => {
      const selected = current.targetLanguages.includes(language);
      const nextTargets = selected
        ? current.targetLanguages.filter((target) => target !== language)
        : [...current.targetLanguages, language];

      return {
        ...current,
        targetLanguages: nextTargets.length > 0 ? nextTargets.slice(0, 3) : [language],
      };
    });
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  };

  const createTranslatedRoom = async (mode: "now" | "later") => {
    if (mode === "later" && !buildScheduledAt(scheduleDate, scheduleTime)) {
      toast.error("Choose a valid schedule time.");
      return;
    }

    const payload: CreateTranslationRoomRequest = {
      title: resolvedTitle,
      description: title.trim() ? undefined : "Generated title was used.",
      translationRoomType: mode === "now" ? "instant" : "scheduled",
      scheduledAt: mode === "later" ? buildScheduledAt(scheduleDate, scheduleTime) : undefined,
      maxParticipants,
      sourceLanguage: advanced.sourceLanguage,
      targetLanguages: advanced.targetLanguages,
      settings: {
        requiresApproval: advanced.requiresApproval,
      },
    };

    try {
      const room = await createRoom.mutateAsync(payload);
      setCreatedRoom(room);
      setCreatedMode(mode);
      toast.success(mode === "now" ? "Room created." : "Room scheduled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the room.";
      toast.error(message);
    }
  };

  if (isParticipantOnly) {
    return (
      <div className="mx-auto flex min-h-[520px] w-full max-w-3xl items-center justify-center">
        <div className="rounded-2xl border border-[#e4eef9] bg-white p-8 text-center shadow-sm">
          <Lock className="mx-auto mb-4 h-8 w-8 text-[#003476]" />
          <h1 className="text-2xl font-bold text-slate-950">Host permission required</h1>
          <p className="mt-2 text-sm text-slate-600">Only hosts can create rooms. Participants can join from the preflight screen.</p>
          <Button onClick={() => router.push("/join")} className="mt-5 bg-[#003476] text-white hover:bg-[#003476]/90">
            Go to join preflight
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-6 pb-16">
      <header className="flex flex-col gap-4 rounded-2xl border border-[#e4eef9] bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#003476]">Translation room</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Create translated room</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Create a room link first. Language routing, participant preferences, and media runtime are handled automatically unless you customize them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition",
            advancedOpen
              ? "border-[#003476] bg-[#e4eef9] text-[#003476]"
              : "border-slate-200 bg-white text-slate-700 hover:border-[#003476]/40"
          )}
        >
          <Settings className="h-4 w-4" />
          Advanced
        </button>
      </header>

      <section className="rounded-2xl border border-[#e4eef9] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="room-title" className="text-sm font-bold text-slate-950">
              Room title <span className="font-medium text-slate-400">Optional</span>
            </label>
            <span className="text-xs font-medium text-slate-500">Leave blank to use the generated title.</span>
          </div>
          <input
            id="room-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={defaultTitle}
            className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#003476] focus:ring-2 focus:ring-[#003476]/15"
          />
        </div>

        {advancedOpen && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
            <div className="grid gap-4 lg:grid-cols-[180px_1fr_180px]">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Max participants</label>
                <input
                  type="number"
                  min={2}
                  max={500}
                  value={advanced.maxParticipants}
                  onChange={(event) => setAdvanced((current) => ({ ...current, maxParticipants: event.target.value }))}
                  placeholder={`${PLAN_DEFAULT_MAX_PARTICIPANTS} by plan`}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#003476]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Language defaults</label>
                <div className="mt-2 grid gap-3 md:grid-cols-[220px_1fr]">
                  <select
                    value={advanced.sourceLanguage}
                    onChange={(event) => updateSourceLanguage(event.target.value)}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#003476]"
                  >
                    {SUPPORTED_LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        Auto from {language.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    {getAvailableTargets(advanced.sourceLanguage).map((language) => {
                      const selected = advanced.targetLanguages.includes(language.code);
                      return (
                        <button
                          key={language.code}
                          type="button"
                          onClick={() => toggleTargetLanguage(language.code)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                            selected
                              ? "border-[#003476] bg-[#e4eef9] text-[#003476]"
                              : "border-slate-200 bg-white text-slate-600 hover:border-[#003476]/40"
                          )}
                        >
                          {selected && <Check className="mr-1 inline h-3 w-3" />}
                          {language.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Access</label>
                <button
                  type="button"
                  onClick={() => setAdvanced((current) => ({ ...current, requiresApproval: !current.requiresApproval }))}
                  className={cn(
                    "mt-2 flex h-10 w-full items-center justify-center rounded-lg border px-3 text-sm font-semibold transition",
                    advanced.requiresApproval
                      ? "border-[#003476] bg-[#e4eef9] text-[#003476]"
                      : "border-slate-200 bg-white text-slate-700"
                  )}
                >
                  {advanced.requiresApproval ? "Host approval on" : "Anyone with link"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <ActionCard
          icon={<Sparkles className="h-5 w-5" />}
          title="Create now"
          description="Generate a room code and share link immediately."
          primaryLabel={createRoom.isPending && createdMode !== "later" ? "Creating..." : "Create now"}
          disabled={createRoom.isPending}
          onPrimary={() => createTranslatedRoom("now")}
          room={createdMode === "now" ? createdRoom : null}
          joinLink={joinLink}
          onCopyLink={() => copyText(joinLink, "Join link")}
          onCopyCode={() => createdRoom && copyText(createdRoom.translationRoomCode, "Room code")}
          onEnter={() => createdRoom && router.push(`/room/${createdRoom.id}`)}
        />

        <ActionCard
          icon={<Calendar className="h-5 w-5" />}
          title="Schedule later"
          description={`Participants will see the time in their own device timezone. Yours: ${timezone}.`}
          primaryLabel={createRoom.isPending && createdMode !== "now" ? "Scheduling..." : "Schedule later"}
          disabled={createRoom.isPending}
          onPrimary={() => createTranslatedRoom("later")}
          room={createdMode === "later" ? createdRoom : null}
          joinLink={joinLink}
          onCopyLink={() => copyText(joinLink, "Invite link")}
          onCopyCode={() => createdRoom && copyText(createdRoom.translationRoomCode, "Room code")}
          onEnter={() => createdRoom && router.push(`/room/${createdRoom.id}`)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                Date
              </span>
              <input
                type="date"
                value={scheduleDate}
                onChange={(event) => setScheduleDate(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-[#003476]"
              />
            </label>
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                Time
              </span>
              <input
                type="time"
                value={scheduleTime}
                onChange={(event) => setScheduleTime(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-[#003476]"
              />
            </label>
          </div>
        </ActionCard>
      </div>

      <section className="rounded-2xl border border-[#e4eef9] bg-[#f8fafc] p-5">
        <div className="grid gap-4 text-sm text-slate-600 md:grid-cols-3">
          <DefaultItem icon={<Globe className="h-4 w-4" />} label="Languages" value={`${getLanguageName(advanced.sourceLanguage)} -> ${advanced.targetLanguages.map(getLanguageName).join(", ")}`} />
          <DefaultItem icon={<Users className="h-4 w-4" />} label="Capacity" value={`${maxParticipants} participants from host plan`} />
          <DefaultItem icon={<Lock className="h-4 w-4" />} label="Access" value={advanced.requiresApproval ? "Host approval required" : "Anyone with link can request/join"} />
        </div>
      </section>

      {createdRoom && (
        <RoomCreatedDialog
          room={createdRoom}
          joinLink={joinLink}
          onClose={() => setCreatedRoom(null)}
          onCopyLink={() => copyText(joinLink, "Join link")}
          onCopyCode={() => copyText(createdRoom.translationRoomCode, "Room code")}
          onEnter={() => router.push(`/room/${createdRoom.id}`)}
        />
      )}
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  primaryLabel,
  disabled,
  onPrimary,
  room,
  joinLink,
  onCopyLink,
  onCopyCode,
  onEnter,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryLabel: string;
  disabled?: boolean;
  onPrimary: () => void;
  room: TranslationRoomDto | null;
  joinLink: string;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onEnter: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[320px] flex-col rounded-2xl border border-[#e4eef9] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e4eef9] text-[#003476]">{icon}</span>
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>

      {children && <div className="mt-5">{children}</div>}

      <div className="mt-auto pt-5">
        {room ? (
          <div className="rounded-2xl border border-[#003476]/15 bg-[#f8fafc] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#003476]">Room ready</p>
            <p className="mt-2 text-lg font-bold text-slate-950">{room.title}</p>
            <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Code</span>
                <span className="font-mono text-sm font-bold uppercase text-slate-950">{room.translationRoomCode}</span>
              </div>
              <div className="min-w-0 truncate text-xs text-slate-500">{joinLink}</div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={onCopyLink} className="gap-2">
                <Link2 className="h-4 w-4" />
                Copy link
              </Button>
              <Button type="button" variant="outline" onClick={onCopyCode} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy code
              </Button>
              <Button type="button" onClick={onEnter} className="gap-2 bg-[#003476] text-white hover:bg-[#003476]/90">
                <DoorOpen className="h-4 w-4" />
                Enter
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" disabled={disabled} onClick={onPrimary} className="h-12 w-full bg-[#003476] text-base font-bold text-white hover:bg-[#003476]/90">
            {primaryLabel}
          </Button>
        )}
      </div>
    </section>
  );
}

function DefaultItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#003476]">{icon}</span>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function RoomCreatedDialog({
  room,
  joinLink,
  onClose,
  onCopyLink,
  onCopyCode,
  onEnter,
}: {
  room: TranslationRoomDto;
  joinLink: string;
  onClose: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onEnter: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#e4eef9] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#003476]">Room created</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{room.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Room code</p>
          <p className="mt-2 font-mono text-2xl font-black uppercase tracking-widest text-[#003476]">{room.translationRoomCode}</p>
          <p className="mt-3 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{joinLink}</p>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Button type="button" variant="outline" onClick={onCopyLink} className="gap-2">
            <Link2 className="h-4 w-4" />
            Copy link
          </Button>
          <Button type="button" variant="outline" onClick={onCopyCode} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy code
          </Button>
          <Button type="button" onClick={onEnter} className="gap-2 bg-[#003476] text-white hover:bg-[#003476]/90">
            <DoorOpen className="h-4 w-4" />
            Enter room
          </Button>
        </div>
      </div>
    </div>
  );
}
