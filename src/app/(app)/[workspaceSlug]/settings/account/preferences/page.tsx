"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Spinner, Fingerprint, CheckCircle, XCircle, ShieldCheck } from "@phosphor-icons/react";

import { languagesInScope } from "@/lib/languages";
import { authService } from "@/services/auth.service";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { UpdateUserSettingsRequest } from "@/types/auth";
import { useAutoSaveQueue } from "@/hooks/use-auto-save";
import { AutoSaveStatusBadge } from "@/components/features/settings/auto-save-status-badge";
import { parseIntegerInRange } from "@/lib/settings-validation";

const preferencesSchema = z.object({
  defaultSpeakLanguage: z.string().min(1, "Required"),
  defaultListenLanguage: z.string().min(1, "Required"),
  voiceCloneEnabled: z.boolean(),
  micNoiseSuppression: z.boolean(),
  defaultTranslationRoomType: z.string().min(1, "Required"),
  autoRecordTranslationRooms: z.boolean(),
  autoGenerateSummary: z.boolean(),
  defaultMaxParticipants: z.number().int("Must be a whole number").min(1, "At least 1 participant").max(500, "Max 500"),
  theme: z.string().min(1, "Required"),
  transcriptFontSize: z.number().int("Must be a whole number").min(10, "Min 10px").max(32, "Max 32px"),
  showOriginalTranscript: z.boolean(),
  showTranslatedTranscript: z.boolean(),
  highContrast: z.boolean(),
  screenReaderMode: z.boolean(),
});

type PreferencesFormData = z.infer<typeof preferencesSchema>;

// Default speak/listen language — meeting languages, so they come from the registry.
const languages = languagesInScope("meeting").map((language) => ({
  code: language.code,
  label: language.name,
}));

