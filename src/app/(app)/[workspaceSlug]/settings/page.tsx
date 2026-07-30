"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Lock,
  Spinner,
  Copy,
  Plus,
  Trash,
  Globe,
  Checks,
} from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import type { WorkspaceSettingsDto } from "@/types/workspace";
import {
  useWorkspace,
  useWorkspaceSettings,
  usePatchWorkspaceSettings,
  useVerifiedDomains,
  useAddVerifiedDomain,
  useRevokeVerifiedDomain,
} from "@/hooks/use-workspace";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAutoSaveQueue } from "@/hooks/use-auto-save";
import { AutoSaveStatusBadge } from "@/components/features/settings/auto-save-status-badge";
import { parseIntegerInRange } from "@/lib/settings-validation";

const settingsSchema = z.object({
  defaultLanguage: z.string().min(1, "Please select default language"),
  timezone: z.string().min(1, "Please select timezone"),
  maxActiveRooms: z.number().int("Must be a whole number").min(1, "Must be at least 1 room").max(50, "Max 50 rooms"),
  artifactRetentionDays: z.number().int("Must be a whole number").min(0, "Retention must be 0 (indefinite) or positive").max(3650, "Max 3650 days"),
  enforceHostApprovalDefault: z.boolean(),
  voiceCloningEnabled: z.boolean(),
  isProfanityFilterEnabled: z.boolean(),
  allowedTargetLanguages: z.array(z.string()),
  verifiedDomains: z.array(z.string()),
  allowExternalCollaboration: z.boolean(),
  requireVerifiedDomainForInternal: z.boolean(),
  aiUsagePolicy: z.object({
    allowExternalLlm: z.boolean(),
    useGlobalGlossary: z.boolean(),
    redactPii: z.object({
      enabled: z.boolean(),
    }),
    dlp: z.object({
      enabled: z.boolean(),
      keywordsBlacklist: z.array(z.string()),
    }),
    translationProfile: z.object({
      translationTone: z.string(),
      languageSpecificRules: z.object({
        vietnameseHonorificStyle: z.string(),
        japaneseHonorificStyle: z.string(),
      }),
    }),
  }),
});

type SettingsFormData = z.infer<typeof settingsSchema>;
type ApiErrorLike = {
  response?: {
    status?: number;
  };
};

const languages = [
  { code: "en", label: "English" },
  { code: "vi", label: "Vietnamese" },
  { code: "ja", label: "Japanese" },
];

const DEFAULT_SETTINGS_FORM_DATA: SettingsFormData = {
  defaultLanguage: "en",
  timezone: "UTC",
  maxActiveRooms: 5,
  artifactRetentionDays: 30,
  enforceHostApprovalDefault: true,
  voiceCloningEnabled: true,
  isProfanityFilterEnabled: false,
  allowedTargetLanguages: ["en", "vi", "ja"],
  verifiedDomains: [],
  allowExternalCollaboration: true,
  requireVerifiedDomainForInternal: false,
  aiUsagePolicy: {
    allowExternalLlm: true,
    useGlobalGlossary: true,
    redactPii: {
      enabled: true,
    },
    dlp: {
      enabled: false,
      keywordsBlacklist: [],
    },
    translationProfile: {
      translationTone: "professional",
      languageSpecificRules: {
        vietnameseHonorificStyle: "formal_hierarchical",
        japaneseHonorificStyle: "keigo_teineigo",
      },
    },
  },
};

