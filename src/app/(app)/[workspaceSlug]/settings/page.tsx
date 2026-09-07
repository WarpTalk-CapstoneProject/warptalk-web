"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  Checks,
  Warning,
} from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { languagesInScope } from "@/lib/language/languages";
import { LanguageLabel } from "@/components/language/language-label";
import type { WorkspaceSettingsDto } from "@/types/workspace";
import {
  useWorkspace,
  useWorkspaceSettings,
  usePatchWorkspaceSettings,
  useVerifiedDomains,
} from "@/hooks/use-workspace";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAssistantPlugins } from "@/hooks/use-assistant";
import { Checkbox } from "@/components/ui/checkbox";
import { useAutoSaveQueue } from "@/hooks/use-auto-save";
import { AutoSaveStatusBadge } from "@/components/features/settings/auto-save-status-badge";
import { parseIntegerInRange } from "@/lib/workspace/settings-validation";
import { describeLanguageCeiling, describeRoomCeiling } from "@/lib/workspace/room-ceiling-notice";
import { describeTimeZone, supportedTimeZones } from "@/lib/format/time-zones";

const settingsSchema = z.object({
  defaultLanguage: z.string().min(1, "Please select default language"),
  timezone: z.string().min(1, "Please select timezone"),
  maxActiveRooms: z.number().int("Must be a whole number").min(1, "Must be at least 1 room").max(50, "Max 50 rooms"),
  artifactRetentionDays: z.number().int("Must be a whole number").min(0, "Retention must be 0 (indefinite) or positive").max(3650, "Max 3650 days"),
  invitationExpiryDays: z.number().int("Must be a whole number").min(1, "Expiry must be at least 1 day").max(365, "Max 365 days"),
  voiceCloningEnabled: z.boolean(),
  isProfanityFilterEnabled: z.boolean(),
  allowAnyPlugins: z.boolean(),
  // Nullable on purpose, and NOT `.default([])`. Null is the workspace saying "I have no
  // allowlist, ask allowAnyPlugins"; [] is the workspace saying "I have an allowlist and it
  // permits nothing". Zod would happily flatten the first into the second and nobody would see
  // it until every plugin in a workspace stopped answering.
  allowedPluginKeys: z.array(z.string()).nullable(),
  allowMemberPluginInstall: z.boolean(),
  requirePluginApproval: z.boolean(),
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
  }),
});

type SettingsFormData = z.infer<typeof settingsSchema>;
type ApiErrorLike = {
  response?: {
    status?: number;
  };
};

// The workspace default language and the allowed-target list are both meeting languages, so
// they follow the registry rather than a third copy that only ever listed en/vi/ja.
const languages = languagesInScope("meeting").map((language) => ({
  code: language.code,
  label: language.name,
}));

const DEFAULT_SETTINGS_FORM_DATA: SettingsFormData = {
  defaultLanguage: "en",
  timezone: "UTC",
  maxActiveRooms: 5,
  artifactRetentionDays: 30,
  invitationExpiryDays: 7,
  voiceCloningEnabled: true,
  isProfanityFilterEnabled: false,
  allowAnyPlugins: true,
  // No allowlist, which is what every workspace looks like before anyone configures one — and
  // the only default that leaves plugin behaviour exactly where allowAnyPlugins already put it.
  allowedPluginKeys: null,
  allowMemberPluginInstall: true,
  requirePluginApproval: false,
  // Empty means unrestricted — every meeting-scope language is offered. It used to read
  // ["en","vi","ja"], which is not a default so much as a policy nobody chose: a workspace
  // that had never set one got a three-language allowlist, and Korean, French and Spanish
  // showed as BLOCKED in the create-room picker with the reason pointing at "this
  // workspace's language policy" and at an admin who had never touched it. Worse, the value
  // is what this form posts, so the first save of any unrelated setting wrote the invented
  // allowlist to the server for real.
  allowedTargetLanguages: [],
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
  },
};

