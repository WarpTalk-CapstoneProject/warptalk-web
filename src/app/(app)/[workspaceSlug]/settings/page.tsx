"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Lock,
  Spinner,
  Copy,
  Checks,
  Warning,
} from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { languagesInScope } from "@/lib/language/languages";
import { LanguageLabel } from "@/components/language/language-label";
import type {
  MinutesClassification,
  MinutesTemplate,
  WorkspaceSettingsDto,
} from "@/types/workspace";
import {
  useWorkspace,
  useWorkspaceSettings,
  usePatchWorkspaceSettings,
} from "@/hooks/use-workspace";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAutoSaveQueue } from "@/hooks/use-auto-save";
import { AutoSaveStatusBadge } from "@/components/features/settings/auto-save-status-badge";
import { parseIntegerInRange } from "@/lib/workspace/settings-validation";
import { describeLanguageCeiling, describeRoomCeiling } from "@/lib/workspace/room-ceiling-notice";
import { describeTimeZone, supportedTimeZones } from "@/lib/format/time-zones";

function getSettingsSchema(t: ReturnType<typeof useTranslations>) {
  return z.object({
    defaultLanguage: z.string().min(1, t("validation.defaultLanguageRequired")),
    timezone: z.string().min(1, t("validation.timezoneRequired")),
    maxActiveRooms: z
      .number()
      .int(t("validation.wholeNumber"))
      .min(1, t("validation.maxActiveRoomsMin"))
      .max(50, t("validation.maxActiveRoomsMax")),
    artifactRetentionDays: z
      .number()
      .int(t("validation.wholeNumber"))
      .min(0, t("validation.retentionMin"))
      .max(3650, t("validation.retentionMax")),
    // Enumerated rather than free text, and spelled the way the backend spells them. The server
    // compares ordinally and refuses an unrecognised value instead of rounding it to the nearest
    // supported one, so a picker that can only emit these strings is what keeps the two ends
    // agreeing — there is no casing this form could invent that the save would forgive.
    minutesClassification: z.enum(["Internal", "Confidential", "Public"]),
    minutesTemplate: z.enum(["vn-nd30", "global-en"]),
    invitationExpiryDays: z
      .number()
      .int(t("validation.wholeNumber"))
      .min(1, t("validation.invitationExpiryMin"))
      .max(365, t("validation.invitationExpiryMax")),
    voiceCloningEnabled: z.boolean(),
    isProfanityFilterEnabled: z.boolean(),
    allowAnyPlugins: z.boolean(),
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
}

type SettingsFormData = z.infer<ReturnType<typeof getSettingsSchema>>;
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

// The classification values are already the words a reader wants, so they are their own labels —
// wrapping "Internal" in a lookup that returns "Internal" would only invite the two to drift.
const minutesClassificationOptions: MinutesClassification[] = ["Internal", "Confidential", "Public"];

// The template values are not translated: "vn-nd30" and "global-en" are filing-convention ids the
// backend stores and the document writer switches on, and the value underneath is what travels
// to the server, unchanged. Only the labels an Owner reads are — see getMinutesTemplateOptions.
function getMinutesTemplateOptions(
  t: ReturnType<typeof useTranslations>,
): { value: MinutesTemplate; label: string }[] {
  return [
    { value: "vn-nd30", label: t("general.minutesTemplate.optionVietnamese") },
    { value: "global-en", label: t("general.minutesTemplate.optionInternational") },
  ];
}

const DEFAULT_SETTINGS_FORM_DATA: SettingsFormData = {
  defaultLanguage: "en",
  timezone: "UTC",
  maxActiveRooms: 5,
  artifactRetentionDays: 30,
  // Both mirror the server's defaults (WorkspaceConstants). They are real postures rather than
  // placeholders: Internal because the safe direction to be wrong in on a classification is the
  // closed one, and vn-nd30 because it is the document this system already exports — a workspace
  // that has never opened this control is not asking for a new house style.
  minutesClassification: "Internal",
  minutesTemplate: "vn-nd30",
  invitationExpiryDays: 7,
  voiceCloningEnabled: true,
  isProfanityFilterEnabled: false,
  allowAnyPlugins: true,
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
    minutesClassification: settings.minutesClassification ?? DEFAULT_SETTINGS_FORM_DATA.minutesClassification,
    minutesTemplate: settings.minutesTemplate ?? DEFAULT_SETTINGS_FORM_DATA.minutesTemplate,
    invitationExpiryDays: settings.invitationExpiryDays ?? DEFAULT_SETTINGS_FORM_DATA.invitationExpiryDays,
    voiceCloningEnabled: settings.voiceCloningEnabled ?? DEFAULT_SETTINGS_FORM_DATA.voiceCloningEnabled,
    isProfanityFilterEnabled: settings.isProfanityFilterEnabled ?? DEFAULT_SETTINGS_FORM_DATA.isProfanityFilterEnabled,
    allowAnyPlugins: settings.allowAnyPlugins ?? DEFAULT_SETTINGS_FORM_DATA.allowAnyPlugins,
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
  const t = useTranslations("settingsWorkspace");
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);
  const { setActiveWorkspace, activeWorkspaceSlug, membershipType, canCreateMeetings } =
    useWorkspaceStore();

  // Queries & Mutations
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const patchSettingsMutation = usePatchWorkspaceSettings(activeWorkspaceId || "");
  const initializedWorkspaceRef = useRef<string | null>(null);
  const lastQueuedValuesRef = useRef<Record<string, string>>({});

  const settingsSchema = useMemo(() => getSettingsSchema(t), [t]);
  const minutesTemplateOptions = useMemo(() => getMinutesTemplateOptions(t), [t]);
  const describeMinutesTemplate = useCallback(
    (value: string) =>
      minutesTemplateOptions.find((option) => option.value === value)?.label ?? value,
    [minutesTemplateOptions],
  );

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
    t: (key, values) => t(`general.maxActiveRooms.ceiling.${key}`, values),
  }).message;

  // WT-500 — the plan's per-meeting language quota, which is enforced at meeting creation and
  // used to be invisible everywhere else. Counted off the live form value rather than the saved
  // settings so the notice appears the moment an Owner ticks the language that crosses the line,
  // not after they navigate away and come back.
  const languageCeilingNotice = describeLanguageCeiling({
    ceiling: settings?.maxLanguagesCeiling,
    allowedCount: (watchAll.allowedTargetLanguages || []).length,
    source: settings?.maxLanguagesCeilingSource,
    t: (key, values) => t(`general.allowedTargetLanguages.ceiling.${key}`, values),
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
        || t("toasts.saveFailed");
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
            <CardTitle className="text-lg font-bold">{t("accessDenied.title")}</CardTitle>
            <CardDescription className="text-xs">
              {t("accessDenied.description")}
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
            <CardTitle className="text-lg font-bold">{t("loadError.title")}</CardTitle>
            <CardDescription className="text-xs">
              {t("loadError.description")}
            </CardDescription>
          </CardHeader>
          <button
            type="button"
            onClick={() => settingsQuery.refetch()}
            disabled={settingsQuery.isFetching}
            className="mx-auto mt-2 inline-flex h-9 items-center rounded-md border border-hairline bg-surface-2 px-4 text-xs font-semibold transition hover:bg-surface-3 disabled:opacity-60"
          >
            {settingsQuery.isFetching ? t("loadError.retrying") : t("loadError.retry")}
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

  const effectiveSaveStatus = autoSave.status;

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8 text-ink">

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight text-ink">{t("heading")}</h1>
          <p className="text-xs text-ink-muted">{t("subheading")}</p>
        </div>
        <AutoSaveStatusBadge
          status={effectiveSaveStatus}
          invalid={Object.keys(errors).length > 0}
          onRetry={Object.keys(errors).length === 0 ? autoSave.retry : undefined}
        />
      </div>

      {/* Workspace Link & Slug Card */}
      <div className="flex flex-col gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{t("workspaceInfo.heading")}</div>
        <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">

          {/* Slug Row */}
          <div className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-ink">{t("workspaceInfo.slugLabel")}</span>
              <span className="text-[11px] text-ink-muted">{t("workspaceInfo.slugDescription")}</span>
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
                    toast.success(t("toasts.slugCopied"));
                  }
                }}
                className="absolute right-2.5 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title={t("workspaceInfo.copySlug")}
              >
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* URL Row */}
          <div className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-ink">{t("workspaceInfo.urlLabel")}</span>
              <span className="text-[11px] text-ink-muted">{t("workspaceInfo.urlDescription")}</span>
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
                    toast.success(t("toasts.urlCopied"));
                  }
                }}
                className="absolute right-2.5 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title={t("workspaceInfo.copyUrl")}
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
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{t("general.heading")}</div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">

            {/* Default Language */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">{t("general.defaultLanguage.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("general.defaultLanguage.description")}</span>
              </div>
              <Select
                value={watchAll.defaultLanguage}
                onValueChange={(val) => val && commitTopLevel("defaultLanguage", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue>
                    {(value) =>
                      value ? <LanguageLabel value={String(value)} /> : t("general.defaultLanguage.placeholder")
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
                <span className="text-xs font-semibold text-ink">{t("general.timezone.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("general.timezone.description")}</span>
              </div>
              <Select
                value={watchAll.timezone}
                onValueChange={(val) => val && commitTopLevel("timezone", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue>
                    {(value) =>
                      value ? describeTimeZone(String(value)) : t("general.timezone.placeholder")
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
                <span className="text-xs font-semibold text-ink">{t("general.maxActiveRooms.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("general.maxActiveRooms.description")}</span>
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
                <span className="text-xs font-semibold text-ink">{t("general.artifactRetentionDays.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("general.artifactRetentionDays.description")}</span>
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

            {/* Minutes Classification — sits directly under retention on purpose. Retention says
                how long a record is kept, classification says who it is for, and the template
                says how it is filed; all three are printed together in the policy block on the
                face of the minutes document, so splitting them across the page would ask an Owner
                to assemble the workspace's records policy from three separate places. */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">{t("general.minutesClassification.label")}</span>
                <span className="text-[11px] text-ink-muted">
                  {t("general.minutesClassification.description")}
                </span>
              </div>
              <Select
                value={watchAll.minutesClassification}
                onValueChange={(val) => val && commitTopLevel("minutesClassification", val as MinutesClassification)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue>
                    {(value) => (value ? String(value) : t("general.minutesClassification.placeholder"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {minutesClassificationOptions.map((classification) => (
                    <SelectItem key={classification} value={classification} className="text-xs">
                      {classification}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Minutes Template */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">{t("general.minutesTemplate.label")}</span>
                <span className="text-[11px] text-ink-muted">
                  {t("general.minutesTemplate.description")}
                </span>
              </div>
              <Select
                value={watchAll.minutesTemplate}
                onValueChange={(val) => val && commitTopLevel("minutesTemplate", val as MinutesTemplate)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              >
                <SelectTrigger className="w-[200px] h-8 text-xs bg-surface-2 border-hairline">
                  <SelectValue>
                    {(value) => (value ? describeMinutesTemplate(String(value)) : t("general.minutesTemplate.placeholder"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {minutesTemplateOptions.map((template) => (
                    <SelectItem key={template.value} value={template.value} className="text-xs">
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Invitation expiry moved to Settings › Security (2026-09-16) — how long a way IN
                stays open is an access question, and it now sits beside the rest of them. */}

            {/* Allowed Target Languages */}
            <div className="py-3.5 px-4 flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">{t("general.allowedTargetLanguages.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("general.allowedTargetLanguages.description")}</span>
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
                <span className="text-xs font-semibold text-ink">{t("general.voiceCloning.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("general.voiceCloning.description")}</span>
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
                <span className="text-xs font-semibold text-ink">{t("general.profanityFilter.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("general.profanityFilter.description")}</span>
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
                <span className="text-xs font-semibold text-ink">{t("general.allowPersonalPlugins.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("general.allowPersonalPlugins.description")}</span>
              </div>
              <Switch
                checked={watchAll.allowAnyPlugins}
                onCheckedChange={(val) => commitTopLevel("allowAnyPlugins", val)}
                disabled={isSubmitting || !isOwnerOrAdmin}
              />
            </div>

          </div>
        </div>

        {/* External collaboration and the internal-membership status moved to
            Settings › Security (2026-09-16), where verified domains — the thing that decides what
            that status reports — now lives beside them. */}

        {/* Section 2: AI & translation */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{t("aiTranslation.heading")}</div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">

            {/* Global Glossary */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">{t("aiTranslation.useGlobalGlossary.label")}</span>
                <span className="text-[11px] text-ink-muted">{t("aiTranslation.useGlobalGlossary.description")}</span>
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

            {/* PII redaction and the restricted-keyword list moved to Settings › Security
                (2026-09-16). They decide what LEAVES a meeting, which is an access question; the
                glossary above decides how words are translated, which is not. */}

          </div>
        </div>

      </div>
    </div>
  );
}