function toSettingsFormData(settings: WorkspaceSettingsDto): SettingsFormData {
  return {
    ...DEFAULT_SETTINGS_FORM_DATA,
    defaultLanguage: settings.defaultLanguage || DEFAULT_SETTINGS_FORM_DATA.defaultLanguage,
    timezone: settings.timezone || DEFAULT_SETTINGS_FORM_DATA.timezone,
    maxActiveRooms: settings.maxActiveRooms ?? DEFAULT_SETTINGS_FORM_DATA.maxActiveRooms,
    artifactRetentionDays: settings.artifactRetentionDays ?? DEFAULT_SETTINGS_FORM_DATA.artifactRetentionDays,
    enforceHostApprovalDefault: settings.enforceHostApprovalDefault ?? DEFAULT_SETTINGS_FORM_DATA.enforceHostApprovalDefault,
    voiceCloningEnabled: settings.voiceCloningEnabled ?? DEFAULT_SETTINGS_FORM_DATA.voiceCloningEnabled,
    isProfanityFilterEnabled: settings.isProfanityFilterEnabled ?? DEFAULT_SETTINGS_FORM_DATA.isProfanityFilterEnabled,
    allowedTargetLanguages: settings.allowedTargetLanguages || ["en", "vi", "ja"],
    verifiedDomains: settings.verifiedDomains || [],
    allowExternalCollaboration: settings.allowExternalCollaboration ?? DEFAULT_SETTINGS_FORM_DATA.allowExternalCollaboration,
    requireVerifiedDomainForInternal: settings.requireVerifiedDomainForInternal ?? DEFAULT_SETTINGS_FORM_DATA.requireVerifiedDomainForInternal,
    aiUsagePolicy: {
      allowExternalLlm: true,
      useGlobalGlossary: settings.aiUsagePolicy?.useGlobalGlossary ?? DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.useGlobalGlossary,
      redactPii: {
        enabled: settings.aiUsagePolicy?.redactPii?.enabled ?? DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.redactPii.enabled,
      },
      dlp: {
        enabled: settings.aiUsagePolicy?.dlp?.enabled ?? DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.dlp.enabled,
        keywordsBlacklist: settings.aiUsagePolicy?.dlp?.keywordsBlacklist || [],
      },
      translationProfile: {
        translationTone:
          settings.aiUsagePolicy?.translationProfile?.translationTone
          || DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile.translationTone,
        languageSpecificRules: {
          vietnameseHonorificStyle:
            settings.aiUsagePolicy?.translationProfile?.languageSpecificRules?.vietnameseHonorificStyle
            || DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile.languageSpecificRules.vietnameseHonorificStyle,
          japaneseHonorificStyle:
            settings.aiUsagePolicy?.translationProfile?.languageSpecificRules?.japaneseHonorificStyle
            || DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile.languageSpecificRules.japaneseHonorificStyle,
        },
      },
    },
  };
}