function toSettingsFormData(settings: WorkspaceSettingsDto): SettingsFormData {
  return {
    ...DEFAULT_SETTINGS_FORM_DATA,
    defaultLanguage: settings.defaultLanguage || DEFAULT_SETTINGS_FORM_DATA.defaultLanguage,
    timezone: settings.timezone || DEFAULT_SETTINGS_FORM_DATA.timezone,
    maxActiveRooms: settings.maxActiveRooms ?? DEFAULT_SETTINGS_FORM_DATA.maxActiveRooms,
    artifactRetentionDays: settings.artifactRetentionDays ?? DEFAULT_SETTINGS_FORM_DATA.artifactRetentionDays,
    invitationExpiryDays: settings.invitationExpiryDays ?? DEFAULT_SETTINGS_FORM_DATA.invitationExpiryDays,
    voiceCloningEnabled: settings.voiceCloningEnabled ?? DEFAULT_SETTINGS_FORM_DATA.voiceCloningEnabled,
    isProfanityFilterEnabled: settings.isProfanityFilterEnabled ?? DEFAULT_SETTINGS_FORM_DATA.isProfanityFilterEnabled,
    allowAnyPlugins: settings.allowAnyPlugins ?? DEFAULT_SETTINGS_FORM_DATA.allowAnyPlugins,
    // `?? null` and never `?? []`. It maps only the absent field (a server that predates
    // WT-646) onto null, and leaves a real [] from the server standing as the empty allowlist
    // it is. `|| []` here would be the bug the backend DTO spends a paragraph warning about:
    // "permits nothing" would load as "no policy", and the first save of any unrelated setting
    // on this page would write that reversal back to the server.
    allowedPluginKeys: settings.allowedPluginKeys ?? null,
    allowMemberPluginInstall: settings.allowMemberPluginInstall ?? DEFAULT_SETTINGS_FORM_DATA.allowMemberPluginInstall,
    requirePluginApproval: settings.requirePluginApproval ?? DEFAULT_SETTINGS_FORM_DATA.requirePluginApproval,
    // `|| []` and not `|| [...three languages]`: an absent policy means the server is not
    // restricting anything, and substituting a list here turns "no policy" into a real one.
    allowedTargetLanguages: settings.allowedTargetLanguages || [],
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
    },
  };
}

