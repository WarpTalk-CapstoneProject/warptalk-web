"use client";

import { useMemo, useRef, useState } from "react";
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
import { useCreateVoiceProfile, useDeleteVoiceProfile, useVoiceProfiles } from "@/hooks/use-voice-profiles";
import type { VoiceProfileDto } from "@/types/voice-profile";

const LANGUAGE_OPTIONS = [
  { value: "vi-VN", label: "Vietnamese (vi-VN)" },
  { value: "en-US", label: "English (en-US)" },
  { value: "ja-JP", label: "Japanese (ja-JP)" },
  { value: "ko-KR", label: "Korean (ko-KR)" },
];

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileList = useMemo(() => profiles ?? [], [profiles]);
  const readyCount = useMemo(() => profileList.filter((p) => p.hasSample).length, [profileList]);
  const voiceProfileFilters = [
    { key: "all", label: "All profiles", language: "all", sample: "all" },
    { key: "ready", label: "With sample", language: "all", sample: "ready" },
    { key: "missing", label: "Missing sample", language: "all", sample: "missing" },
    { key: "vi", label: "VI", language: "vi-VN", sample: "all" },
    { key: "en", label: "EN", language: "en-US", sample: "all" },
    { key: "ja", label: "JA", language: "ja-JP", sample: "all" },
    { key: "ko", label: "KO", language: "ko-KR", sample: "all" },
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
    setDisplayName("");
    setLanguage("vi-VN");
    setSampleFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > MAX_SAMPLE_SIZE_BYTES) {
      toast.error("Audio sample must be under 20 MB.");
      e.target.value = "";
      setSampleFile(null);
      return;
    }
    setSampleFile(file);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("Please enter a profile name.");
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
    } catch {
      toast.error("Failed to create voice profile");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Voice profile deleted");
    } catch {
      toast.error("Failed to delete voice profile");
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

        <section className="mx-4 grid gap-3 border-y border-border py-4 sm:grid-cols-3">
          <Metric icon={<Microphone size={16} weight="bold" />} label="Profiles" value={String(profileList.length)} />
          <Metric icon={<CheckCircle size={16} weight="bold" />} label="With sample" value={String(readyCount)} />
          <Metric icon={<Waveform size={16} weight="bold" />} label="Default language" value="vi-VN" />
        </section>

        <LibraryVoicePicker profiles={profileList} />

        <section className="mx-4 space-y-4 py-4 pb-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[18px] font-semibold text-ink">Your voice profiles</h2>
              <p className="text-[13px] leading-5 text-ink-muted">
                Attach a short reference sample so WarpTalk can personalize your future room audio.
              </p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full bg-white px-3 py-1 text-[12px] text-ink-muted">
              {readyCount}/{profileList.length} sample ready
            </Badge>
          </div>

          <div className="divide-y divide-border rounded-[16px] border border-border bg-white">
            {isLoading && (
              <div className="px-5 py-6 text-[14px] text-ink-muted">Loading voice profiles...</div>
            )}

            {!isLoading && profileList.length === 0 && (
              <div className="grid gap-4 px-5 py-8 md:grid-cols-[1fr_auto] md:items-center">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-neutral-950 text-white">
                    <Waveform size={20} weight="bold" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-ink">No voice profiles yet</p>
                    <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-muted">
                      Create your first profile and attach a reference sample when you are ready.
                    </p>
                  </div>
                </div>
                <Button
                  className="h-9 w-fit rounded-full bg-neutral-950 px-4 text-white hover:bg-neutral-800"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus size={15} weight="bold" />
                  Create profile
                </Button>
              </div>
            )}

            {!isLoading && profileList.length > 0 && filteredProfiles.length === 0 && (
              <div className="px-5 py-8 text-center text-[14px] text-ink-muted">
                No voice profile matches the current search and language filter.
              </div>
            )}

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
        </section>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create voice profile</DialogTitle>
            <DialogDescription>
              Give your voice profile a name and language. You can optionally attach a reference audio sample now.
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
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sample">Reference sample (optional)</Label>
              <Input
                id="sample"
                type="file"
                accept="audio/*"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <p className="text-xs text-neutral-500">WAV, MP3, M4A or OGG, up to 20 MB.</p>
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={createMutation.isPending}
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
            <span>{profile.language ?? "No language set"}</span>
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