export default function WorkspaceSettingsPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);
  const { setActiveWorkspace, activeWorkspaceSlug, membershipType } = useWorkspaceStore();

  // Queries & Mutations
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const patchSettingsMutation = usePatchWorkspaceSettings(activeWorkspaceId || "");
  const verifiedDomainsQuery = useVerifiedDomains(activeWorkspaceId || "");
  const addDomainMutation = useAddVerifiedDomain(activeWorkspaceId || "");
  const revokeDomainMutation = useRevokeVerifiedDomain(activeWorkspaceId || "");

  const [newDomain, setNewDomain] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [domainError, setDomainError] = useState(false);
  const initializedWorkspaceRef = useRef<string | null>(null);
  const lastQueuedValuesRef = useRef<Record<string, string>>({});

  const {
    register,
    setValue,
    watch,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: DEFAULT_SETTINGS_FORM_DATA,
  });

  const watchAll = watch();

  const saveWorkspacePatch = useCallback(async (patch: Partial<WorkspaceSettingsDto>) => {
    const saved = await patchSettingsMutation.mutateAsync(patch);
    if (Object.prototype.hasOwnProperty.call(patch, "defaultLanguage")) {
      setActiveWorkspace(
        activeWorkspaceId || "",
        workspaceQuery.data?.name || "",
        activeWorkspaceSlug,
        (workspaceQuery.data?.role || role || "").toLowerCase(),
        membershipType,
        String(patch.defaultLanguage),
      );
    }
    return saved;
  }, [activeWorkspaceId, activeWorkspaceSlug, membershipType, patchSettingsMutation, role, setActiveWorkspace, workspaceQuery.data]);

  const autoSave = useAutoSaveQueue<Partial<WorkspaceSettingsDto>>({
    save: saveWorkspacePatch,
    onError: (error) => {
      const errorMsg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || "Failed to save workspace settings.";
      toast.error(errorMsg);
    },
  });

  useEffect(() => {
    if (settingsQuery.data && activeWorkspaceId && initializedWorkspaceRef.current !== activeWorkspaceId) {
      reset(toSettingsFormData(settingsQuery.data));
      initializedWorkspaceRef.current = activeWorkspaceId;
      lastQueuedValuesRef.current = {};
    }
  }, [activeWorkspaceId, reset, settingsQuery.data]);

  if (!activeWorkspaceId) return null;

  if (workspaceQuery.isPending || settingsQuery.isPending) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Spinner className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const rawRole = workspaceQuery.data?.role || role || "";
  const currentRole = rawRole.toLowerCase();
  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin";
  const isOwnerOrAdmin = isOwner || isAdmin;
  const workspaceError = workspaceQuery.error as ApiErrorLike | undefined;
  const settingsError = settingsQuery.error as ApiErrorLike | undefined;

  const isForbidden =
    workspaceError?.response?.status === 403 ||
    settingsError?.response?.status === 403 ||
    !isOwnerOrAdmin;

  if (isForbidden) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can view or modify workspace configurations.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const queuePatch = (key: string, patch: Partial<WorkspaceSettingsDto>, value: unknown) => {
    const serializedValue = JSON.stringify(value);
    if (lastQueuedValuesRef.current[key] === serializedValue) return;
    lastQueuedValuesRef.current[key] = serializedValue;
    autoSave.enqueue(patch);
  };

  const commitTopLevel = <K extends keyof SettingsFormData>(field: K, value: SettingsFormData[K]) => {
    setValue(field as never, value as never, { shouldDirty: true, shouldValidate: true });
    queuePatch(String(field), { [field]: value } as Partial<WorkspaceSettingsDto>, value);
  };

  const commitNumericField = (field: "maxActiveRooms" | "artifactRetentionDays", rawValue: string) => {
    const limits = field === "maxActiveRooms" ? [1, 50] : [0, 3650];
    const parsedInput = parseIntegerInRange(rawValue, limits[0], limits[1]);
    const value = parsedInput.value;
    setValue(field, value, { shouldDirty: true, shouldValidate: true });
    if (!parsedInput.ok) return;
    queuePatch(field, { [field]: value } as Partial<WorkspaceSettingsDto>, value);
  };

  const commitPolicy = (key: string, policy: SettingsFormData["aiUsagePolicy"]) => {
    setValue("aiUsagePolicy", policy, { shouldDirty: true, shouldValidate: true });
    queuePatch(key, { aiUsagePolicy: policy }, policy);
  };

  const allowedLangs = watchAll.allowedTargetLanguages || [];
  const handleLanguageToggle = (code: string) => {
    let next: string[];
    if (allowedLangs.includes(code)) {
      next = allowedLangs.filter((c) => c !== code);
    } else {
      next = [...allowedLangs, code];
    }
    commitTopLevel("allowedTargetLanguages", next);
  };

  const verifiedDomainList = verifiedDomainsQuery.data || [];
  const activeDomains = verifiedDomainList.map((vd) => vd.domain);

  const handleAddDomain = async () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes(".") || trimmed.startsWith(".") || trimmed.endsWith(".")) {
      toast.error("Invalid domain format.");
      return;
    }
    const publicDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];
    if (publicDomains.includes(trimmed)) {
      toast.error("Cannot verify public domain names.");
      return;
    }
    if (activeDomains.includes(trimmed)) {
      toast.error("Domain already added.");
      return;
    }
    setDomainError(false);
    try {
      await addDomainMutation.mutateAsync(trimmed);
      toast.success(`Domain "${trimmed}" verified & added successfully.`);
      setNewDomain("");
    } catch (err: unknown) {
      setDomainError(true);
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || "Failed to add verified domain.";
      toast.error(errorMsg);
    }
  };

  const handleRemoveDomain = async (domainString: string) => {
    const target = verifiedDomainList.find((vd) => vd.domain.toLowerCase() === domainString.toLowerCase());
    if (!target) return;

    setDomainError(false);
    try {
      await revokeDomainMutation.mutateAsync(target.id);
      toast.success(`Domain "${domainString}" revoked successfully.`);
    } catch (err: unknown) {
      setDomainError(true);
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || "Failed to revoke verified domain.";
      toast.error(errorMsg);
    }
  };

  const keywords = watchAll.aiUsagePolicy?.dlp?.keywordsBlacklist || [];
  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) {
      toast.error("Keyword already in blacklist.");
      return;
    }
    const policy = {
      ...watchAll.aiUsagePolicy,
      dlp: {
        ...watchAll.aiUsagePolicy.dlp,
        keywordsBlacklist: [...keywords, trimmed],
      },
    };
    commitPolicy("aiUsagePolicy.dlp.keywordsBlacklist", policy);
    setNewKeyword("");
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    const policy = {
      ...watchAll.aiUsagePolicy,
      dlp: {
        ...watchAll.aiUsagePolicy.dlp,
        keywordsBlacklist: keywords.filter((k) => k !== keywordToRemove),
      },
    };
    commitPolicy("aiUsagePolicy.dlp.keywordsBlacklist", policy);
  };

  const effectiveSaveStatus = domainError
    ? "error"
    : addDomainMutation.isPending || revokeDomainMutation.isPending
      ? "saving"
      : autoSave.status;

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8 text-ink">

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight text-ink">Settings</h1>
          <p className="text-xs text-ink-muted">Configure your workspace defaults, collaboration boundaries, and AI scanning policies.</p>
        </div>
        <AutoSaveStatusBadge
          status={effectiveSaveStatus}
          invalid={Object.keys(errors).length > 0}
          onRetry={Object.keys(errors).length === 0 && !domainError ? autoSave.retry : undefined}
        />
      </div>

      {/* Workspace Link & Slug Card */}
      <div className="flex flex-col gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Workspace Info</div>
        <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">

          {/* Slug Row */}
          <div className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-ink">Workspace Slug</span>
              <span className="text-[11px] text-ink-muted">The unique handle for identifying this workspace.</span>
            </div>
            <div className="relative flex items-center w-full sm:w-[240px]">
              <Input
                readOnly
                value={workspaceQuery.data?.slug || ""}
                className="h-8 text-xs bg-surface-2 border-hairline pr-8 select-all font-mono w-full"
              />
              <button
                type="button"
                onClick={() => {
                  if (workspaceQuery.data?.slug) {
                    navigator.clipboard.writeText(workspaceQuery.data.slug);
                    toast.success("Workspace slug copied!");
                  }
                }}
                className="absolute right-2.5 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title="Copy Slug"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* URL Row */}
          <div className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-ink">Workspace URL</span>
              <span className="text-[11px] text-ink-muted">The direct landing link for members to access this workspace.</span>
            </div>
            <div className="relative flex items-center w-full sm:w-[240px]">
              <Input
                readOnly
                value={workspaceQuery.data ? `${window.location.origin}/${workspaceQuery.data.slug}` : ""}
                className="h-8 text-xs bg-surface-2 border-hairline pr-8 select-all font-mono w-full"
              />
              <button
                type="button"
                onClick={() => {
                  if (workspaceQuery.data?.slug) {
                    const url = `${window.location.origin}/${workspaceQuery.data.slug}`;
                    navigator.clipboard.writeText(url);
                    toast.success("Workspace URL copied!");
                  }
                }}
                className="absolute right-2.5 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title="Copy URL"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>

        </div>
      </div>

      <div className="flex flex-col gap-8">

        {/* Section 1: General Workspace Defaults */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">General Workspace Defaults</div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">

            {/* Default Language */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Default Language</span>
                <span className="text-[11px] text-ink-muted">Default spoken language for new translation rooms.</span>
              </div>
              <Select
                value={watchAll.defaultLanguage}
                onValueChange={(val) => val && commitTopLevel("defaultLanguage", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code} className="text-xs">
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timezone */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Timezone</span>
                <span className="text-[11px] text-ink-muted">Timezone used for meeting schedules and audit timestamps.</span>
              </div>
              <Select
                value={watchAll.timezone}
                onValueChange={(val) => val && commitTopLevel("timezone", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC" className="text-xs">UTC</SelectItem>
                  <SelectItem value="Asia/Ho_Chi_Minh" className="text-xs">Asia/Ho_Chi_Minh (+7)</SelectItem>
                  <SelectItem value="Asia/Tokyo" className="text-xs">Asia/Tokyo (+9)</SelectItem>
                  <SelectItem value="America/New_York" className="text-xs">America/New_York (-5)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Max Active Rooms */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Max Active Rooms</span>
                <span className="text-[11px] text-ink-muted">Maximum concurrent translation rooms allowed for this workspace.</span>
              </div>
              <Input
                type="number"
                min={1}
                max={50}
                {...register("maxActiveRooms", { valueAsNumber: true })}
                onBlur={(event) => commitNumericField("maxActiveRooms", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitNumericField("maxActiveRooms", event.currentTarget.value);
                    event.currentTarget.blur();
                  }
                }}
                disabled={isSubmitting || !isOwnerOrAdmin}
                className="w-[140px] h-8 text-xs bg-surface-2 border-hairline"
              />
              {errors.maxActiveRooms?.message && (
                <span className="text-[11px] text-destructive">{errors.maxActiveRooms.message}</span>
              )}
            </div>

            {/* Artifact Retention Days */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Artifact Retention Days</span>
                <span className="text-[11px] text-ink-muted">Days to retain meeting transcripts and recordings (0 = indefinite).</span>
              </div>
              <Input
                type="number"
                min={0}
                max={3650}
                {...register("artifactRetentionDays", { valueAsNumber: true })}
                onBlur={(event) => commitNumericField("artifactRetentionDays", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitNumericField("artifactRetentionDays", event.currentTarget.value);
                    event.currentTarget.blur();
                  }
                }}
                disabled={isSubmitting || !isOwnerOrAdmin}
                className="w-[140px] h-8 text-xs bg-surface-2 border-hairline"
              />
              {errors.artifactRetentionDays?.message && (
                <span className="text-[11px] text-destructive">{errors.artifactRetentionDays.message}</span>
              )}
            </div>

            {/* Allowed Target Languages */}
            <div className="py-3.5 px-4 flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Allowed Target Translation Languages</span>
                <span className="text-[11px] text-ink-muted">Languages available for live translation in meeting rooms.</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {languages.map((l) => {
                  const selected = allowedLangs.includes(l.code);
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => handleLanguageToggle(l.code)}
                      disabled={isSubmitting || !isOwnerOrAdmin}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs cursor-pointer transition ${
                        selected
                          ? "bg-primary/10 border-primary text-primary font-semibold"
                          : "bg-surface-2 border-hairline text-ink-muted hover:text-ink"
                      }`}
                    >
                      {selected && <Checks size={12} className="text-primary" />}
                      {l.label} ({l.code.toUpperCase()})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Enforce Host Approval */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Enforce Host Approval</span>
                <span className="text-[11px] text-ink-muted">Require host admission for participants joining translation rooms.</span>
              </div>
              <Switch
                checked={watchAll.enforceHostApprovalDefault}
                onCheckedChange={(val) => commitTopLevel("enforceHostApprovalDefault", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/* Voice Cloning */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Voice Cloning Synthesis</span>
                <span className="text-[11px] text-ink-muted">Synthesize translated speech using neural voice cloning of original speakers.</span>
              </div>
              <Switch
                checked={watchAll.voiceCloningEnabled}
                onCheckedChange={(val) => commitTopLevel("voiceCloningEnabled", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/* Profanity Filter */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Profanity Filter</span>
                <span className="text-[11px] text-ink-muted">Censor inappropriate or profane language in transcripts.</span>
              </div>
              <Switch
                checked={watchAll.isProfanityFilterEnabled}
                onCheckedChange={(val) => commitTopLevel("isProfanityFilterEnabled", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

          </div>
        </div>

        {/* Section 2: Collaboration & Security */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Enterprise & External Collaboration</div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">

            {/* Allow External Collaboration */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <span className="text-xs font-semibold text-ink">Allow External Collaboration</span>
                <span className="text-[11px] text-ink-muted">Allow external participants to join rooms.</span>
              </div>
              <Switch
                checked={watchAll.allowExternalCollaboration}
                onCheckedChange={(val) => commitTopLevel("allowExternalCollaboration", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/* Require Verified Domain */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Require Verified Domain for Internal Members</span>
                <span className="text-[11px] text-ink-muted">Enforce internal members to use verified domains.</span>
              </div>
              <Switch
                checked={watchAll.requireVerifiedDomainForInternal}
                onCheckedChange={(val) => commitTopLevel("requireVerifiedDomainForInternal", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/* Verified Email Domains */}
            <div className="py-4 px-4 flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Verified Domains</span>
                <span className="text-[11px] text-ink-muted">Manage specific corporate email domains allowed in this workspace.</span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter a domain (e.g., company.com)"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  disabled={isSubmitting || !isOwnerOrAdmin || addDomainMutation.isPending}
                  className="h-8 text-xs bg-surface-2 border-hairline flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDomain();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddDomain}
                  disabled={isSubmitting || !isOwnerOrAdmin || addDomainMutation.isPending || !newDomain.trim()}
                  className="flex h-8 px-3 items-center justify-center gap-1 rounded bg-surface-3 hover:bg-surface-4 font-semibold transition text-xs border border-hairline cursor-pointer text-ink disabled:opacity-50"
                >
                  {addDomainMutation.isPending ? <Spinner className="h-3 w-3 animate-spin" /> : <Plus size={12} />} Add Domain
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {verifiedDomainsQuery.isPending ? (
                  <span className="text-[10px] text-ink-muted flex items-center gap-1"><Spinner className="h-3 w-3 animate-spin" /> Loading domains...</span>
                ) : activeDomains.length === 0 ? (
                  <span className="text-[10px] text-ink-muted italic">No verified domains. Add one above.</span>
                ) : (
                  activeDomains.map((d) => (
                    <div key={d} className="flex items-center gap-1.5 bg-surface-2 border border-hairline px-2 py-0.5 rounded text-xs">
                      <Globe size={11} className="text-primary" />
                      <span className="font-mono text-[10px] text-ink">{d}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDomain(d)}
                        disabled={isSubmitting || !isOwnerOrAdmin || revokeDomainMutation.isPending}
                        className="text-ink-muted hover:text-destructive transition-colors ml-1 cursor-pointer disabled:opacity-50"
                        title={`Revoke domain ${d}`}
                      >
                        <Trash size={11} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Section 3: AI Policy & Advanced */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">AI Ingestion & Security Guardrails</div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">

            {/* Global Glossary */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Use global glossary</span>
                <span className="text-[11px] text-ink-muted">Merge the global glossary into new transcript and translation prompts.</span>
              </div>
              <Switch
                checked={watchAll.aiUsagePolicy?.useGlobalGlossary ?? true}
                onCheckedChange={(val) => commitPolicy(
                  "aiUsagePolicy.useGlobalGlossary",
                  { ...watchAll.aiUsagePolicy, useGlobalGlossary: val },
                )}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/* Redact PII */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Redact Personal Identifiable Information (PII)</span>
                <span className="text-[11px] text-ink-muted">Automatically detect and mask sensitive identifiers (e.g. emails, phone numbers, SSNs).</span>
              </div>
              <Switch
                checked={watchAll.aiUsagePolicy?.redactPii?.enabled ?? false}
                onCheckedChange={(val) => commitPolicy(
                  "aiUsagePolicy.redactPii.enabled",
                  { ...watchAll.aiUsagePolicy, redactPii: { ...watchAll.aiUsagePolicy.redactPii, enabled: val } },
                )}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/* Data Loss Prevention */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Data Loss Prevention (DLP)</span>
                <span className="text-[11px] text-ink-muted">Block or flag designated restricted terminology or sensitive keywords.</span>
              </div>
              <Switch
                checked={watchAll.aiUsagePolicy?.dlp?.enabled ?? false}
                onCheckedChange={(val) => commitPolicy(
                  "aiUsagePolicy.dlp.enabled",
                  { ...watchAll.aiUsagePolicy, dlp: { ...watchAll.aiUsagePolicy.dlp, enabled: val } },
                )}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/* DLP Blacklist Keywords */}
            {watchAll.aiUsagePolicy?.dlp?.enabled && (
              <div className="py-4 px-4 flex flex-col gap-3 bg-surface-2/50">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-ink">DLP Restricted Keywords</span>
                  <span className="text-[11px] text-ink-muted">Words that will trigger DLP alerts or redaction during streaming translation.</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Enter keyword (e.g., Confidential, Internal-Only)"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    disabled={isSubmitting || !isOwnerOrAdmin}
                    className="h-8 text-xs bg-surface-1 border-hairline flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    disabled={isSubmitting || !isOwnerOrAdmin || !newKeyword.trim()}
                    className="flex h-8 px-3 items-center justify-center gap-1 rounded bg-surface-3 hover:bg-surface-4 font-semibold transition text-xs border border-hairline cursor-pointer text-ink"
                  >
                    <Plus size={12} /> Add Keyword
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {keywords.length === 0 ? (
                    <span className="text-[10px] text-ink-muted italic">No blacklist keywords configured.</span>
                  ) : (
                    keywords.map((kw) => (
                      <div key={kw} className="flex items-center gap-1.5 bg-surface-1 border border-hairline px-2 py-0.5 rounded text-xs">
                        <span className="font-mono text-[10px] text-ink">{kw}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(kw)}
                          disabled={isSubmitting || !isOwnerOrAdmin}
                          className="text-ink-muted hover:text-destructive transition-colors ml-1 cursor-pointer"
                        >
                          <Trash size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Translation Tone */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Translation Tone</span>
                <span className="text-[11px] text-ink-muted">Tone profile applied to real-time LLM translation prompts.</span>
              </div>
              <Select
                value={watchAll.aiUsagePolicy?.translationProfile?.translationTone || "professional"}
                onValueChange={(val) =>
                  val && commitPolicy(
                    "aiUsagePolicy.translationProfile.translationTone",
                    {
                      ...watchAll.aiUsagePolicy,
                      translationProfile: { ...watchAll.aiUsagePolicy.translationProfile, translationTone: val },
                    },
                  )
                }
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue placeholder="Select tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional" className="text-xs">Professional</SelectItem>
                  <SelectItem value="formal" className="text-xs">Formal</SelectItem>
                  <SelectItem value="casual" className="text-xs">Casual</SelectItem>
                  <SelectItem value="technical" className="text-xs">Technical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vietnamese Honorific Style */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Vietnamese Honorific Style</span>
                <span className="text-[11px] text-ink-muted">Honorific style for Vietnamese translation generation.</span>
              </div>
              <Select
                value={
                  watchAll.aiUsagePolicy?.translationProfile?.languageSpecificRules?.vietnameseHonorificStyle ||
                  "formal_hierarchical"
                }
                onValueChange={(val) =>
                  val && commitPolicy(
                    "aiUsagePolicy.translationProfile.languageSpecificRules.vietnameseHonorificStyle",
                    {
                      ...watchAll.aiUsagePolicy,
                      translationProfile: {
                        ...watchAll.aiUsagePolicy.translationProfile,
                        languageSpecificRules: {
                          ...watchAll.aiUsagePolicy.translationProfile.languageSpecificRules,
                          vietnameseHonorificStyle: val,
                        },
                      },
                    },
                  )
                }
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal_hierarchical" className="text-xs">Formal Hierarchical</SelectItem>
                  <SelectItem value="neutral" className="text-xs">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Japanese Honorific Style */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Japanese Keigo / Honorific Style</span>
                <span className="text-[11px] text-ink-muted">Politeness level for Japanese LLM translation outputs.</span>
              </div>
              <Select
                value={
                  watchAll.aiUsagePolicy?.translationProfile?.languageSpecificRules?.japaneseHonorificStyle ||
                  "keigo_teineigo"
                }
                onValueChange={(val) =>
                  val && commitPolicy(
                    "aiUsagePolicy.translationProfile.languageSpecificRules.japaneseHonorificStyle",
                    {
                      ...watchAll.aiUsagePolicy,
                      translationProfile: {
                        ...watchAll.aiUsagePolicy.translationProfile,
                        languageSpecificRules: {
                          ...watchAll.aiUsagePolicy.translationProfile.languageSpecificRules,
                          japaneseHonorificStyle: val,
                        },
                      },
                    },
                  )
                }
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keigo_teineigo" className="text-xs">Teineigo (Polite)</SelectItem>
                  <SelectItem value="sonkeigo_kenjougo" className="text-xs">Sonkeigo/Kenjougo (Honorific/Humble)</SelectItem>
                  <SelectItem value="plain" className="text-xs">Plain (Informal)</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
