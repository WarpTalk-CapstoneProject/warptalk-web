"use client";

import { useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  DownloadSimple,
  FileAudio,
  Funnel,
  Microphone,
  Plus,
  Trash,
  Translate,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import {
  FilterDock,
  FilterDockRow,
  FilterDockSection,
  filterDockSelectContentClass,
  filterDockSelectItemClass,
  filterDockSelectTriggerClass,
} from "@/components/ui/filter-dock";
import { useCreateVoiceProfile, useDeleteVoiceProfile, useVoiceProfiles } from "@/hooks/use-voice-profiles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { VoiceProfileDto } from "@/types/voice-profile";

const LANGUAGE_OPTIONS = [
  { value: "vi-VN", label: "Vietnamese", shortLabel: "VI" },
  { value: "en-US", label: "English", shortLabel: "EN" },
  { value: "ja-JP", label: "Japanese", shortLabel: "JA" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

const PROCESSING_OPTIONS = [
  { value: "all", label: "Any processing" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "draft", label: "Draft" },
  { value: "failed", label: "Failed" },
] as const;

const SAMPLE_OPTIONS = [
  { value: "all", label: "Any sample" },
  { value: "with-sample", label: "Has sample" },
  { value: "without-sample", label: "Missing sample" },
] as const;

const MAX_SAMPLE_SIZE_BYTES = 20 * 1024 * 1024;

type ManagedVoiceProfile = VoiceProfileDto & {
  ownerName?: string | null;
  ownerEmail?: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

type LanguageFilter = "all" | (typeof LANGUAGE_OPTIONS)[number]["value"];
type ActiveFilter = (typeof STATUS_OPTIONS)[number]["value"];
type ProcessingFilter = (typeof PROCESSING_OPTIONS)[number]["value"];
type SampleFilter = (typeof SAMPLE_OPTIONS)[number]["value"];

export default function VoiceProfilesPage() {
  const { data: profiles, isLoading } = useVoiceProfiles();
  const createMutation = useCreateVoiceProfile();
  const deleteMutation = useDeleteVoiceProfile();
  const currentUser = useAuthStore((state) => state.user);

  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [processingFilter, setProcessingFilter] = useState<ProcessingFilter>("all");
  const [sampleFilter, setSampleFilter] = useState<SampleFilter>("all");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState("vi-VN");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileList = useMemo(() => (profiles ?? []) as ManagedVoiceProfile[], [profiles]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profileList.filter((profile) => {
      const owner = getOwner(profile, currentUser);
      const status = normalizeStatus(profile.status);
      const matchesQuery =
        !normalizedQuery ||
        [
          profile.displayName,
          profile.language,
          profile.status,
          owner.name,
          owner.email,
        ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      const matchesLanguage = languageFilter === "all" || profile.language === languageFilter;
      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" && profile.isActive) ||
        (activeFilter === "inactive" && !profile.isActive);
      const matchesProcessing = processingFilter === "all" || status === processingFilter;
      const matchesSample =
        sampleFilter === "all" ||
        (sampleFilter === "with-sample" && profile.hasSample) ||
        (sampleFilter === "without-sample" && !profile.hasSample);

      return matchesQuery && matchesLanguage && matchesActive && matchesProcessing && matchesSample;
    });
  }, [activeFilter, currentUser, languageFilter, processingFilter, profileList, query, sampleFilter]);

  const activeCount = profileList.filter((profile) => profile.isActive).length;
  const sampleReadyCount = profileList.filter((profile) => profile.hasSample).length;
  const userLanguageCoverage = useMemo(() => getUserLanguageCoverage(profileList, currentUser), [currentUser, profileList]);
  const activeFilterCount = [
    languageFilter !== "all",
    activeFilter !== "all",
    processingFilter !== "all",
    sampleFilter !== "all",
  ].filter(Boolean).length;

  function resetForm() {
    setDisplayName("");
    setLanguage("vi-VN");
    setSampleFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_SAMPLE_SIZE_BYTES) {
      toast.error("Audio sample must be under 20 MB.");
      event.target.value = "";
      setSampleFile(null);
      return;
    }
    setSampleFile(file);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) {
      toast.error("Please enter a voice clone name.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        displayName: displayName.trim(),
        language,
        sample: sampleFile,
      });
      toast.success("Voice clone created");
      setIsCreateOpen(false);
      resetForm();
    } catch {
      toast.error("Failed to create voice clone");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Voice clone deleted");
    } catch {
      toast.error("Failed to delete voice clone");
    }
  }

  function downloadSampleGuide() {
    const content = [
      "WarpTalk voice cloning sample guide",
      "",
      "Goal",
      "Provide one clean reference voice per speaker and language.",
      "",
      "Recommended file",
      "- Format: WAV preferred, MP3 or M4A accepted.",
      "- Length: 45 to 90 seconds per language.",
      "- Audio: one speaker only, no music, no background meeting noise.",
      "- Level: stable volume, no clipping, no heavy noise suppression artifacts.",
      "- Naming: speaker-name_language_sample.wav, e.g. alice-smith_vi-VN_sample.wav.",
      "",
      "Supported project languages",
      "- Vietnamese: vi-VN",
      "- English: en-US",
      "- Japanese: ja-JP",
      "",
      "Read-aloud script shape",
      "1. Start with a natural greeting.",
      "2. Read 4-6 short meeting-style sentences.",
      "3. Include one question and one decision statement.",
      "4. Avoid private data, customer names, passwords, or secrets.",
      "",
      "Example English script",
      "Hello, this is my WarpTalk reference voice. Today we are reviewing the project plan, assigning action items, and confirming the next meeting date. Could you repeat the last point more slowly? The final decision is to prepare a short summary after every translation room.",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "warptalk-voice-cloning-sample-guide.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-full bg-canvas text-ink">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-5 py-4 lg:px-8">
        <section className="grid gap-3 border-b border-border pb-4 md:grid-cols-4">
          <Metric icon={Microphone} label="Voice clones" value={String(profileList.length)} />
          <Metric icon={CheckCircle} label="Active" value={String(activeCount)} />
          <Metric icon={FileAudio} label="Samples ready" value={`${sampleReadyCount}/${profileList.length}`} />
          <Metric icon={Translate} label="Languages" value={`${userLanguageCoverage}/3`} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-3 lg:flex-row lg:items-center">
              <ExpandingSearchDock
                value={query}
                onValueChange={setQuery}
                placeholder="Search clone, owner, language, or status"
                ariaLabel="Search voice clones"
                className="lg:mr-auto"
              />

              <FilterDock activeCount={activeFilterCount} label="Voice clone filters">
                <FilterDockSection title="Voice filters">
                  <FilterDockRow label="Language" icon={<Translate size={15} />}>
                    <Select value={languageFilter} onValueChange={(value) => setLanguageFilter(value as LanguageFilter)}>
                      <SelectTrigger aria-label="Language" className={filterDockSelectTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={filterDockSelectContentClass}>
                        <SelectItem value="all" className={filterDockSelectItemClass}>All languages</SelectItem>
                        {LANGUAGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className={filterDockSelectItemClass}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterDockRow>

                  <FilterDockRow label="Active status" icon={<CheckCircle size={15} />}>
                    <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as ActiveFilter)}>
                      <SelectTrigger aria-label="Active status" className={filterDockSelectTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={filterDockSelectContentClass}>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className={filterDockSelectItemClass}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterDockRow>

                  <FilterDockRow label="Clone status" icon={<Waveform size={15} />}>
                    <Select value={processingFilter} onValueChange={(value) => setProcessingFilter(value as ProcessingFilter)}>
                      <SelectTrigger aria-label="Clone status" className={filterDockSelectTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={filterDockSelectContentClass}>
                        {PROCESSING_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className={filterDockSelectItemClass}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterDockRow>

                  <FilterDockRow label="Sample file" icon={<FileAudio size={15} />}>
                    <Select value={sampleFilter} onValueChange={(value) => setSampleFilter(value as SampleFilter)}>
                      <SelectTrigger aria-label="Sample file" className={filterDockSelectTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={filterDockSelectContentClass}>
                        {SAMPLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className={filterDockSelectItemClass}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterDockRow>
                </FilterDockSection>

                <button
                  type="button"
                  onClick={() => {
                    setLanguageFilter("all");
                    setActiveFilter("all");
                    setProcessingFilter("all");
                    setSampleFilter("all");
                  }}
                  className="mt-2 h-8 w-full rounded-lg border border-neutral-800 text-[12px] font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-50"
                >
                  Reset filters
                </button>
              </FilterDock>

              <Button className="h-9 shrink-0 rounded-md bg-ink px-3 text-[12px] text-surface-1 hover:bg-ink/90" onClick={() => setIsCreateOpen(true)}>
                <Plus size={14} weight="bold" />
                Add clone
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
              <div className="flex h-10 items-center justify-between border-b border-border px-4">
                <div className="flex items-center gap-2 text-[11px] font-medium text-ink-muted">
                  <Funnel size={13} />
                  Workspace voice cloning registry
                </div>
                <span className="text-[10px] tabular-nums text-ink-subtle">{filteredProfiles.length} shown</span>
              </div>

              {isLoading ? (
                <div className="px-4 py-8 text-center text-[13px] text-ink-muted">Loading voice clones...</div>
              ) : filteredProfiles.length === 0 ? (
                <EmptyState onCreate={() => setIsCreateOpen(true)} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-surface-2/55 hover:bg-surface-2/55">
                      <TableHead className="h-9 px-4 text-[10px] uppercase tracking-normal text-ink-subtle">Voice clone</TableHead>
                      <TableHead className="h-9 text-[10px] uppercase tracking-normal text-ink-subtle">Owner</TableHead>
                      <TableHead className="h-9 text-[10px] uppercase tracking-normal text-ink-subtle">Language</TableHead>
                      <TableHead className="h-9 text-[10px] uppercase tracking-normal text-ink-subtle">Active</TableHead>
                      <TableHead className="h-9 text-[10px] uppercase tracking-normal text-ink-subtle">Clone status</TableHead>
                      <TableHead className="h-9 text-[10px] uppercase tracking-normal text-ink-subtle">Sample</TableHead>
                      <TableHead className="h-9 pr-4 text-right text-[10px] uppercase tracking-normal text-ink-subtle">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.map((profile, index) => (
                      <VoiceCloneRow
                        key={profile.id}
                        profile={profile}
                        index={index}
                        currentUser={currentUser}
                        disabled={deleteMutation.isPending}
                        onDelete={handleDelete}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <aside className="space-y-3">
            <section className="rounded-lg border border-border bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[13px] font-semibold text-ink">Sample requirements</h2>
                  <p className="mt-1 text-[11px] leading-5 text-ink-muted">Use one clean speaker sample per language.</p>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-canvas text-ink-muted">
                  <FileAudio size={16} />
                </span>
              </div>

              <div className="mt-4 divide-y divide-border border-y border-border">
                <RequirementRow label="Length" value="45-90s" />
                <RequirementRow label="Format" value="WAV, MP3, M4A" />
                <RequirementRow label="Noise" value="No music or room echo" />
                <RequirementRow label="Privacy" value="No secrets or customer data" />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={downloadSampleGuide}
                className="mt-4 h-9 w-full rounded-md text-[12px] shadow-none"
              >
                <DownloadSimple size={14} />
                Download sample guide
              </Button>
            </section>

            <section className="rounded-lg border border-border bg-surface-1 p-4">
              <h2 className="text-[13px] font-semibold text-ink">Language coverage</h2>
              <p className="mt-1 text-[11px] leading-5 text-ink-muted">A workspace member may own multiple voice clones, one for each supported meeting language.</p>
              <div className="mt-4 space-y-2">
                {LANGUAGE_OPTIONS.map((option) => {
                  const count = profileList.filter((profile) => profile.language === option.value).length;
                  return (
                    <div key={option.value} className="flex items-center justify-between rounded-md border border-border bg-canvas px-3 py-2">
                      <span className="flex items-center gap-2 text-[12px] font-medium">
                        <span className="grid size-6 place-items-center rounded border border-border bg-surface-1 text-[10px] text-ink-muted">{option.shortLabel}</span>
                        {option.label}
                      </span>
                      <span className="text-[11px] tabular-nums text-ink-muted">{count}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface-1 p-4">
              <h2 className="text-[13px] font-semibold text-ink">Access scope</h2>
              <p className="mt-1 text-[11px] leading-5 text-ink-muted">
                This registry is designed for workspace owners and admins to audit provided voice cloning samples before they are used in translation rooms.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-md bg-canvas px-2 py-1 text-[10px] text-ink-muted">Owner</Badge>
                <Badge variant="outline" className="rounded-md bg-canvas px-2 py-1 text-[10px] text-ink-muted">Admin</Badge>
                <Badge variant="outline" className="rounded-md bg-canvas px-2 py-1 text-[10px] text-ink-muted">Consent required</Badge>
              </div>
            </section>
          </aside>
        </section>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Create voice clone</DialogTitle>
            <DialogDescription>
              Add one voice clone for a workspace member and one supported language.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Voice clone name</Label>
              <Input
                id="displayName"
                placeholder="e.g. Alice Smith - Vietnamese"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={(value) => setLanguage(value || "vi-VN")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sample">Voice sample</Label>
              <Input
                id="sample"
                type="file"
                accept="audio/*"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <p className="text-[11px] leading-5 text-ink-muted">WAV preferred. MP3, M4A, or OGG accepted. Maximum 20 MB.</p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="submit" disabled={createMutation.isPending} className="min-w-[96px] text-white">
                {createMutation.isPending ? "Creating..." : "Create clone"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-canvas text-ink-muted">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-ink-muted">{label}</p>
        <p className="text-[18px] font-semibold leading-6 text-ink">{value}</p>
      </div>
    </div>
  );
}

function VoiceCloneRow({
  profile,
  index,
  currentUser,
  disabled,
  onDelete,
}: {
  profile: ManagedVoiceProfile;
  index: number;
  currentUser: { fullName?: string; email?: string } | null;
  disabled: boolean;
  onDelete: (id: string) => void;
}) {
  const owner = getOwner(profile, currentUser);
  const language = getLanguage(profile.language);
  const normalizedStatus = normalizeStatus(profile.status);

  return (
    <TableRow className="hover:bg-surface-2/45">
      <TableCell className="px-4 py-3">
        <div className="flex min-w-[220px] items-center gap-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border", profile.isActive ? "border-ink bg-ink text-surface-1" : "border-border bg-canvas text-ink-muted")}>
            <Waveform size={15} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{profile.displayName || `Voice clone ${index + 1}`}</p>
            <p className="mt-0.5 text-[10px] text-ink-subtle">Updated {formatDate(profile.updatedAt)}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="py-3">
        <div className="min-w-[170px]">
          <p className="truncate text-[12px] font-medium text-ink">{owner.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-ink-subtle">{owner.email}</p>
        </div>
      </TableCell>
      <TableCell className="py-3">
        <Badge variant="outline" className="rounded-md bg-canvas px-2 py-1 text-[11px] text-ink-muted">
          {language.shortLabel} - {language.label}
        </Badge>
      </TableCell>
      <TableCell className="py-3">
        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", profile.isActive ? "text-emerald-700" : "text-ink-muted")}>
          <span className={cn("size-1.5 rounded-full", profile.isActive ? "bg-emerald-500" : "bg-ink-subtle")} />
          {profile.isActive ? "Active" : "Inactive"}
        </span>
      </TableCell>
      <TableCell className="py-3">
        <StatusBadge status={normalizedStatus} rawStatus={profile.status} />
      </TableCell>
      <TableCell className="py-3">
        {profile.hasSample ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink">
            <FileAudio size={13} />
            Provided
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-700">
            <WarningCircle size={13} />
            Needed
          </span>
        )}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-ink-muted hover:text-destructive"
          disabled={disabled}
          onClick={() => onDelete(profile.id)}
          aria-label={`Delete ${profile.displayName || "voice clone"}`}
        >
          <Trash weight="light" className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status, rawStatus }: { status: string; rawStatus: string }) {
  const styles: Record<string, string> = {
    ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
    processing: "border-amber-200 bg-amber-50 text-amber-700",
    draft: "border-border bg-canvas text-ink-muted",
    failed: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <Badge variant="outline" className={cn("rounded-md px-2 py-1 text-[11px] capitalize", styles[status] ?? styles.draft)}>
      {rawStatus || status}
    </Badge>
  );
}

function RequirementRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 text-[11px]">
      <span className="text-ink-muted">{label}</span>
      <span className="max-w-[190px] text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid min-h-[360px] place-items-center px-5 py-8 text-center">
      <div className="max-w-[420px]">
        <span className="mx-auto grid size-11 place-items-center rounded-md border border-border bg-canvas text-ink-muted">
          <Microphone size={18} />
        </span>
        <p className="mt-4 text-[14px] font-semibold text-ink">No voice clones match these filters</p>
        <p className="mt-2 text-[12px] leading-5 text-ink-muted">Clear a filter or add a new voice clone for Vietnamese, English, or Japanese meeting rooms.</p>
        <Button className="mt-4 h-9 rounded-md bg-ink px-3 text-[12px] text-surface-1 hover:bg-ink/90" onClick={onCreate}>
          <Plus size={14} weight="bold" />
          Add clone
        </Button>
      </div>
    </div>
  );
}

function getOwner(profile: ManagedVoiceProfile, currentUser: { fullName?: string; email?: string } | null) {
  return {
    name: profile.ownerName || profile.userName || currentUser?.fullName || "Workspace member",
    email: profile.ownerEmail || profile.userEmail || currentUser?.email || "Owner metadata pending",
  };
}

function getLanguage(language: string | null) {
  return LANGUAGE_OPTIONS.find((option) => option.value === language) ?? { value: language ?? "", label: language || "Not set", shortLabel: "--" };
}

function normalizeStatus(status: string | null | undefined) {
  const normalized = (status || "draft").toLowerCase();
  if (["ready", "completed", "trained", "active"].includes(normalized)) return "ready";
  if (["processing", "training", "queued"].includes(normalized)) return "processing";
  if (["failed", "error", "rejected"].includes(normalized)) return "failed";
  return "draft";
}

function getUserLanguageCoverage(profiles: ManagedVoiceProfile[], currentUser: { fullName?: string; email?: string } | null) {
  const currentOwnerKey = currentUser?.email || currentUser?.fullName || "";
  const currentUserLanguages = new Set(
    profiles
      .filter((profile) => {
        const owner = getOwner(profile, currentUser);
        return !currentOwnerKey || owner.email === currentOwnerKey || owner.name === currentOwnerKey;
      })
      .map((profile) => profile.language)
      .filter((language): language is string => Boolean(language))
  );

  return LANGUAGE_OPTIONS.filter((option) => currentUserLanguages.has(option.value)).length;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "unknown"
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