export default function PersonalPreferencesPage() {
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const lastQueuedValuesRef = useRef<Record<string, string>>({});
  const [showConsentModal, setShowConsentModal] = useState(false);

  // Load preferences from Auth Service API
  const { data: settingsData, isLoading, error, refetch } = useQuery({
    queryKey: ["personal-settings"],
    queryFn: async () => {
      const res = await authService.getSettings();
      return res.data;
    },
  });

  // Save mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<UpdateUserSettingsRequest>) => {
      const res = await authService.updateSettings(data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["personal-settings"], data);
    },
  });

  const {
    register,
    setValue,
    watch,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesSchema),
  });

  const watchAll = watch();

  const savePreference = useCallback(
    (patch: Partial<UpdateUserSettingsRequest>) => updateSettingsMutation.mutateAsync(patch),
    [updateSettingsMutation],
  );
  const autoSave = useAutoSaveQueue<Partial<UpdateUserSettingsRequest>>({
    save: savePreference,
    onError: () => toast.error("Failed to update preferences"),
  });

  useEffect(() => {
    if (settingsData && !initializedRef.current) {
      const initialValues: PreferencesFormData = {
        defaultSpeakLanguage: settingsData.defaultSpeakLanguage || "en",
        defaultListenLanguage: settingsData.defaultListenLanguage || "en",
        voiceCloneEnabled: settingsData.voiceCloneEnabled ?? false,
        micNoiseSuppression: settingsData.micNoiseSuppression ?? true,
        defaultTranslationRoomType: settingsData.defaultTranslationRoomType || "instant",
        autoRecordTranslationRooms: settingsData.autoRecordTranslationRooms ?? false,
        autoGenerateSummary: settingsData.autoGenerateSummary ?? false,
        defaultMaxParticipants: settingsData.defaultMaxParticipants ?? 10,
        theme: settingsData.theme || "system",
        transcriptFontSize: settingsData.transcriptFontSize ?? 14,
        showOriginalTranscript: settingsData.showOriginalTranscript ?? true,
        showTranslatedTranscript: settingsData.showTranslatedTranscript ?? true,
        highContrast: settingsData.highContrast ?? false,
        screenReaderMode: settingsData.screenReaderMode ?? false,
      };
      reset(initialValues);
      lastQueuedValuesRef.current = Object.fromEntries(
        Object.entries(initialValues).map(([key, value]) => [key, JSON.stringify(value)]),
      );
      initializedRef.current = true;
    }
  }, [settingsData, reset]);

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-canvas">
        <Spinner className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[80vh] items-center justify-center text-center bg-canvas text-ink">
        <div className="max-w-md border border-hairline bg-surface-1 p-6 rounded-lg shadow-sm flex flex-col items-center gap-3">
          <p className="text-sm font-semibold text-destructive">Failed to load personal settings.</p>
          <p className="text-xs text-ink-muted">Please make sure the backend services are running.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 px-4 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const queuePreference = <K extends keyof PreferencesFormData>(field: K, value: PreferencesFormData[K]) => {
    setValue(field as never, value as never, { shouldDirty: true, shouldValidate: true });
    const serializedValue = JSON.stringify(value);
    if (lastQueuedValuesRef.current[String(field)] === serializedValue) return;
    lastQueuedValuesRef.current[String(field)] = serializedValue;
    autoSave.enqueue({ [field]: value } as Partial<UpdateUserSettingsRequest>);
  };

  const handleVoiceCloneToggle = (checked: boolean) => {
    if (checked) {
      setShowConsentModal(true);
    } else {
      queuePreference("voiceCloneEnabled", false);
    }
  };

  const confirmEnableConsent = () => {
    setShowConsentModal(false);
    queuePreference("voiceCloneEnabled", true);
    toast.success("Voice cloning consent granted.");
  };

  const commitNumericField = (field: "defaultMaxParticipants" | "transcriptFontSize", rawValue: string) => {
    const limits = field === "defaultMaxParticipants" ? [1, 500] : [10, 32];
    const parsedInput = parseIntegerInRange(rawValue, limits[0], limits[1]);
    const value = parsedInput.value;
    setValue(field, value, { shouldDirty: true, shouldValidate: true });
    if (!parsedInput.ok) return;
    queuePreference(field, value);
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8 text-ink">
      
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight text-ink">Settings</h1>
          <p className="text-xs text-ink-muted">Configure your personal language preferences, client audio setup, and layout settings.</p>
        </div>
        <AutoSaveStatusBadge
          status={autoSave.status}
          invalid={Object.keys(errors).length > 0}
          onRetry={Object.keys(errors).length === 0 ? autoSave.retry : undefined}
        />
      </div>

      <div className="flex flex-col gap-8">
        
        {/* Section 1: Translation & Languages */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Translation & Languages
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            
            {/* Speak Lang */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Default Speak Language</span>
                <span className="text-[11px] text-ink-muted">The default language you will speak during translated sessions.</span>
              </div>
              <Select
                value={watchAll.defaultSpeakLanguage}
                onValueChange={(val) => queuePreference("defaultSpeakLanguage", val || "")}
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code} className="text-xs cursor-pointer">
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Listen Lang */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Default Listen Language</span>
                <span className="text-[11px] text-ink-muted">The language you wish to hear or see translated transcripts in.</span>
              </div>
              <Select
                value={watchAll.defaultListenLanguage}
                onValueChange={(val) => queuePreference("defaultListenLanguage", val || "")}
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code} className="text-xs cursor-pointer">
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </div>

        {/* Section 2: Voice Cloning & Consent Preferences */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5 text-primary" weight="bold" />
              Voice Cloning & Consent Preferences
            </div>
            {watchAll.voiceCloneEnabled ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle className="w-3.5 h-3.5" weight="fill" /> Consent Granted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20">
                <XCircle className="w-3.5 h-3.5" weight="fill" /> Consent Withdrawn
              </span>
            )}
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            
            {/* Voice Clone Consent Authorization */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1 max-w-md">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink">Enable Voice Cloning Consent</span>
                </div>
                <span className="text-[11px] text-ink-muted leading-relaxed">
                  Authorize WarpTalk to sample and synthesize your voice during live translated calls using your approved voice profiles.
                </span>
              </div>
              <Switch
                checked={watchAll.voiceCloneEnabled}
                onCheckedChange={handleVoiceCloneToggle}
                disabled={isSubmitting}
              />
            </div>

            {/* Microphone Noise Suppression */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Microphone Noise Suppression</span>
                <span className="text-[11px] text-ink-muted">Filter background static noise during translation calls.</span>
              </div>
              <Switch
                checked={watchAll.micNoiseSuppression}
                onCheckedChange={(val) => queuePreference("micNoiseSuppression", val)}
                disabled={isSubmitting}
              />
            </div>

          </div>

          {/* Compliance & Privacy Note */}
          <div className="p-3 border border-hairline/60 bg-surface-2/40 rounded-lg flex items-start gap-2.5 text-ink-muted">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" weight="duotone" />
            <p className="text-[11px] leading-normal">
              <strong className="font-semibold text-ink">Biometric Voice Privacy Notice:</strong> Your consent preference controls whether AI dubbing synthesized streams use your personalized voice. You can grant or withdraw your authorization at any time.
            </p>
          </div>
        </div>

        {/* Section 3: Meeting Defaults */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Meeting Presets
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            
            {/* Room Type */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Default Room Connection Type</span>
                <span className="text-[11px] text-ink-muted">Preferred streaming protocol for your rooms.</span>
              </div>
              <Select
                value={watchAll.defaultTranslationRoomType}
                onValueChange={(val) => queuePreference("defaultTranslationRoomType", val || "")}
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant" className="text-xs cursor-pointer">Instant Room</SelectItem>
                  <SelectItem value="scheduled" className="text-xs cursor-pointer">Scheduled Room</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Auto Record */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Auto Record Translation Rooms</span>
                <span className="text-[11px] text-ink-muted">Automatically record and save audio stream inputs when starting a meeting.</span>
              </div>
              <Switch
                checked={watchAll.autoRecordTranslationRooms}
                onCheckedChange={(val) => queuePreference("autoRecordTranslationRooms", val)}
                disabled={isSubmitting}
              />
            </div>

            {/* Auto Summary */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Auto Generate AI Summaries</span>
                <span className="text-[11px] text-ink-muted">Trigger AI summaries and transcripts immediately when meetings conclude.</span>
              </div>
              <Switch
                checked={watchAll.autoGenerateSummary}
                onCheckedChange={(val) => queuePreference("autoGenerateSummary", val)}
                disabled={isSubmitting}
              />
            </div>

            {/* Max Participants */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Default Max Participants</span>
                <span className="text-[11px] text-ink-muted">Set the default capacity limit for rooms created by you.</span>
              </div>
              <Input
                type="number"
                min={1}
                max={500}
                className="h-8 border-hairline focus:ring-1 focus:ring-primary text-xs bg-surface-2/40 w-[80px] text-right"
                {...register("defaultMaxParticipants", { valueAsNumber: true })}
                onBlur={(event) => commitNumericField("defaultMaxParticipants", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitNumericField("defaultMaxParticipants", event.currentTarget.value);
                    event.currentTarget.blur();
                  }
                }}
                disabled={isSubmitting}
              />
              {errors.defaultMaxParticipants?.message && (
                <span className="text-[11px] text-destructive">{errors.defaultMaxParticipants.message}</span>
              )}
            </div>

          </div>
        </div>

        {/* Section 4: Accessibility & Theme */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Accessibility & Styling
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            
            {/* Theme */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Interface Theme</span>
                <span className="text-[11px] text-ink-muted">Select your personal default display style.</span>
              </div>
              <Select
                value={watchAll.theme}
                onValueChange={(val) => queuePreference("theme", val || "")}
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select theme..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light" className="text-xs cursor-pointer">Light Mode</SelectItem>
                  <SelectItem value="dark" className="text-xs cursor-pointer">Dark Mode</SelectItem>
                  <SelectItem value="system" className="text-xs cursor-pointer">System Default</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Font Size */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Transcript Font Size (px)</span>
                <span className="text-[11px] text-ink-muted">Adjust size parameters of subtitles and active chat bubbles.</span>
              </div>
              <Input
                type="number"
                min={10}
                max={32}
                className="h-8 border-hairline focus:ring-1 focus:ring-primary text-xs bg-surface-2/40 w-[80px] text-right"
                {...register("transcriptFontSize", { valueAsNumber: true })}
                onBlur={(event) => commitNumericField("transcriptFontSize", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitNumericField("transcriptFontSize", event.currentTarget.value);
                    event.currentTarget.blur();
                  }
                }}
                disabled={isSubmitting}
              />
              {errors.transcriptFontSize?.message && (
                <span className="text-[11px] text-destructive">{errors.transcriptFontSize.message}</span>
              )}
            </div>

            {/* Original Transcripts */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Show Original Transcripts</span>
                <span className="text-[11px] text-ink-muted">Display untranslated spoken text alongside translations.</span>
              </div>
              <Switch
                checked={watchAll.showOriginalTranscript}
                onCheckedChange={(val) => queuePreference("showOriginalTranscript", val)}
                disabled={isSubmitting}
              />
            </div>

            {/* Translated Transcripts */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Show Translated Subtitles</span>
                <span className="text-[11px] text-ink-muted">Enable translated stream outputs on the display screen.</span>
              </div>
              <Switch
                checked={watchAll.showTranslatedTranscript}
                onCheckedChange={(val) => queuePreference("showTranslatedTranscript", val)}
                disabled={isSubmitting}
              />
            </div>

            {/* High Contrast */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">High Contrast Accessibility</span>
                <span className="text-[11px] text-ink-muted">Boost readability with deep contrast foreground ratios.</span>
              </div>
              <Switch
                checked={watchAll.highContrast}
                onCheckedChange={(val) => queuePreference("highContrast", val)}
                disabled={isSubmitting}
              />
            </div>

            {/* Screen Reader */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Screen Reader Compatibility</span>
                <span className="text-[11px] text-ink-muted">Enable optimized ARIA tag streams for assistive technology.</span>
              </div>
              <Switch
                checked={watchAll.screenReaderMode}
                onCheckedChange={(val) => queuePreference("screenReaderMode", val)}
                disabled={isSubmitting}
              />
            </div>

          </div>
        </div>

      </div>

      {/* Voice Cloning Consent Confirmation Dialog */}
      <Dialog open={showConsentModal} onOpenChange={setShowConsentModal}>
        <DialogContent className="bg-surface-1 border-hairline text-ink rounded-xl sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink">
              <Fingerprint className="w-5 h-5 text-primary" weight="bold" />
              Grant Voice Cloning Authorization?
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted pt-2 leading-relaxed">
              By enabling voice cloning consent, you authorize WarpTalk to sample and synthesize your audio stream during translated calls using Cartesia voice synthesis. Your voice data will be processed strictly for generating real-time dubbing for meeting participants.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-surface-2/60 border border-hairline rounded-lg text-[11px] text-ink-muted space-y-1">
            <p className="font-semibold text-ink">Key Privacy Points:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Consent applies across all translation sessions.</li>
              <li>You can withdraw consent at any time from this page.</li>
              <li>Withdrawing consent immediately falls back to standard AI voices.</li>
            </ul>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowConsentModal(false)}
              className="h-8 text-xs border-hairline hover:bg-surface-2"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmEnableConsent}
              className="h-8 text-xs bg-primary hover:bg-primary/90 text-white font-medium"
            >
              I Agree & Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
