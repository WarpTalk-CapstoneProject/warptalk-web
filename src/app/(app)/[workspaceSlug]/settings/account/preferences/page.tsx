"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowCounterClockwise, Check, Spinner } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { languagesInScope } from "@/lib/languages";
import { authService } from "@/services/auth.service";

const preferencesSchema = z.object({
  defaultSpeakLanguage: z.string().min(1, "Required"),
  defaultListenLanguage: z.string().min(1, "Required"),
  voiceCloneEnabled: z.boolean(),
  micNoiseSuppression: z.boolean(),
  defaultTranslationRoomType: z.string().min(1, "Required"),
  autoRecordTranslationRooms: z.boolean(),
  autoGenerateSummary: z.boolean(),
  defaultMaxParticipants: z
    .number()
    .min(1, "At least 1 participant")
    .max(100, "Max 100"),
  theme: z.string().min(1, "Required"),
  transcriptFontSize: z.number().min(10, "Min 10px").max(32, "Max 32px"),
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
  // Load preferences from Auth Service API
  const {
    data: settingsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["personal-settings"],
    queryFn: async () => {
      const res = await authService.getSettings();
      return res.data;
    },
  });

  // Save mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: PreferencesFormData) => {
      const res = await authService.updateSettings(data);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success("Preferences updated successfully.");
      queryClient.setQueryData(["personal-settings"], data);
    },
    onError: () => {
      toast.error("Failed to update preferences");
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesSchema),
  });

  const watchAll = useWatch({ control });

  useEffect(() => {
    if (settingsData) {
      reset({
        defaultSpeakLanguage: settingsData.defaultSpeakLanguage || "en",
        defaultListenLanguage: settingsData.defaultListenLanguage || "en",
        voiceCloneEnabled: settingsData.voiceCloneEnabled ?? true,
        micNoiseSuppression: settingsData.micNoiseSuppression ?? true,
        defaultTranslationRoomType:
          settingsData.defaultTranslationRoomType || "webrtc",
        autoRecordTranslationRooms:
          settingsData.autoRecordTranslationRooms ?? false,
        autoGenerateSummary: settingsData.autoGenerateSummary ?? false,
        defaultMaxParticipants: settingsData.defaultMaxParticipants ?? 10,
        theme: settingsData.theme || "system",
        transcriptFontSize: settingsData.transcriptFontSize ?? 14,
        showOriginalTranscript: settingsData.showOriginalTranscript ?? true,
        showTranslatedTranscript: settingsData.showTranslatedTranscript ?? true,
        highContrast: settingsData.highContrast ?? false,
        screenReaderMode: settingsData.screenReaderMode ?? false,
      });
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
        <div className="max-w-md border border-hairline bg-surface-1 p-6 rounded-lg shadow-sm">
          <p className="text-sm font-semibold text-destructive">
            Failed to load personal settings.
          </p>
          <p className="text-xs text-ink-muted mt-1">
            Please make sure the backend services are running.
          </p>
        </div>
      </div>
    );
  }

  const handlePreferencesSubmit = (formData: PreferencesFormData) => {
    updateSettingsMutation.mutate(formData);
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8 text-ink">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="text-xs text-ink-muted">
          Configure your personal language preferences, client audio setup, and
          layout settings.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(handlePreferencesSubmit)}
        className="flex flex-col gap-8"
      >
        {/* Section 1: Translation & Languages */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Translation & Languages
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            {/* Speak Lang */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Default Speak Language
                </span>
                <span className="text-[11px] text-ink-muted">
                  The default language you will speak during translated
                  sessions.
                </span>
              </div>
              <Select
                value={watchAll.defaultSpeakLanguage}
                onValueChange={(val) =>
                  setValue("defaultSpeakLanguage", val || "", {
                    shouldDirty: true,
                  })
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

            {/* Listen Lang */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Default Listen Language
                </span>
                <span className="text-[11px] text-ink-muted">
                  The language you wish to hear or see translated transcripts
                  in.
                </span>
              </div>
              <Select
                value={watchAll.defaultListenLanguage}
                onValueChange={(val) =>
                  setValue("defaultListenLanguage", val || "", {
                    shouldDirty: true,
                  })
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
          </div>
        </div>

        {/* Section 2: Audio Preferences */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Audio & Suppression
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            {/* Voice Clone */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Enable Voice Cloning
                </span>
                <span className="text-[11px] text-ink-muted">
                  Synthesize translations using your approved voice profiles.
                </span>
              </div>
              <Switch
                checked={watchAll.voiceCloneEnabled}
                onCheckedChange={(val) =>
                  setValue("voiceCloneEnabled", val, { shouldDirty: true })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Noise Suppression */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Microphone Noise Suppression
                </span>
                <span className="text-[11px] text-ink-muted">
                  Filter background static noise during translation calls.
                </span>
              </div>
              <Switch
                checked={watchAll.micNoiseSuppression}
                onCheckedChange={(val) =>
                  setValue("micNoiseSuppression", val, { shouldDirty: true })
                }
                disabled={isSubmitting}
              />
            </div>
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
                <span className="text-xs font-semibold text-ink">
                  Default Room Connection Type
                </span>
                <span className="text-[11px] text-ink-muted">
                  Preferred streaming protocol for your rooms.
                </span>
              </div>
              <Select
                value={watchAll.defaultTranslationRoomType}
                onValueChange={(val) =>
                  setValue("defaultTranslationRoomType", val || "", {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webrtc" className="text-xs cursor-pointer">
                    WebRTC (Ultra Low Latency)
                  </SelectItem>
                  <SelectItem value="hls" className="text-xs cursor-pointer">
                    HLS (Low Latency Broadcaster)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Auto Record */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Auto Record Translation Rooms
                </span>
                <span className="text-[11px] text-ink-muted">
                  Automatically record and save audio stream inputs when
                  starting a meeting.
                </span>
              </div>
              <Switch
                checked={watchAll.autoRecordTranslationRooms}
                onCheckedChange={(val) =>
                  setValue("autoRecordTranslationRooms", val, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Auto Summary */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Auto Generate AI Summaries
                </span>
                <span className="text-[11px] text-ink-muted">
                  Trigger AI summaries and transcripts immediately when meetings
                  conclude.
                </span>
              </div>
              <Switch
                checked={watchAll.autoGenerateSummary}
                onCheckedChange={(val) =>
                  setValue("autoGenerateSummary", val, { shouldDirty: true })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Max Participants */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Default Max Participants
                </span>
                <span className="text-[11px] text-ink-muted">
                  Set the default capacity limit for rooms created by you.
                </span>
              </div>
              <Input
                type="number"
                className="h-8 border-hairline focus:ring-1 focus:ring-primary text-xs bg-surface-2/40 w-[80px] text-right"
                {...register("defaultMaxParticipants", { valueAsNumber: true })}
                disabled={isSubmitting}
              />
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
                <span className="text-xs font-semibold text-ink">
                  Interface Theme
                </span>
                <span className="text-[11px] text-ink-muted">
                  Select your personal default display style.
                </span>
              </div>
              <Select
                value={watchAll.theme}
                onValueChange={(val) =>
                  setValue("theme", val || "", { shouldDirty: true })
                }
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[180px] cursor-pointer">
                  <SelectValue placeholder="Select theme..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light" className="text-xs cursor-pointer">
                    Light Mode
                  </SelectItem>
                  <SelectItem value="dark" className="text-xs cursor-pointer">
                    Dark Mode
                  </SelectItem>
                  <SelectItem value="system" className="text-xs cursor-pointer">
                    System Default
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Font Size */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Transcript Font Size (px)
                </span>
                <span className="text-[11px] text-ink-muted">
                  Adjust size parameters of subtitles and active chat bubbles.
                </span>
              </div>
              <Input
                type="number"
                className="h-8 border-hairline focus:ring-1 focus:ring-primary text-xs bg-surface-2/40 w-[80px] text-right"
                {...register("transcriptFontSize", { valueAsNumber: true })}
                disabled={isSubmitting}
              />
            </div>

            {/* Original Transcripts */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Show Original Transcripts
                </span>
                <span className="text-[11px] text-ink-muted">
                  Display untranslated spoken text alongside translations.
                </span>
              </div>
              <Switch
                checked={watchAll.showOriginalTranscript}
                onCheckedChange={(val) =>
                  setValue("showOriginalTranscript", val, { shouldDirty: true })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Translated Transcripts */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Show Translated Subtitles
                </span>
                <span className="text-[11px] text-ink-muted">
                  Enable translated stream outputs on the display screen.
                </span>
              </div>
              <Switch
                checked={watchAll.showTranslatedTranscript}
                onCheckedChange={(val) =>
                  setValue("showTranslatedTranscript", val, {
                    shouldDirty: true,
                  })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* High Contrast */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  High Contrast Accessibility
                </span>
                <span className="text-[11px] text-ink-muted">
                  Boost readability with deep contrast foreground ratios.
                </span>
              </div>
              <Switch
                checked={watchAll.highContrast}
                onCheckedChange={(val) =>
                  setValue("highContrast", val, { shouldDirty: true })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Screen Reader */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">
                  Screen Reader Compatibility
                </span>
                <span className="text-[11px] text-ink-muted">
                  Enable optimized ARIA tag streams for assistive technology.
                </span>
              </div>
              <Switch
                checked={watchAll.screenReaderMode}
                onCheckedChange={(val) =>
                  setValue("screenReaderMode", val, { shouldDirty: true })
                }
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="pt-4 border-t border-hairline flex justify-end gap-3">
          {isDirty && (
            <button
              type="button"
              onClick={() => reset()}
              disabled={isSubmitting}
              className="flex h-8 px-4 items-center justify-center gap-1.5 rounded bg-surface-2 hover:bg-surface-3 transition text-xs border border-hairline cursor-pointer text-ink"
            >
              <ArrowCounterClockwise size={13} />
              Reset
            </button>
          )}
          <button
            type="submit"
            className="flex h-8 px-5 items-center justify-center gap-2 rounded bg-primary font-medium text-white transition hover:bg-primary-hover disabled:opacity-50 text-xs cursor-pointer shadow-sm"
            disabled={
              isSubmitting || updateSettingsMutation.isPending || !isDirty
            }
          >
            {updateSettingsMutation.isPending ? (
              <Spinner className="h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <>
                <Check size={14} />
                Save Preferences
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
