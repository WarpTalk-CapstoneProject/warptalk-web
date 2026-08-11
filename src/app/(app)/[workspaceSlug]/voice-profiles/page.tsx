"use client";

import { languageLabelText } from "@/components/language/language-label";
import { languagesInScope } from "@/lib/language/languages";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  CaretDown,
  CaretUp,
  Check,
  Checks,
  Funnel,
  Microphone,
  Plus,
  PaperPlaneTilt,
  PencilSimple,
  Trash,
  SlidersHorizontal,
  UploadSimple,
  Waveform,
  X,
} from "@phosphor-icons/react/dist/ssr";
import gsap from "gsap";
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
import {
  useCreateVoiceProfile,
  useDeleteVoiceProfile,
  useVoiceProfiles,
} from "@/hooks/use-voice-profiles";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { analyzeVoiceSample } from "@/lib/voice/voice-sample-quality";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { UserDto } from "@/types/auth";
import type { VoiceProfileDto } from "@/types/voice-profile";
import type { WorkspaceMemberDto } from "@/types/workspace";

// Values are the locale tags the backend stores and must not change; the label is what a
// person reads, and a raw tag in parentheses is not that.
// `short` is the two-letter badge shown in the dense table rows, where the full name would not
// fit. It is the bare ISO code the registry already carries, not a fourth thing to maintain.
const LANGUAGE_OPTIONS = languagesInScope("voiceProfile").map((language) => ({
  value: language.locale,
  label: languageLabelText(language.locale),
  short: language.code.toUpperCase(),
}));

const MAX_SAMPLE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_PROFILE_NAME_LENGTH = 100;
type VoiceProfileFilter = "active" | "ready" | "missing" | "all";
type VoiceProfileSortKey = "name" | "member" | "health" | "language" | "status";
type SortDirection = "asc" | "desc";

const VOICE_PROFILE_FILTERS: Array<{ value: VoiceProfileFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "ready", label: "Ready" },
  { value: "missing", label: "Missing" },
  { value: "all", label: "All" },
];

const VOICE_PROFILE_FILTER_WIDTH_CLASS: Record<VoiceProfileFilter, string> = {
  active: "w-[78px]",
  ready: "w-[78px]",
  missing: "w-[92px]",
  all: "w-[58px]",
};

const VOICE_PROFILE_SORT_COLUMNS: Array<{
  key: VoiceProfileSortKey;
  label: string;
  align?: "right";
}> = [
    { key: "name", label: "Name" },
    { key: "member", label: "Member" },
    { key: "health", label: "Health" },
    { key: "language", label: "Language" },
    { key: "status", label: "Status" },
  ];

const VOICE_PROFILE_GRID_CLASS =
  "grid-cols-[28px_minmax(320px,1.6fr)_220px_150px_130px_120px]";

type VoiceProfileOwnerOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export default function VoiceProfilesPage() {
  const { data: profiles, isLoading } = useVoiceProfiles();
  const createMutation = useCreateVoiceProfile();
  const deleteMutation = useDeleteVoiceProfile();
  const user = useAuthStore((state) => state.user);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceRole = useWorkspaceStore((state) => state.role);
  const workspaceLanguage = useWorkspaceStore((state) => state.defaultLanguage);
  const membersQuery = useWorkspaceMembers(activeWorkspaceId ?? undefined, 1, 100);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState("vi-VN");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleAssessment, setSampleAssessment] = useState<string | null>(null);
  const [isCheckingSample, setIsCheckingSample] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [hoveredProfileId, setHoveredProfileId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<VoiceProfileFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<VoiceProfileSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const selectionActionRef = useRef<HTMLDivElement | null>(null);

  const profileList = useMemo(() => profiles ?? [], [profiles]);
  const currentUserName = user?.fullName || user?.email || "Current user";
  const currentUserEmail = user?.email ?? "Signed-in user";
  const roleLabel = workspaceRole ? toTitleCase(workspaceRole) : "Participant";
  const canAssignVoiceOwner = isVoiceProfileManager(workspaceRole);
  const voiceOwnerOptions = useMemo(
    () => buildVoiceOwnerOptions(membersQuery.data?.items ?? [], user, roleLabel),
    [membersQuery.data?.items, roleLabel, user]
  );
  const selectedOwner = useMemo(
    () => voiceOwnerOptions.find((owner) => owner.id === selectedOwnerId) ?? voiceOwnerOptions[0],
    [selectedOwnerId, voiceOwnerOptions]
  );
  const filteredProfileList = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = profileList.filter((profile) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "active" && profile.isActive) ||
        (activeFilter === "ready" && profile.hasSample) ||
        (activeFilter === "missing" && !profile.hasSample);
      const matchesSearch =
        !normalizedQuery ||
        currentUserName.toLowerCase().includes(normalizedQuery) ||
        currentUserEmail.toLowerCase().includes(normalizedQuery) ||
        profile.displayName?.toLowerCase().includes(normalizedQuery) ||
        profile.language?.toLowerCase().includes(normalizedQuery) ||
        profile.status.toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesSearch;
    });

    return [...filtered].sort((first, second) => {
      const result = compareVoiceProfiles(first, second, sortKey, currentUserName);
      return sortDirection === "asc" ? result : -result;
    });
  }, [activeFilter, currentUserEmail, currentUserName, profileList, searchQuery, sortDirection, sortKey]);
  const selectedProfiles = useMemo(
    () => profileList.filter((profile) => selectedProfileIds.includes(profile.id)),
    [profileList, selectedProfileIds]
  );
  const filteredProfileIds = useMemo(() => filteredProfileList.map((profile) => profile.id), [filteredProfileList]);
  const allVisibleProfilesSelected =
    filteredProfileIds.length > 0 && filteredProfileIds.every((id) => selectedProfileIds.includes(id));
  const hasSelectedProfiles = selectedProfiles.length > 0;

  useEffect(() => {
    if (!hasSelectedProfiles || !selectionActionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        selectionActionRef.current,
        {
          autoAlpha: 0,
          y: 14,
          scale: 0.96,
          filter: "blur(6px)",
          transformOrigin: "50% 100%",
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.34,
          ease: "power3.out",
        }
      );
    }, selectionActionRef);

    return () => ctx.revert();
  }, [hasSelectedProfiles]);

  useRegisterAssistantContext({
    pageType: "voice_profiles",
    entityId: selectedProfileIds.length > 0 ? selectedProfileIds.join(",") : "voice-profiles",
    workspaceId: activeWorkspaceId ?? undefined,
    snapshot: {
      selectedCount: String(selectedProfiles.length),
      selectedProfiles: formatSelectedVoiceProfileNames(selectedProfiles, currentUserName),
      readyCount: String(selectedProfiles.filter((profile) => profile.hasSample).length),
    },
  });

  function toggleProfileSelection(profileId: string) {
    setSelectedProfileIds((current) =>
      current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId]
    );
  }

  function toggleSelectAllVisibleProfiles() {
    setSelectedProfileIds((current) => {
      if (allVisibleProfilesSelected) {
        return current.filter((id) => !filteredProfileIds.includes(id));
      }

      return Array.from(new Set([...current, ...filteredProfileIds]));
    });
  }

  function handleAskAiAboutSelection() {
    if (selectedProfiles.length === 0) return;

    const prompt =
      selectedProfiles.length === 1
        ? `Review this voice clone profile: ${getVoiceProfileDisplayName(selectedProfiles[0], currentUserName)}.`
        : `Review these ${selectedProfiles.length} selected voice clone profiles and suggest what needs attention.`;

    window.dispatchEvent(new CustomEvent("warptalk:open-assistant", { detail: { prompt } }));
    toast.success("Selected voice profiles attached to WarpBot.");
  }

  async function handleDeleteSelectedProfiles() {
    if (selectedProfiles.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedProfiles.length} selected voice profile${selectedProfiles.length === 1 ? "" : "s"}?`
    );
    if (!confirmed) return;

    try {
      for (const profile of selectedProfiles) {
        await deleteMutation.mutateAsync(profile.id);
      }
      setSelectedProfileIds([]);
      toast.success("Selected voice profiles deleted.");
    } catch {
      toast.error("Failed to delete selected voice profiles.");
    }
  }

  function handleSort(nextSortKey: VoiceProfileSortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

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
    setSelectedOwnerId(user?.id ?? "");
    setDisplayName("");
    setLanguage(normalizeLanguage(workspaceLanguage) ?? "vi-VN");
    setSampleFile(null);
    setSampleAssessment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreateDialog(profile?: VoiceProfileDto) {
    setSelectedOwnerId(user?.id ?? voiceOwnerOptions[0]?.id ?? "");
    setDisplayName(profile?.displayName ?? "");
    setLanguage(normalizeLanguage(profile?.language) ?? normalizeLanguage(workspaceLanguage) ?? "vi-VN");
    setSampleFile(null);
    setSampleAssessment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsCreateOpen(true);
  }

  useEffect(() => {
    return () => {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
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

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const accepted = await checkAndSetSample(file);
    if (!accepted) event.target.value = "";
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
      const preferredType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
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
      setSampleAssessment("Recording... read the sample paragraph in a quiet room.");
    } catch {
      toast.error("Microphone access was denied or unavailable.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
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
    } catch {
      toast.error("Failed to create voice profile");
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="flex shrink-0 flex-col gap-2 px-2 pb-1.5 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            {VOICE_PROFILE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                className={`flex h-[26px] ${VOICE_PROFILE_FILTER_WIDTH_CLASS[filter.value]} shrink-0 items-center justify-center rounded-full border px-3 text-[12px] font-medium transition-colors select-none ${activeFilter === filter.value
                  ? "border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
                  : "border-[#e2e3e7] bg-transparent text-[#6b7280] hover:border-[#d6d7dc] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:border-[#25272b] dark:text-[#9fa0a5] dark:hover:border-[#303236] dark:hover:bg-[#232524] dark:hover:text-white"
                  }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
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
              type="button"
              className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              title="Voice profile filters"
            >
              <Funnel weight="bold" size={13} />
              {activeFilter !== "all" && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
              )}
            </button>
            <button
              type="button"
              className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
              title={`${filteredProfileList.length} profiles`}
            >
              <SlidersHorizontal weight="bold" size={13} />
            </button>
            <div className="mx-1 h-4 w-[1px] bg-border" />
            <button
              type="button"
              onClick={() => openCreateDialog()}
              className="flex h-[28px] items-center gap-1.5 rounded-full bg-foreground pl-2.5 pr-3 text-[13px] font-medium text-background shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus weight="bold" size={12} />
              New Profile
            </button>
          </div>
        </section>

        <section className="mt-0.2 min-h-full overflow-x-auto px-2">
          <div className="min-w-[1040px]">
            <div className={`grid ${VOICE_PROFILE_GRID_CLASS} px-2 py-0.5 text-[11px] font-medium text-ink-muted`}>
              <div />
              {VOICE_PROFILE_SORT_COLUMNS.map((column) => (
                <SortableColumnHeader
                  key={column.key}
                  label={column.label}
                  active={sortKey === column.key}
                  direction={sortDirection}
                  align={column.align}
                  onClick={() => handleSort(column.key)}
                />
              ))}
            </div>

            {isLoading ? (
              <VoiceProfileNotice icon={<Waveform size={18} weight="bold" />} title="Loading voice profiles..." />
            ) : profileList.length === 0 ? (
              <VoiceProfileEmptyRow
                userName={currentUserName}
                title="No voice profiles yet"
                description="Upload a short reference sample to create a voice clone profile."
              />
            ) : filteredProfileList.length === 0 ? (
              <VoiceProfileEmptyRow
                userName={currentUserName}
                title="No matching voice profiles"
                description="Try another filter or search term."
              />
            ) : (
              <div className="space-y-0">
                {filteredProfileList.map((profile, index) => {
                  const selected = selectedProfileIds.includes(profile.id);
                  const previousProfile = index > 0 ? filteredProfileList[index - 1] : null;
                  const nextProfile = index < filteredProfileList.length - 1 ? filteredProfileList[index + 1] : null;
                  const previousHighlighted =
                    Boolean(previousProfile) &&
                    (selectedProfileIds.includes(previousProfile!.id) || hoveredProfileId === previousProfile!.id);
                  const nextHighlighted =
                    Boolean(nextProfile) &&
                    (selectedProfileIds.includes(nextProfile!.id) || hoveredProfileId === nextProfile!.id);

                  return (
                    <VoiceProfileRow
                      key={profile.id}
                      profile={profile}
                      userName={currentUserName}
                      userEmail={currentUserEmail}
                      roleLabel={roleLabel}
                      selected={selected}
                      hovered={hoveredProfileId === profile.id}
                      previousHighlighted={previousHighlighted}
                      nextHighlighted={nextHighlighted}
                      onToggleSelected={() => toggleProfileSelection(profile.id)}
                      onHoverChange={(hovered) => setHoveredProfileId(hovered ? profile.id : null)}
                      onEditProfile={() => openCreateDialog(profile)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {hasSelectedProfiles ? (
          <div className="pointer-events-none sticky bottom-5 z-10 flex justify-center">
            <div
              ref={selectionActionRef}
              className="pointer-events-auto flex h-10 w-[344px] items-center justify-center gap-1.5 rounded-full border border-border/60 bg-surface-2/95 px-2.5 text-[11px] font-medium text-ink shadow-xl shadow-black/10 backdrop-blur will-change-transform"
            >
              <span className="w-[74px] shrink-0 text-center">{selectedProfiles.length} selected</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-[96px] shrink-0 rounded-full px-2 text-[11px]"
                onClick={toggleSelectAllVisibleProfiles}
              >
                <Checks size={12} />
                {allVisibleProfilesSelected ? "Unselect all" : "Select all"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  if (selectedProfiles.length === 1) openCreateDialog(selectedProfiles[0]);
                }}
                disabled={selectedProfiles.length !== 1}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink ${selectedProfiles.length === 1 ? "" : "invisible pointer-events-none"
                  }`}
                aria-label="Edit selected voice profile"
                title="Edit profile"
              >
                <PencilSimple size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={handleAskAiAboutSelection}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                aria-label="Ask AI about selected voice profiles"
                title="Ask AI"
              >
                <PaperPlaneTilt size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedProfiles}
                disabled={deleteMutation.isPending}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                aria-label="Delete selected voice profiles"
                title="Delete"
              >
                <Trash size={12} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedProfileIds([])}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                aria-label="Clear selected voice profiles"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[calc(100vh-48px)] w-[calc(100vw-32px)] overflow-y-auto p-5 sm:max-w-[620px]">
          <DialogHeader className="gap-1 pr-8">
            <DialogTitle>Upload voice sample</DialogTitle>
            <DialogDescription>
              Create or replace a voice profile with one clear speaker sample.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid min-w-0 gap-3 pt-1">
            <div className="grid min-w-0 gap-1.5">
              <Label>Assigned member</Label>
              {canAssignVoiceOwner ? (
                <Select
                  value={selectedOwner?.id ?? ""}
                  onValueChange={(value) => setSelectedOwnerId(value ?? "")}
                >
                  <SelectTrigger className="h-10 w-full">
                    <span className="min-w-0 truncate text-left">
                      {selectedOwner?.name ?? "Select member..."}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {voiceOwnerOptions.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                            {getInitials(owner.name)}
                          </span>
                          <span className="min-w-0 truncate">
                            {owner.name} - {owner.role}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {getInitials(selectedOwner?.name ?? currentUserName)}
                  </span>
                  <span className="min-w-0 truncate">{selectedOwner?.name ?? currentUserName}</span>
                </div>
              )}
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="displayName">Profile name</Label>
                <div className="relative min-w-0">
                  <Input
                    id="displayName"
                    className="min-w-0 pr-16"
                    placeholder={`Enter profile name (max ${MAX_PROFILE_NAME_LENGTH} characters)`}
                    value={displayName}
                    maxLength={MAX_PROFILE_NAME_LENGTH}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoFocus
                  />
                  <span
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] ${displayName.length >= MAX_PROFILE_NAME_LENGTH
                      ? "text-amber-500"
                      : "text-ink-muted"
                      }`}
                  >
                    {displayName.length}/{MAX_PROFILE_NAME_LENGTH}
                  </span>
                </div>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label>Language</Label>
                <Select value={language} onValueChange={(value) => setLanguage(value || "vi-VN")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select language..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} ({option.short})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="sample">Reference voice sample</Label>
              <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-canvas p-3">
                <p className="text-xs leading-5 text-ink-muted">
                  Read: &quot;WarpTalk helps my team understand every conversation clearly.&quot; Use one speaker in a quiet room.
                </p>
                <input
                  id="sample"
                  type="file"
                  accept="audio/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCheckingSample || isRecording}
                  >
                    <UploadSimple size={14} />
                    Choose file
                  </Button>
                  <Button
                    type="button"
                    aria-label="Record sample"
                    variant={isRecording ? "destructive" : "outline"}
                    size="sm"
                    className="w-fit"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isCheckingSample}
                  >
                    <Microphone size={14} />
                    {isRecording ? "Stop" : "Record"}
                  </Button>
                  <span className="min-w-0 truncate text-xs text-ink-muted">
                    {sampleFile ? sampleFile.name : "No file selected"}
                  </span>
                </div>
                <div className="grid min-w-0 gap-1 text-xs leading-5 text-ink-muted sm:grid-cols-[1fr_1fr]">
                  <p>WAV, MP3, M4A, OGG or WebM, 5-120 seconds, up to 20 MB.</p>
                  {sampleAssessment ? <p className="min-w-0 truncate sm:text-right">{sampleAssessment}</p> : null}
                </div>
              </div>
            </div>
            <DialogFooter className="!mx-[-20px] !mb-[-20px] border-t border-border !p-3">
              <Button
                type="submit"
                disabled={createMutation.isPending || isCheckingSample || isRecording}
                className="min-w-[96px] text-white"
              >
                {createMutation.isPending ? "Uploading..." : "Save sample"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoiceProfileRow({
  profile,
  userName,
  userEmail,
  roleLabel,
  selected,
  hovered,
  previousHighlighted,
  nextHighlighted,
  onToggleSelected,
  onHoverChange,
  onEditProfile,
}: {
  profile: VoiceProfileDto;
  userName: string;
  userEmail: string;
  roleLabel: string;
  selected: boolean;
  hovered: boolean;
  previousHighlighted: boolean;
  nextHighlighted: boolean;
  onToggleSelected: () => void;
  onHoverChange: (hovered: boolean) => void;
  onEditProfile: () => void;
}) {
  const language = getLanguageMeta(profile.language);
  const healthLabel = profile.hasSample ? "Ready" : "Needs sample";
  const providerLabel = getProviderLabel(profile);
  const profileName = getVoiceProfileDisplayName(profile, userName);
  const highlighted = selected || hovered;
  const rowBlockShape = getConnectedRowBlockShape(highlighted, previousHighlighted, nextHighlighted);
  const rowStateClass = selected
    ? hovered
      ? `${rowBlockShape} bg-primary/25 text-ink shadow-[inset_3px_0_0_hsl(var(--primary)/0.65)]`
      : `${rowBlockShape} bg-primary/15 text-ink hover:!bg-primary/25 hover:!shadow-[inset_3px_0_0_hsl(var(--primary)/0.65)]`
    : hovered
      ? `${rowBlockShape} bg-surface-2 text-ink shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)]`
      : "rounded-[7px] hover:!bg-surface-2 hover:!shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)]";

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      onClick={onToggleSelected}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleSelected();
        }
      }}
      className={`group relative grid min-h-[36px] ${VOICE_PROFILE_GRID_CLASS} cursor-pointer items-center px-2 py-1 text-[11px] transition-none ${rowStateClass}`}
    >
      <div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelected();
          }}
          tabIndex={selected || hovered ? 0 : -1}
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition-none ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"} ${selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-surface-1/70 hover:border-primary/70"
            }`}
          aria-label={`${selected ? "Unselect" : "Select"} ${profileName}`}
        >
          {selected ? <Check size={10} weight="bold" /> : null}
        </button>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEditProfile();
        }}
        className="flex min-w-0 items-center gap-2 rounded-[6px] text-left transition-colors hover:bg-surface-3/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        aria-label={`Edit ${profileName}`}
        title={`Edit ${profileName}`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
          {getInitials(profileName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{profileName}</p>
          <p className="truncate text-[10px] text-ink-muted">{providerLabel}</p>
        </div>
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-[8px] font-semibold text-primary">
          {getInitials(userName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{userName}</p>
          <p className="truncate text-[10px] text-ink-muted">
            {userEmail} - {roleLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-ink-muted">
        <span
          className={`h-3 w-3 rounded-full border border-dashed ${profile.hasSample ? "border-emerald-500/60 bg-emerald-500/10" : "border-amber-500/70 bg-transparent"
            }`}
        />
        <span className={profile.hasSample ? "text-emerald-600" : "text-ink-muted"}>{healthLabel}</span>
      </div>
      <div>
        <Badge variant="outline" className="rounded-full bg-surface-1/70 px-1.5 py-0 text-[9px]">
          {language.short}
        </Badge>
      </div>
      <div>
        <Badge
          variant="outline"
          className={`rounded-full px-1.5 py-0 text-[9px] capitalize ${profile.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-surface-1/70 text-ink-muted"
            }`}
        >
          {profile.isActive ? "Active" : profile.status}
        </Badge>
      </div>
    </div>
  );
}

function SortableColumnHeader({
  label,
  active,
  direction,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  align?: "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full py-1 text-left transition-colors ${align === "right" ? "justify-self-end pr-2 text-right" : ""
        } ${active
          ? align === "right"
            ? "bg-surface-2 px-2 text-foreground font-semibold"
            : "-ml-2 bg-surface-2 px-2 text-foreground font-semibold"
          : "px-0 text-ink-muted hover:text-ink"
        }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? direction === "asc" ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" /> : null}
      </span>
    </button>
  );
}

function VoiceProfileEmptyRow({
  userName,
  title,
  description,
}: {
  userName: string;
  title: string;
  description: string;
}) {
  return (
    <div className={`grid min-h-[36px] ${VOICE_PROFILE_GRID_CLASS} items-center rounded-[7px] px-2 py-1 text-[11px] transition-colors hover:bg-surface-2`}>
      <div />
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
          {getInitials(userName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{title}</p>
          <p className="truncate text-[10px] text-ink-muted">{description}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-[8px] font-semibold text-primary">
          {getInitials(userName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{userName}</p>
          <p className="truncate text-[10px] text-ink-muted">Signed-in user</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-ink-muted">
        <span className="h-3 w-3 rounded-full border border-dashed border-amber-500/70" />
        <span>Needs sample</span>
      </div>
      <div className="flex items-center gap-1">
        {LANGUAGE_OPTIONS.map((option) => (
          <Badge key={option.value} variant="outline" className="rounded-full bg-surface-1/70 px-1.5 py-0 text-[9px]">
            {option.short}
          </Badge>
        ))}
      </div>
      <div>
        <Badge variant="outline" className="rounded-full bg-surface-1/70 px-1.5 py-0 text-[9px] text-ink-muted">
          Not created
        </Badge>
      </div>
    </div>
  );
}

function VoiceProfileNotice({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid gap-4 px-5 py-8 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-neutral-950 text-white">
          {icon}
        </span>
        <div>
          <p className="text-[15px] font-semibold text-ink">{title}</p>
          {description ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-muted">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "VP";
}

function getVoiceProfileDisplayName(profile: VoiceProfileDto, fallbackName: string) {
  return profile.displayName || fallbackName;
}

function formatSelectedVoiceProfileNames(profiles: VoiceProfileDto[], fallbackName: string) {
  if (profiles.length === 0) return "None";
  const names = profiles.slice(0, 5).map((profile) => getVoiceProfileDisplayName(profile, fallbackName));
  const suffix = profiles.length > names.length ? ` +${profiles.length - names.length} more` : "";
  return `${names.join(", ")}${suffix}`;
}

function compareVoiceProfiles(
  first: VoiceProfileDto,
  second: VoiceProfileDto,
  sortKey: VoiceProfileSortKey,
  userName: string
) {
  if (sortKey === "name") {
    return compareText(first.displayName || userName, second.displayName || userName);
  }
  if (sortKey === "health") {
    return Number(second.hasSample) - Number(first.hasSample);
  }
  if (sortKey === "member") {
    return compareText(userName, userName);
  }
  if (sortKey === "language") {
    return compareText(getLanguageMeta(first.language).short, getLanguageMeta(second.language).short);
  }
  return compareText(first.isActive ? "active" : first.status, second.isActive ? "active" : second.status);
}

function compareText(first: string, second: string) {
  return first.localeCompare(second, undefined, { sensitivity: "base" });
}

function getConnectedRowBlockShape(highlighted: boolean, previousHighlighted: boolean, nextHighlighted: boolean) {
  if (!highlighted) return "rounded-[7px]";
  if (previousHighlighted && nextHighlighted) return "rounded-none";
  if (previousHighlighted) return "rounded-b-[7px] rounded-t-none";
  if (nextHighlighted) return "rounded-b-none rounded-t-[7px]";
  return "rounded-[7px]";
}

function getLanguageMeta(language: string | null | undefined) {
  const normalized = normalizeLanguage(language);
  return LANGUAGE_OPTIONS.find((option) => option.value === normalized) ?? LANGUAGE_OPTIONS[0];
}

function normalizeLanguage(language: string | null | undefined) {
  if (!language) return null;
  const normalized = language.toLowerCase();
  if (normalized.startsWith("vi")) return "vi-VN";
  if (normalized.startsWith("en")) return "en-US";
  if (normalized.startsWith("ja")) return "ja-JP";
  return null;
}

function getProviderLabel(profile: VoiceProfileDto) {
  if (profile.provider) return toTitleCase(profile.provider);
  if (profile.providerVoiceId) return "Provider voice";
  if (profile.hasSample) return "Local sample";
  return "Not assigned";
}

function buildVoiceOwnerOptions(
  members: WorkspaceMemberDto[],
  user: UserDto | null,
  roleLabel: string
): VoiceProfileOwnerOption[] {
  const options = new Map<string, VoiceProfileOwnerOption>();

  if (user?.id) {
    options.set(user.id, {
      id: user.id,
      name: user.fullName || user.email,
      email: user.email,
      role: roleLabel,
    });
  }

  for (const member of members) {
    options.set(member.userId, {
      id: member.userId,
      name: member.fullName || member.email,
      email: member.email,
      role: member.roleName || "Member",
    });
  }

  return Array.from(options.values()).sort((first, second) => {
    if (first.id === user?.id) return -1;
    if (second.id === user?.id) return 1;
    return compareText(first.name, second.name);
  });
}

function isVoiceProfileManager(role: string | null) {
  const normalized = role?.toLowerCase();
  return normalized === "owner" || normalized === "admin" || normalized === "manager";
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