export default function WorkspaceSettingsPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);
  const { setActiveWorkspace, activeWorkspaceSlug, membershipType, canCreateMeetings } =
    useWorkspaceStore();

  // Queries & Mutations
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const patchSettingsMutation = usePatchWorkspaceSettings(activeWorkspaceId || "");
  const verifiedDomainsQuery = useVerifiedDomains(activeWorkspaceId || "");
  // The plugin catalog the allowlist below picks from. Called up here with the other queries and
  // not beside the section that renders it: everything from `if (!activeWorkspaceId) return null`
  // downwards is past an early return, and a hook after one is React error #310 — see
  // scripts/check-hooks-before-early-return.mjs.
  const pluginCatalogQuery = useAssistantPlugins();

  const [newKeyword, setNewKeyword] = useState("");
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

  // What the plan actually permits, and what the box currently says — the two numbers the
  // "Max Active Rooms" hint below compares. Read from the query rather than the form, because it
  // is not editable: it is the ceiling the server resolved from this workspace's entitlements.
  const settings = settingsQuery.data;
  const planRoomCeiling = settings?.maxActiveRoomsCeiling ?? null;
  const watchedMaxActiveRooms = watchAll.maxActiveRooms;
  const roomCeilingNotice = describeRoomCeiling({
    ceiling: planRoomCeiling,
    configured: watchedMaxActiveRooms,
    source: settings?.maxActiveRoomsCeilingSource,
  }).message;

  // WT-500 — the plan's per-meeting language quota, which is enforced at meeting creation and
  // used to be invisible everywhere else. Counted off the live form value rather than the saved
  // settings so the notice appears the moment an Owner ticks the language that crosses the line,
  // not after they navigate away and come back.
  const languageCeilingNotice = describeLanguageCeiling({
    ceiling: settings?.maxLanguagesCeiling,
    allowedCount: (watchAll.allowedTargetLanguages || []).length,
    source: settings?.maxLanguagesCeilingSource,
  }).message;

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
        // Carried through, not dropped. This call re-writes the whole active-workspace record to
        // change ONE field, so omitting the permission would reset it to "unknown" — which reads as
        // allowed — and every New-meeting button would come back for an external member the moment
        // an admin changed the workspace's default language.
        canCreateMeetings,
      );
    }
    return saved;
  }, [activeWorkspaceId, activeWorkspaceSlug, canCreateMeetings, membershipType, patchSettingsMutation, role, setActiveWorkspace, workspaceQuery.data]);

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

  // A failed load is not a configuration. Rendering the form here would show
  // DEFAULT_SETTINGS_FORM_DATA — "Max Active Rooms: 5" for a workspace configured to 20 —
  // as if it were the workspace's own settings, and the first control the user touched would
  // then save that fiction over the real document.
  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Warning className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Couldn&apos;t load workspace settings</CardTitle>
            <CardDescription className="text-xs">
              The current configuration could not be read, so nothing is shown here rather
              than showing defaults that are not this workspace&apos;s. Retry, and if it keeps
              failing check that the workspace service is reachable.
            </CardDescription>
          </CardHeader>
          <button
            type="button"
            onClick={() => settingsQuery.refetch()}
            disabled={settingsQuery.isFetching}
            className="mx-auto mt-2 inline-flex h-9 items-center rounded-md border border-hairline bg-surface-2 px-4 text-xs font-semibold transition hover:bg-surface-3 disabled:opacity-60"
          >
            {settingsQuery.isFetching ? "Retrying…" : "Retry"}
          </button>
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

  const commitNumericField = (field: "maxActiveRooms" | "artifactRetentionDays" | "invitationExpiryDays", rawValue: string) => {
    const limits = field === "maxActiveRooms" ? [1, 50] : field === "invitationExpiryDays" ? [1, 365] : [0, 3650];
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

  // WT-646 — the plugin allowlist.
  //
  // `?? null` rather than `|| []`: the whole point of the field is that "no allowlist" and "an
  // allowlist that permits nothing" are different policies, and every place that reads the value
  // has to keep them apart. The switch below is bound to which of the two this is, so a stray
  // `|| []` would show every workspace on earth an enforced, empty allowlist.
  const allowedPluginKeys = watchAll.allowedPluginKeys ?? null;
  const allowlistEnforced = allowedPluginKeys !== null;
  const pluginCatalog = pluginCatalogQuery.data ?? [];
  // A key saved before the catalog changed shape — google_workspace, after it was split into
  // google_drive / google_calendar / google_meet — matches no catalog row. Listing it separately
  // rather than dropping it keeps the saved policy visible and removable; silently omitting it
  // would make the form post an allowlist the admin never edited.
  const unmatchedPluginKeys = (allowedPluginKeys ?? []).filter(
    (key) => !pluginCatalog.some((plugin) => plugin.key === key),
  );

  const handlePluginKeyToggle = (key: string, checked: boolean) => {
    const current = allowedPluginKeys ?? [];
    const next = checked
      ? current.includes(key) ? current : [...current, key]
      : current.filter((k) => k !== key);
    commitTopLevel("allowedPluginKeys", next);
  };

  // Enforcing starts from [], not from "everything in the catalog". Seeding the list with what
  // the catalog happens to hold today would write a policy nobody chose — the same mistake the
  // allowedTargetLanguages default above documents — and it would silently keep permitting new
  // plugins that an allowlist exists precisely to hold back. [] is severe and honest, and the
  // notice under the list says so.
  const handleAllowlistEnforcedToggle = (enforced: boolean) => {
    commitTopLevel("allowedPluginKeys", enforced ? [] : null);
  };

  const verifiedDomainList = verifiedDomainsQuery.data || [];
  const activeDomains = verifiedDomainList.map((vd: { domain: string }) => vd.domain);

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

  const effectiveSaveStatus = autoSave.status;

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
          onRetry={Object.keys(errors).length === 0 ? autoSave.retry : undefined}
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
                  <SelectValue>
                    {(value) =>
                      value ? <LanguageLabel value={String(value)} /> : "Select language"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* Through LanguageLabel like every other picker, rather than a bare name.
                      It is the single place that turns a language value into display text,
                      and it takes the bare codes this form holds as readily as the locale
                      tags rooms carry. */}
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code} className="text-xs">
                      <LanguageLabel value={l.code} />
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
                  <SelectValue>
                    {(value) =>
                      value ? describeTimeZone(String(value)) : "Select timezone"
                    }
                  </SelectValue>
                </SelectTrigger>
                {/* Every zone the platform knows, not four guesses about where customers are.
                    A workspace in Singapore, Sydney or Berlin previously had no way to say so,
                    and the nearest wrong answer shifts every meeting it books.

                    The stored value is passed in because it may be spelled differently from
                    the generated list: this platform canonicalises to Asia/Saigon and omits
                    Asia/Ho_Chi_Minh entirely, which is precisely the value the accounts
                    database defaults every account to. Without it the control would look
                    empty for almost everyone and drop the setting on the next save.

                    Offsets are computed from the zone and today's date rather than written
                    beside the label — the old list said "(-5)" for New York, which is an hour
                    wrong from March to November. */}
                <SelectContent>
                  {supportedTimeZones(watchAll.timezone).map((zone) => (
                    <SelectItem key={zone} value={zone} className="text-xs">
                      {describeTimeZone(zone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max Active Rooms */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Max Active Rooms</span>
                <span className="text-[11px] text-ink-muted">Maximum concurrent translation rooms allowed for this workspace.</span>
                {/* The number in the box is not always the number that applies.
                    A workspace may tighten its own cap and may never raise it above what the plan
                    sells, so meeting creation enforces the LOWER of the two. Saying so here is the
                    missing half of the reported bug: this field read 20 while room creation
                    refused at 5, and the page offered no way to find out why.

                    WT-562: the sentence itself was then wrong. It printed the entitlement's raw
                    provenance at the Owner — "(plan:enterpise2)", an internal catalogue id, and a
                    misspelled one — and asserted "Your plan allows" for a number that does not
                    always come from a plan. See lib/workspace/room-ceiling-notice. */}
                {roomCeilingNotice ? (
                  <span className="text-[11px] text-amber-600">{roomCeilingNotice}</span>
                ) : null}
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

            {/* Invitation Expiry Days */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Invitation Expiry Days</span>
                <span className="text-[11px] text-ink-muted">Days before a workspace invitation link expires (1 - 365 days).</span>
              </div>
              <Input
                type="number"
                min={1}
                max={365}
                {...register("invitationExpiryDays", { valueAsNumber: true })}
                onBlur={(event) => commitNumericField("invitationExpiryDays", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitNumericField("invitationExpiryDays", event.currentTarget.value);
                    event.currentTarget.blur();
                  }
                }}
                disabled={isSubmitting || !isOwnerOrAdmin}
                className="w-[140px] h-8 text-xs bg-surface-2 border-hairline"
              />
              {errors.invitationExpiryDays?.message && (
                <span className="text-[11px] text-destructive">{errors.invitationExpiryDays.message}</span>
              )}
            </div>

            {/* Allowed Target Languages */}
            <div className="py-3.5 px-4 flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Allowed Target Translation Languages</span>
                <span className="text-[11px] text-ink-muted">Languages available for live translation in meeting rooms.</span>
                {languageCeilingNotice ? (
                  <span className="text-[11px] text-amber-600">{languageCeilingNotice}</span>
                ) : null}
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
                      {/* Was "Vietnamese (VI)" — the code repeated the name it sat beside and
                          told the reader nothing the flag does not. */}
                      <LanguageLabel value={l.code} />
                    </button>
                  );
                })}
              </div>
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

            {/* Personal MCP Plugins */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <span className="text-xs font-semibold text-ink">Allow personal plugins</span>
                <span className="text-[11px] text-ink-muted">Allow members to use their connected plugins in WarpBot conversations for this workspace.</span>
                {/* Said here rather than left for the member to discover: with an allowlist in
                    force this switch is no longer the answer, and a workspace whose plugins
                    stopped working would otherwise come looking at this row first. */}
                {allowlistEnforced ? (
                  <span className="text-[11px] text-ink-muted">An allowlist is in force below, so this switch no longer decides on its own.</span>
                ) : null}
              </div>
              <Switch
                checked={watchAll.allowAnyPlugins}
                onCheckedChange={(val) => commitTopLevel("allowAnyPlugins", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/*
              WT-646 — plugin governance, extending the row above rather than moving anywhere
              else. These four fields are one decision ("which plugins may run here, and who
              says so"), and splitting them across a tab or a route would leave the oldest of
              them on this page and the three that qualify it somewhere the reader has to go
              looking for.
            */}

            {/* Plugin Allowlist */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <span className="text-xs font-semibold text-ink">Restrict to an allowlist</span>
                <span className="text-[11px] text-ink-muted">
                  {allowlistEnforced
                    ? "Only the plugins ticked below may run in this workspace."
                    : "No allowlist is configured. Plugins are decided by the switch above."}
                </span>
              </div>
              <Switch
                checked={allowlistEnforced}
                onCheckedChange={handleAllowlistEnforcedToggle}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {allowlistEnforced && (
              <div className="py-4 px-4 flex flex-col gap-3 bg-surface-2/50">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-ink">Permitted plugins</span>
                  <span className="text-[11px] text-ink-muted">Picked from the plugin catalog. A key is never typed by hand here — nothing downstream can tell a misspelt key from one no plugin claims yet.</span>
                  {allowedPluginKeys && allowedPluginKeys.length === 0 ? (
                    <span className="text-[11px] text-amber-600">This allowlist permits nothing. No plugin will run in this workspace until at least one is ticked.</span>
                  ) : null}
                </div>

                {/*
                  Three outcomes, told apart on purpose. A failed catalog request rendered as an
                  empty list would read as "this workspace permits nothing" — the most alarming
                  sentence on the page — when the truth is that the assistant service did not
                  answer. Nothing is saved from this branch either: the saved keys are shown raw
                  so the policy in force stays legible while the catalog is missing.
                */}
                {pluginCatalogQuery.isPending ? (
                  <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                    <Spinner className="h-3.5 w-3.5 animate-spin" />
                    Loading the plugin catalog…
                  </div>
                ) : pluginCatalogQuery.isError ? (
                  <div className="flex flex-col gap-2 rounded border border-hairline bg-surface-1 p-3">
                    <div className="flex items-start gap-2">
                      <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span className="text-[11px] text-ink-muted">
                        The plugin catalog could not be loaded, so there is nothing to tick. This is
                        not an empty allowlist — the keys this workspace already permits are
                        unchanged, and listed below. Retry before editing them.
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(allowedPluginKeys ?? []).length === 0 ? (
                        <span className="text-[10px] italic text-ink-muted">No plugin keys are permitted.</span>
                      ) : (
                        (allowedPluginKeys ?? []).map((key) => (
                          <span key={key} className="rounded border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-ink">
                            {key}
                          </span>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => pluginCatalogQuery.refetch()}
                      disabled={pluginCatalogQuery.isFetching}
                      className="w-fit rounded border border-hairline bg-surface-2 px-3 py-1 text-[11px] font-semibold text-ink transition hover:bg-surface-3 disabled:opacity-60"
                    >
                      {pluginCatalogQuery.isFetching ? "Retrying…" : "Retry"}
                    </button>
                  </div>
                ) : pluginCatalog.length === 0 ? (
                  <span className="text-[11px] text-ink-muted">The plugin catalog is empty, so there is nothing to permit yet.</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pluginCatalog.map((plugin) => (
                      <label
                        key={plugin.key}
                        className="flex cursor-pointer items-start gap-2.5 text-xs text-ink"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={(allowedPluginKeys ?? []).includes(plugin.key)}
                          onCheckedChange={(checked) => handlePluginKeyToggle(plugin.key, Boolean(checked))}
                          disabled={isSubmitting || !isOwnerOrAdmin}
                        />
                        <span className="flex flex-col gap-0.5">
                          <span className="font-semibold">{plugin.label}</span>
                          <span className="font-mono text-[10px] text-ink-muted">{plugin.key}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Keys the catalog does not claim. Kept visible and removable — see the
                    google_workspace split, which turned one saved key into three new ones and
                    left the old one matching nothing. */}
                {!pluginCatalogQuery.isError && unmatchedPluginKeys.length > 0 ? (
                  <div className="flex flex-col gap-2 border-t border-hairline pt-3">
                    <span className="text-[11px] text-amber-600">
                      These keys are permitted but match no plugin in the catalog, so they permit
                      nothing. They are usually left over from a plugin that was renamed or split.
                    </span>
                    <div className="flex flex-col gap-2">
                      {unmatchedPluginKeys.map((key) => (
                        <label key={key} className="flex cursor-pointer items-center gap-2.5 text-xs text-ink">
                          <Checkbox
                            checked
                            onCheckedChange={() => handlePluginKeyToggle(key, false)}
                            disabled={isSubmitting || !isOwnerOrAdmin}
                          />
                          <span className="font-mono text-[10px] text-ink-muted">{key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Member Plugin Installation */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <span className="text-xs font-semibold text-ink">Members can install plugins</span>
                <span className="text-[11px] text-ink-muted">When off, only Owners and Admins can install a plugin. Plugins already installed keep working.</span>
              </div>
              <Switch
                checked={watchAll.allowMemberPluginInstall}
                onCheckedChange={(val) => commitTopLevel("allowMemberPluginInstall", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

            {/*
              Owner-only, and DISABLED for an Admin rather than hidden.
              WorkspaceService.UpdateWorkspaceSettingsAsync gates this field with
              AllowExternalCollaboration and answers an Admin with 403. An Admin who cannot see
              the row has no way to learn that; an Admin who can see it live gets a switch that
              flicks, then a toast, then flicks back. So it renders, greyed, with the reason
              beside it — the same "Only the workspace owner can …" wording the invite dialog and
              the advanced page already use for a control the caller may read but not change.
            */}
            {/*
              And the copy says what the flag ACTUALLY does, which is less than its name
              promises. AssistantService's WorkspacePluginGuard enforces it only where an
              allowlist exists — there is where the allowlist IS the approval record, an admin
              adding a key being the approval. With no allowlist there is no approval store at
              all: plugin_installations has no pending state, no reviewer, no queue, and nothing
              tells an Owner a request is waiting, so the guard logs a warning and permits.
              Describing this row as a gate would promise a screen nobody has built.
            */}
            {/* Plugin Approval */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 max-w-[70%]">
                <span className="text-xs font-semibold text-ink">Require approval before a plugin runs</span>
                <span className="text-[11px] text-ink-muted">Records that plugins here are vetted. The allowlist above is the approval itself — a plugin counts as approved once an Owner or Admin ticks it.</span>
                {watchAll.requirePluginApproval && !allowlistEnforced ? (
                  <span className="text-[11px] text-amber-600">Nothing is enforced while no allowlist is configured — there is no separate approval queue. Turn on the allowlist above to make this mean something.</span>
                ) : null}
                {!isOwner ? (
                  <span className="text-[11px] text-amber-600">Only the workspace owner can change this setting.</span>
                ) : null}
              </div>
              <Switch
                checked={watchAll.requirePluginApproval}
                onCheckedChange={(val) => commitTopLevel("requirePluginApproval", val)}
                disabled={isSubmitting || !isOwner}
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

            {/*
              How membership is decided — a status, not a switch.

              This was a toggle. It could not be one: the value is derived from whether the
              workspace holds a verified domain, so a switch offered a second way to set one fact
              and let a workspace claim to require a domain while holding none. Adding the first
              domain below turns this on; revoking the last one turns it off.
            */}
            {/*
              How membership is decided — a status, not a control.

              This was a toggle. It could not be one: the value is derived from whether the
              workspace holds a verified domain, so a switch offered a second way to set one fact
              and let a workspace claim to require a domain while holding none.

              The domains themselves are managed in Advanced settings, not here. Adding one hands
              whoever holds this workspace the power to classify every future joiner on that
              domain as Internal — too much to sit one click away from the default language.
              Admins can read this summary; only the owner can change what it reports.
            */}
            <div className="py-3.5 px-4 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink">Internal membership</span>
                <span className="text-[11px] text-ink-muted">
                  {activeDomains.length > 0
                    ? `Decided by verified domain — ${activeDomains.join(", ")}. Only addresses on these domains can be invited as internal members.`
                    : "Assigned by hand. You choose internal or external for each person you invite."}
                </span>
                {isOwner && (
                  <Link
                    href={`/${activeWorkspaceSlug}/advanced`}
                    className="mt-0.5 w-fit text-[11px] font-medium text-primary hover:underline"
                  >
                    Manage verified domains in Advanced settings →
                  </Link>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  activeDomains.length > 0
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-hairline bg-surface-2 text-ink-muted"
                }`}
              >
                {activeDomains.length > 0 ? "Domain-verified" : "Manual"}
              </span>
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

          </div>
        </div>

      </div>
    </div>
  );
}
