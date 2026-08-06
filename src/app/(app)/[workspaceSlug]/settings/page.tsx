"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Checks,
  Copy,
  Globe,
  Lock,
  Plus,
  Spinner,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useUpdateWorkspaceSettings,
  useWorkspace,
  useWorkspaceSettings,
} from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { WorkspaceSettingsDto } from "@/types/workspace";

const settingsSchema = z.object({
  defaultLanguage: z.string().min(1, "Please select default language"),
  timezone: z.string().min(1, "Please select timezone"),
  maxActiveRooms: z.number().min(1, "Must be at least 1 room"),
  artifactRetentionDays: z
    .number()
    .min(1, "Retention must be at least 1 day"),
  enforceHostApprovalDefault: z.boolean(),
  voiceCloningEnabled: z.boolean(),
  isProfanityFilterEnabled: z.boolean(),
  allowedTargetLanguages: z.array(z.string()),
  verifiedDomains: z.array(z.string()),
  allowExternalCollaboration: z.boolean(),
  requireVerifiedDomainForInternal: z.boolean(),
  aiUsagePolicy: z.object({
    allowExternalLlm: z.boolean(),
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
  allowedTargetLanguages: [],
  verifiedDomains: [],
  allowExternalCollaboration: true,
  requireVerifiedDomainForInternal: true,
  aiUsagePolicy: {
    allowExternalLlm: true,
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
    defaultLanguage:
      settings.defaultLanguage || DEFAULT_SETTINGS_FORM_DATA.defaultLanguage,
    timezone: settings.timezone || DEFAULT_SETTINGS_FORM_DATA.timezone,
    maxActiveRooms:
      settings.maxActiveRooms ?? DEFAULT_SETTINGS_FORM_DATA.maxActiveRooms,
    artifactRetentionDays:
      settings.artifactRetentionDays ??
      DEFAULT_SETTINGS_FORM_DATA.artifactRetentionDays,
    enforceHostApprovalDefault:
      settings.enforceHostApprovalDefault ??
      DEFAULT_SETTINGS_FORM_DATA.enforceHostApprovalDefault,
    voiceCloningEnabled:
      settings.voiceCloningEnabled ??
      DEFAULT_SETTINGS_FORM_DATA.voiceCloningEnabled,
    isProfanityFilterEnabled:
      settings.isProfanityFilterEnabled ??
      DEFAULT_SETTINGS_FORM_DATA.isProfanityFilterEnabled,
    allowedTargetLanguages: settings.allowedTargetLanguages || [],
    verifiedDomains: settings.verifiedDomains || [],
    allowExternalCollaboration:
      settings.allowExternalCollaboration ??
      DEFAULT_SETTINGS_FORM_DATA.allowExternalCollaboration,
    requireVerifiedDomainForInternal:
      settings.requireVerifiedDomainForInternal ??
      DEFAULT_SETTINGS_FORM_DATA.requireVerifiedDomainForInternal,
    aiUsagePolicy: {
      allowExternalLlm: true,
      redactPii: {
        enabled:
          settings.aiUsagePolicy?.redactPii?.enabled ??
          DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.redactPii.enabled,
      },
      dlp: {
        enabled:
          settings.aiUsagePolicy?.dlp?.enabled ??
          DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.dlp.enabled,
        keywordsBlacklist: settings.aiUsagePolicy?.dlp?.keywordsBlacklist || [],
      },
      translationProfile: {
        translationTone:
          settings.aiUsagePolicy?.translationProfile?.translationTone ||
          DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile
            .translationTone,
        languageSpecificRules: {
          vietnameseHonorificStyle:
            settings.aiUsagePolicy?.translationProfile?.languageSpecificRules
              ?.vietnameseHonorificStyle ||
            DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile
              .languageSpecificRules.vietnameseHonorificStyle,
          japaneseHonorificStyle:
            settings.aiUsagePolicy?.translationProfile?.languageSpecificRules
              ?.japaneseHonorificStyle ||
            DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile
              .languageSpecificRules.japaneseHonorificStyle,
        },
      },
    },
  };
}

export default function WorkspaceSettingsPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);
  const {
    setActiveWorkspace,
    activeWorkspaceSlug,
    membershipType,
  } = useWorkspaceStore();

  // Queries & Mutations
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const updateSettingsMutation = useUpdateWorkspaceSettings(
    activeWorkspaceId || "",
  );

  const [newDomain, setNewDomain] = useState("");
  const [newKeyword, setNewKeyword] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: DEFAULT_SETTINGS_FORM_DATA,
  });

  const watchAll = useWatch({ control });

  useEffect(() => {
    if (settingsQuery.data) {
      reset(toSettingsFormData(settingsQuery.data));
    }
  }, [settingsQuery.data, reset]);

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
              Only workspace Owners and Administrators can view or modify
              workspace configurations.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSettingsSubmit = async (formData: SettingsFormData) => {
    if (!settingsQuery.data) return;
    const normalizedFormData: SettingsFormData = {
      ...formData,
      aiUsagePolicy: {
        ...formData.aiUsagePolicy,
        allowExternalLlm: true,
      },
    };

    try {
      await updateSettingsMutation.mutateAsync({
        ...settingsQuery.data,
        ...normalizedFormData,
      });
      setActiveWorkspace(
        activeWorkspaceId,
        workspaceQuery.data?.name || "",
        activeWorkspaceSlug,
        currentRole,
        membershipType,
        normalizedFormData.defaultLanguage,
      );
      toast.success("Workspace settings updated successfully.");
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Failed to update settings.";
      toast.error(errorMsg);
    }
  };

  const allowedLangs = watchAll.allowedTargetLanguages || [];
  const handleLanguageToggle = (code: string) => {
    if (allowedLangs.includes(code)) {
      setValue(
        "allowedTargetLanguages",
        allowedLangs.filter((c) => c !== code),
        { shouldDirty: true },
      );
    } else {
      setValue("allowedTargetLanguages", [...allowedLangs, code], {
        shouldDirty: true,
      });
    }
  };

  const domains = watchAll.verifiedDomains || [];
  const isVerifiedDomainEditingDisabled =
    isSubmitting || !watchAll.requireVerifiedDomainForInternal;
  const handleAddDomain = () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) return;
    if (
      !trimmed.includes(".") ||
      trimmed.startsWith(".") ||
      trimmed.endsWith(".")
    ) {
      toast.error("Invalid domain format.");
      return;
    }
    const publicDomains = [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
    ];
    if (publicDomains.includes(trimmed)) {
      toast.error("Cannot verify public domain names.");
      return;
    }
    if (domains.includes(trimmed)) {
      toast.error("Domain already added.");
      return;
    }
    setValue("verifiedDomains", [...domains, trimmed], { shouldDirty: true });
    setNewDomain("");
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    setValue(
      "verifiedDomains",
      domains.filter((d) => d !== domainToRemove),
      { shouldDirty: true },
    );
  };

  const keywords = watchAll.aiUsagePolicy?.dlp?.keywordsBlacklist || [];
  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) {
      toast.error("Keyword already in blacklist.");
      return;
    }
    setValue("aiUsagePolicy.dlp.keywordsBlacklist", [...keywords, trimmed], {
      shouldDirty: true,
    });
    setNewKeyword("");
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    setValue(
      "aiUsagePolicy.dlp.keywordsBlacklist",
      keywords.filter((k) => k !== keywordToRemove),
      { shouldDirty: true },
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8 text-ink">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="text-xs text-ink-muted">
          Configure your workspace defaults, collaboration boundaries, and AI
          scanning policies.
        </p>
      </div>

      {/* Workspace Link & Slug Card */}
      <div className="flex flex-col gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
          Workspace Info
        </div>
        <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
          {/* Slug Row */}
          <div className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-ink">
                Workspace Slug
              </span>
              <span className="text-[11px] text-ink-muted">
                The unique handle for identifying this workspace.
              </span>
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
              <span className="text-xs font-semibold text-ink">
                Workspace URL
              </span>
              <span className="text-[11px] text-ink-muted">
                The direct landing link for members to access this workspace.
              </span>
            </div>
            <div className="relative flex items-center w-full sm:w-[240px]">
              <Input
                readOnly
                value={
                  workspaceQuery.data
                    ? `${window.location.origin}/${workspaceQuery.data.slug}`
                    : ""
                }
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

      <form
        onSubmit={handleSubmit(handleSettingsSubmit, () =>
          toast.error(
            "Please complete required workspace settings before saving.",
          ),
        )}
        className="flex flex-col gap-8"
      >
        {/* Section 1: General */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Localization & General
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            {/* Default Language */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Default Language
                </span>
                <span className="text-[11px] text-ink-muted">
                  The default language used for translation and transcription
                  features in this workspace if a user or room does not specify
                  one.
                </span>
              </div>
              <Select
                value={watchAll.defaultLanguage}
                onValueChange={(val) =>
                  setValue("defaultLanguage", val || "", { shouldDirty: true })
                }
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem
                      key={l.code}
                      value={l.code}
                      className="text-xs cursor-pointer"
                    >
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
                <span className="text-[11px] text-ink-muted">
                  Select the default timezone context for calculations.
                </span>
              </div>
              <Select
                value={watchAll.timezone}
                onValueChange={(val) =>
                  setValue("timezone", val || "", { shouldDirty: true })
                }
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select timezone..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC" className="text-xs cursor-pointer">
                    UTC (Greenwich Mean Time)
                  </SelectItem>
                  <SelectItem value="GMT+7" className="text-xs cursor-pointer">
                    GMT+7 (Indochina Time)
                  </SelectItem>
                  <SelectItem value="GMT+9" className="text-xs cursor-pointer">
                    GMT+9 (Japan Standard Time)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Max Active Rooms */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Max Active Rooms
                </span>
                <span className="text-[11px] text-ink-muted">
                  Limit the number of concurrent active translation rooms.
                </span>
              </div>
              <Input
                type="number"
                className="h-8 border-hairline focus:ring-1 focus:ring-primary text-xs bg-surface-2/40 w-[80px] text-right"
                {...register("maxActiveRooms", { valueAsNumber: true })}
                disabled={isSubmitting}
              />
            </div>

            {/* Artifact Retention */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Artifact Retention (Days)
                </span>
                <span className="text-[11px] text-ink-muted">
                  Specify how long translation transcripts and audios are kept.
                  Use 1 - 3650 days.
                </span>
              </div>
              <Input
                type="number"
                min={1}
                className="h-8 border-hairline focus:ring-1 focus:ring-primary text-xs bg-surface-2/40 w-[80px] text-right"
                {...register("artifactRetentionDays", { valueAsNumber: true })}
                disabled={isSubmitting}
              />
            </div>

            {/* Allowed Languages */}
            <div className="py-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Allowed Target Languages
                </span>
                <span className="text-[11px] text-ink-muted">
                  Limit which translation languages are active.
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 justify-end mt-1 sm:mt-0">
                {languages.map((l) => {
                  const isChecked = allowedLangs.includes(l.code);
                  return (
                    <label
                      key={l.code}
                      className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleLanguageToggle(l.code)}
                        disabled={isSubmitting}
                        className="rounded border-hairline text-primary focus:ring-primary h-3.5 w-3.5 bg-surface-2 cursor-pointer"
                      />
                      <span className="font-medium text-ink-muted">
                        {l.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Enforce Host Admission */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Enforce Host Admission
                </span>
                <span className="text-[11px] text-ink-muted">
                  Require host permission for participants to join rooms by
                  default.
                </span>
              </div>
              <Switch
                checked={watchAll.enforceHostApprovalDefault}
                onCheckedChange={(val) =>
                  setValue("enforceHostApprovalDefault", val, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Voice Cloning */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Voice Cloning
                </span>
                <span className="text-[11px] text-ink-muted">
                  Enable voice clone features inside meetings.
                </span>
              </div>
              <Switch
                checked={watchAll.voiceCloningEnabled}
                onCheckedChange={(val) =>
                  setValue("voiceCloningEnabled", val, { shouldDirty: true })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Profanity Filter */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Enable Profanity Filter
                </span>
                <span className="text-[11px] text-ink-muted">
                  Automatically censor bad words and slang in transcripts.
                </span>
              </div>
              <Switch
                checked={watchAll.isProfanityFilterEnabled}
                onCheckedChange={(val) =>
                  setValue("isProfanityFilterEnabled", val, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Collaboration & Security */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Enterprise & External Collaboration
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            {/* Allow External Collaboration */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <span className="text-xs font-semibold text-ink">
                  Allow External Collaboration
                </span>
                <span className="text-[11px] text-ink-muted">
                  Allow external participants to join rooms.
                </span>
                {isAdmin && (
                  <span className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
                    <Warning size={12} />
                    Only the Workspace Owner can modify this.
                  </span>
                )}
              </div>
              <Switch
                checked={watchAll.allowExternalCollaboration}
                onCheckedChange={(val) =>
                  setValue("allowExternalCollaboration", val, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting || isAdmin}
              />
            </div>

            {/* Require Verified Domain */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Require Verified Domain for Internal Members
                </span>
                <span className="text-[11px] text-ink-muted">
                  Enforce internal members to use verified domains.
                </span>
              </div>
              <Switch
                checked={watchAll.requireVerifiedDomainForInternal}
                onCheckedChange={(val) =>
                  setValue("requireVerifiedDomainForInternal", val, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Verified Email Domains */}
            <div className="py-4 px-4 flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Verified Domains
                </span>
                <span className="text-[11px] text-ink-muted">
                  Manage specific corporate email domains allowed in this
                  workspace.
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter a domain (e.g., company.com)"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  disabled={isVerifiedDomainEditingDisabled}
                  className="h-8 text-xs bg-surface-2 border-hairline flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddDomain();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddDomain}
                  disabled={isVerifiedDomainEditingDisabled || !newDomain.trim()}
                  className="flex h-8 px-3 items-center justify-center gap-1 rounded bg-surface-3 hover:bg-surface-4 font-semibold transition text-xs border border-hairline cursor-pointer text-ink"
                >
                  <Plus size={12} /> Add Domain
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {domains.length === 0 ? (
                  <span className="text-[10px] text-ink-muted italic">
                    No verified domains. Add one above.
                  </span>
                ) : (
                  domains.map((d) => (
                    <div
                      key={d}
                      className="flex items-center gap-1.5 bg-surface-2 border border-hairline px-2 py-0.5 rounded text-xs"
                    >
                      <Globe size={11} className="text-primary" />
                      <span className="font-mono text-[10px] text-ink">
                        {d}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDomain(d)}
                        disabled={isVerifiedDomainEditingDisabled}
                        className="text-ink-muted hover:text-destructive transition-colors ml-1 cursor-pointer"
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
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            AI Ingestion & Security Guardrails
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            {/* Redact PII */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Redact Personal Identifiable Information (PII)
                </span>
                <span className="text-[11px] text-ink-muted">
                  Automatically detect and mask sensitive identifiers (e.g.
                  emails, phone numbers, SSNs).
                </span>
              </div>
              <Switch
                checked={watchAll.aiUsagePolicy?.redactPii?.enabled ?? false}
                onCheckedChange={(val) =>
                  setValue("aiUsagePolicy.redactPii.enabled", val, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Data Loss Prevention */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Data Loss Prevention (DLP)
                </span>
                <span className="text-[11px] text-ink-muted">
                  Block or flag designated restricted terminology or sensitive
                  keywords.
                </span>
              </div>
              <Switch
                checked={watchAll.aiUsagePolicy?.dlp?.enabled ?? false}
                onCheckedChange={(val) =>
                  setValue("aiUsagePolicy.dlp.enabled", val, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Blacklisted Keywords (Conditional) */}
            {watchAll.aiUsagePolicy?.dlp?.enabled && (
              <div className="py-4 px-4 flex flex-col gap-3 bg-surface-2/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-ink">
                    Keywords Blacklist
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    Add keywords and press Enter to blacklist them.
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Add Keyword"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    disabled={isSubmitting}
                    className="h-8 text-xs bg-surface-2 border-hairline flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    disabled={isSubmitting || !newKeyword.trim()}
                    className="flex h-8 px-3 items-center justify-center gap-1 rounded bg-surface-3 hover:bg-surface-4 font-semibold transition text-xs border border-hairline cursor-pointer text-ink"
                  >
                    <Plus size={12} /> Add Keyword
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {keywords.length === 0 ? (
                    <span className="text-[10px] text-ink-muted italic">
                      No keywords blacklisted yet.
                    </span>
                  ) : (
                    keywords.map((k) => (
                      <div
                        key={k}
                        className="flex items-center gap-1.5 bg-surface-2 border border-hairline px-2 py-0.5 rounded text-xs"
                      >
                        <span className="font-mono text-[10px] text-ink">
                          {k}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(k)}
                          disabled={isSubmitting}
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
                <span className="text-xs font-semibold text-ink">
                  Translation Tone
                </span>
                <span className="text-[11px] text-ink-muted">
                  Choose translation delivery tone.
                </span>
              </div>
              <Select
                value={
                  watchAll.aiUsagePolicy?.translationProfile?.translationTone ||
                  DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile
                    .translationTone
                }
                onValueChange={(val) =>
                  setValue(
                    "aiUsagePolicy.translationProfile.translationTone",
                    val || "",
                    { shouldDirty: true },
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select tone..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="professional"
                    className="text-xs cursor-pointer"
                  >
                    Professional
                  </SelectItem>
                  <SelectItem value="casual" className="text-xs cursor-pointer">
                    Casual
                  </SelectItem>
                  <SelectItem value="formal" className="text-xs cursor-pointer">
                    Technical
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vietnamese Honorific */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Vietnamese Honorific Style
                </span>
                <span className="text-[11px] text-ink-muted">
                  Control the pronouns and social markers for Vietnamese
                  translations.
                </span>
              </div>
              <Select
                value={
                  watchAll.aiUsagePolicy?.translationProfile
                    ?.languageSpecificRules?.vietnameseHonorificStyle ||
                  DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile
                    .languageSpecificRules.vietnameseHonorificStyle
                }
                onValueChange={(val) =>
                  setValue(
                    "aiUsagePolicy.translationProfile.languageSpecificRules.vietnameseHonorificStyle",
                    val || "",
                    { shouldDirty: true },
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select style..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="formal_hierarchical"
                    className="text-xs cursor-pointer"
                  >
                    Formal/Hierarchical
                  </SelectItem>
                  <SelectItem
                    value="standard"
                    className="text-xs cursor-pointer"
                  >
                    Neutral
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Japanese Honorific */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Japanese Honorific Style
                </span>
                <span className="text-[11px] text-ink-muted">
                  Set specific politeness rule sets (e.g. Keigo/Teineigo) for
                  Japanese translations.
                </span>
              </div>
              <Select
                value={
                  watchAll.aiUsagePolicy?.translationProfile
                    ?.languageSpecificRules?.japaneseHonorificStyle ||
                  DEFAULT_SETTINGS_FORM_DATA.aiUsagePolicy.translationProfile
                    .languageSpecificRules.japaneseHonorificStyle
                }
                onValueChange={(val) =>
                  setValue(
                    "aiUsagePolicy.translationProfile.languageSpecificRules.japaneseHonorificStyle",
                    val || "",
                    { shouldDirty: true },
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select style..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="keigo_teineigo"
                    className="text-xs cursor-pointer"
                  >
                    Keigo/Teineigo
                  </SelectItem>
                  <SelectItem
                    value="standard"
                    className="text-xs cursor-pointer"
                  >
                    Neutral/Informal
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="pt-4 border-t border-hairline flex justify-end">
          <button
            type="submit"
            className="flex h-8 px-5 items-center justify-center gap-2 rounded bg-primary font-medium text-white transition hover:bg-primary-hover disabled:opacity-50 text-xs cursor-pointer shadow-sm"
            disabled={isSubmitting || updateSettingsMutation.isPending}
          >
            {updateSettingsMutation.isPending ? (
              <Spinner className="h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <>
                <Checks size={14} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
