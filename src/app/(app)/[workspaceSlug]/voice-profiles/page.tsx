"use client";

import { LanguageLabel, languageLabelText } from "@/components/language/language-label";
import { languagesInScope } from "@/lib/language/languages";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  FileAudio,
  Funnel,
  Microphone,
  Plus,
  SlidersHorizontal,
  Trash,
  Waveform,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LibraryVoicePicker } from "@/components/voice/library-voice-picker";
import { MyDubVoicePicker } from "@/components/voice/my-dub-voice-picker";
import { VoiceConsentCard } from "@/components/voice/voice-consent-card";
import {
  WorkspaceEmptyState,
  WorkspacePrimaryButton,
} from "@/components/workspace/page-chrome";
import { useCreateVoiceProfile, useDeleteVoiceProfile, useVoiceProfiles } from "@/hooks/use-voice-profiles";
import { getErrorMessage } from "@/lib/api/errors";
import { analyzeVoiceSample } from "@/lib/voice/voice-sample-quality";
import type { VoiceProfileDto } from "@/types/voice-profile";

// Values are the locale tags the backend stores and must not change; the label is what a
// person reads, and a raw tag in parentheses is not that.
const LANGUAGE_OPTIONS = languagesInScope("voiceProfile").map((language) => ({
  value: language.locale,
  label: languageLabelText(language.locale),
}));

const MAX_SAMPLE_SIZE_BYTES = 20 * 1024 * 1024;

export default function VoiceProfilesPage() {
  const { data: profiles, isLoading } = useVoiceProfiles();
  const createMutation = useCreateVoiceProfile();
  const deleteMutation = useDeleteVoiceProfile();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState("vi-VN");
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [sampleFilter, setSampleFilter] = useState<"all" | "ready" | "missing">("all");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleAssessment, setSampleAssessment] = useState<string | null>(null);
  const [isCheckingSample, setIsCheckingSample] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const profileList = useMemo(() => profiles ?? [], [profiles]);
  const readyCount = useMemo(() => profileList.filter((p) => p.hasSample).length, [profileList]);
  const voiceProfileFilters = [
    { key: "all", label: "All profiles", language: "all", sample: "all" },
    { key: "ready", label: "With sample", language: "all", sample: "ready" },
    { key: "missing", label: "Missing sample", language: "all", sample: "missing" },
    { key: "vi", label: "VI", language: "vi-VN", sample: "all" },
    { key: "en", label: "EN", language: "en-US", sample: "all" },
    { key: "ja", label: "JA", language: "ja-JP", sample: "all" },
  ] as const;
  const activeVoiceFilter =
    voiceProfileFilters.find((item) => item.language === languageFilter && item.sample === sampleFilter)?.key ??
    "custom";
  const filteredProfiles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return profileList.filter((profile) => {
      const matchesQuery =
        !normalizedQuery ||
        profile.displayName?.toLowerCase().includes(normalizedQuery) ||
        profile.language?.toLowerCase().includes(normalizedQuery);
      const matchesLanguage = languageFilter === "all" || profile.language === languageFilter;
      const matchesSample =
        sampleFilter === "all" ||
        (sampleFilter === "ready" && profile.hasSample) ||
        (sampleFilter === "missing" && !profile.hasSample);
      return matchesQuery && matchesLanguage && matchesSample;
    });
  }, [languageFilter, profileList, sampleFilter, searchQuery]);

  function resetForm() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    setIsRecording(false);
    setDisplayName("");
    setLanguage("vi-VN");
    setSampleFile(null);
    setSampleAssessment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function checkAndSetSample(file: File | null): Promise<boolean> {
    if (!file) {
      setSampleFile(null);
      setSampleAssessment(null);
      return false;
    }
    if (file.size > MAX_SAMPLE_SIZE_BYTES) {
      toast.error("Audio sample must be under 20 MB.");
      setSampleFile(null);
      setSampleAssessment(null);
      return false;
    }

    setIsCheckingSample(true);
    const assessment = await analyzeVoiceSample(file);
    setIsCheckingSample(false);
    setSampleAssessment(assessment.message);
    if (!assessment.accepted) {
      setSampleFile(null);
      toast.error(assessment.message);
      return false;
    }

    setSampleFile(file);
    toast.success("Voice sample passed the quality check.");
    return true;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    const accepted = await checkAndSetSample(file);
    if (!accepted) e.target.value = "";
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("This browser does not support direct audio recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const preferredType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("ogg") ? "ogg" : "webm";
        const recording = new File(recordingChunksRef.current, `voice-sample.${extension}`, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        void checkAndSetSample(recording);
      };
      recorder.start(250);
      setIsRecording(true);
      setSampleAssessment("Recording… Read the sample paragraph in a quiet room.");
    } catch {
      toast.error("Microphone access was denied or unavailable.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("Please enter a profile name.");
      return;
    }
    if (!sampleFile) {
      toast.error("Record or upload a clear voice sample first.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        displayName: displayName.trim(),
        language,
        sample: sampleFile,
      });
      toast.success("Voice profile created");
      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      // The server's own sentence, not a generic failure. This catch used to bind nothing and
      // show "Failed to create voice profile" for every cause, which is how WT-372 was reported:
      // the API answered "Unsupported audio format." — naming the defect exactly — and the page
      // threw that away, so the bug report could only say "API/status code: Chưa xác định".
      toast.error(getErrorMessage(error, "Failed to create voice profile"));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Voice profile deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete voice profile"));
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="flex shrink-0 flex-col gap-4 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            {voiceProfileFilters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setLanguageFilter(item.language);
                  setSampleFilter(item.sample);
                }}
                className={`flex items-center justify-center rounded-full border px-4 py-1.5 text-[13px] transition-all select-none ${
                  activeVoiceFilter === item.key
                    ? "border-transparent bg-surface-2 text-foreground font-medium shadow-none"
                    : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2 pl-4">
            <ExpandingSearchDock
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search voice profiles..."
              ariaLabel="Search voice profiles"
              collapsedWidth={28}
              expandedWidth={220}
              className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
              iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
              clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
              inputClassName="h-[26px] text-[12px]"
            />
            <button
              className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              title="Voice profile filters"
            >
              <Funnel weight="bold" size={13} />
              {(languageFilter !== "all" || sampleFilter !== "all") && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
              )}
            </button>
            <button
              className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              title={`${filteredProfiles.length} profiles`}
            >
              <SlidersHorizontal weight="bold" size={13} />
            </button>
            <div className="mx-1 h-4 w-[1px] bg-border" />
            <Button
              className="h-[28px] rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm hover:opacity-90"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus size={14} weight="bold" />
              Create profile
            </Button>
          </div>
        </section>

        {/* First on the page, above the profiles it authorises: a profile cannot legitimately
            exist without this permission, so the permission is what a reader should meet first. */}
        <VoiceConsentCard />

        <section className="mx-4 grid gap-3 border-y border-border py-4 sm:grid-cols-3">
          <Metric icon={<Microphone size={16} weight="bold" />} label="Profiles" value={String(profileList.length)} />
          <Metric icon={<CheckCircle size={16} weight="bold" />} label="With sample" value={String(readyCount)} />
          <Metric icon={<Waveform size={16} weight="bold" />} label="Default language" value="vi-VN" />
        </section>

        <MyDubVoicePicker profiles={profileList} />

        <LibraryVoicePicker profiles={profileList} />

        {/* No section title and no sentence explaining what a voice profile is: the page is
            called Voice Profiles in the sidebar and the top bar, the toolbar above already offers
            "Create profile", and the empty state says the rest at the moment it is needed.

            Colours come from the palette rather than `bg-white` and `bg-neutral-950`, which were
            invisible in dark mode and were the loudest thing on the page in light. */}
        <section className="mx-4 space-y-3 py-4 pb-6">
          <div className="flex items-center justify-end">
            <Badge
              variant="outline"
              className="w-fit rounded-full bg-canvas px-3 py-1 text-[12px] text-ink-muted"
            >
              {readyCount}/{profileList.length} sample ready
            </Badge>
          </div>

          {isLoading ? (
            <div className="rounded-[14px] border border-border bg-surface-1 px-5 py-6 text-[13px] text-ink-muted">
              Loading voice profiles…
            </div>
          ) : profileList.length === 0 ? (
            <WorkspaceEmptyState
              icon={<Waveform size={28} weight="duotone" />}
              title="No voice profiles yet"
              description="Create one and attach a short reference sample, and WarpTalk can speak your translations in your own voice."
              action={
                <WorkspacePrimaryButton
                  onClick={() => setIsCreateOpen(true)}
                  icon={<Plus size={13} weight="bold" />}
                >
                  Create profile
                </WorkspacePrimaryButton>
              }
            />
          ) : filteredProfiles.length === 0 ? (
            <WorkspaceEmptyState
              icon={<Waveform size={28} weight="duotone" />}
              title="No voice profile matches these filters"
              description="Try a different language or clear the search."
            />
          ) : (
            <div className="divide-y divide-border rounded-[14px] border border-border bg-surface-1">
              {filteredProfiles.map((profile, index) => (
                <VoiceProfileRow
                  key={profile.id}
                  profile={profile}
                  index={index}
                  onDelete={handleDelete}
                  disabled={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create voice profile</DialogTitle>
            <DialogDescription>
              Give your voice profile a name and language, then record or upload one clear speaker sample.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Profile name</Label>
              <Input
                id="displayName"
                placeholder="e.g. My presenting voice"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={(val) => setLanguage(val || "vi-VN")}>
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value ? <LanguageLabel value={String(value)} /> : "Select language..."
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sample">Reference voice sample</Label>
              <div className="rounded-lg border border-border bg-canvas p-3 text-xs leading-5 text-ink-muted">
                Read this sample in your normal voice: “WarpTalk helps my team understand every conversation clearly.” Use one speaker, no music, and a quiet room.
              </div>
              <Input
                id="sample"
                type="file"
                accept="audio/*"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "outline"}
                  size="sm"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isCheckingSample}
                >
                  <Microphone size={14} /> {isRecording ? "Stop recording" : "Record sample"}
                </Button>
                {sampleFile ? <span className="truncate text-xs text-ink-muted">{sampleFile.name}</span> : null}
              </div>
              <p className="text-xs text-neutral-500">WAV, MP3, M4A, OGG or WebM, 5–120 seconds, up to 20 MB.</p>
              {sampleAssessment ? <p className="text-xs text-ink-muted">{sampleAssessment}</p> : null}
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={createMutation.isPending || isCheckingSample || isRecording}
                className="min-w-[80px] text-white"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-neutral-950/5 text-neutral-950">
        {icon}
      </span>
      <div>
        <p className="text-[12px] text-ink-muted">{label}</p>
        <p className="text-[18px] font-semibold leading-6 text-ink">{value}</p>
      </div>
    </div>
  );
}

function VoiceProfileRow({
  profile,
  index,
  onDelete,
  disabled,
}: {
  profile: VoiceProfileDto;
  index: number;
  onDelete: (id: string) => void;
  disabled: boolean;
}) {
  const avatarClasses = [
    "bg-[radial-gradient(circle_at_28%_24%,#d8f3ff_0,#7cc4e8_32%,#15384a_100%)]",
    "bg-[radial-gradient(circle_at_28%_24%,#f9dda4_0,#88a57b_38%,#26342f_100%)]",
    "bg-[radial-gradient(circle_at_24%_22%,#ffd6dc_0,#cf7d6f_35%,#382234_100%)]",
  ];

  return (
    <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ${avatarClasses[index % avatarClasses.length]}`}>
          <Waveform size={18} weight="bold" className="text-white" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-ink">{profile.displayName || "Untitled profile"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
            {profile.language ? (
              <LanguageLabel value={profile.language} />
            ) : (
              <span>No language set</span>
            )}
            {profile.hasSample && (
              <span className="inline-flex items-center gap-1">
                <FileAudio size={14} /> sample attached
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <Badge variant="outline" className="w-fit rounded-full bg-white capitalize text-ink-muted">
          {profile.status}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-ink-muted hover:text-destructive"
          disabled={disabled}
          onClick={() => onDelete(profile.id)}
          aria-label={`Delete ${profile.displayName || "voice profile"}`}
        >
          <Trash weight="light" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
