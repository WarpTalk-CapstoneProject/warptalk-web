"use client";

import { CheckCircle, Info, Spinner, Translate, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePublicSystemLanguages, type SystemLanguage } from "@/hooks/use-system-languages";
import { useWorkspaceSettings, useUpdateWorkspaceSettings } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function WorkspaceLanguagesSettingsPage() {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  const {
    data: settings,
    isLoading: isSettingsLoading,
    isError: isSettingsError,
  } = useWorkspaceSettings(activeWorkspaceId!);

  const {
    languages,
    isLoading: isLanguagesLoading,
  } = usePublicSystemLanguages();

  const { mutateAsync: updateSettings, isPending: isUpdating } = useUpdateWorkspaceSettings(activeWorkspaceId!);

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  useEffect(() => {
    if (settings?.allowedTargetLanguages) {
      setSelectedLanguages(settings.allowedTargetLanguages);
    }
  }, [settings?.allowedTargetLanguages]);

  if (!activeWorkspaceId) {
    return null;
  }

  if (isSettingsLoading || isLanguagesLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center gap-2 text-ink-muted">
          <Spinner className="size-6 animate-spin" />
          <span className="text-sm font-medium">Loading settings...</span>
        </div>
      </div>
    );
  }

  if (isSettingsError || !settings) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <WarningCircle className="size-10 text-danger mb-4" weight="duotone" />
        <h3 className="text-lg font-medium text-ink">Failed to load settings</h3>
        <p className="text-sm text-ink-muted mt-2">There was an error loading the workspace settings.</p>
      </div>
    );
  }

  const handleToggle = (langCode: string, checked: boolean) => {
    setSelectedLanguages((prev) => {
      if (checked) {
        return [...prev, langCode];
      } else {
        return prev.filter((code) => code !== langCode);
      }
    });
  };

  const handleSave = async () => {
    try {
      await updateSettings({
        ...settings,
        allowedTargetLanguages: selectedLanguages,
      });
      toast.success("Workspace language settings updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update language settings");
      // Revert selection on failure (e.g. quota exceeded)
      setSelectedLanguages(settings.allowedTargetLanguages || []);
    }
  };

  const isChanged =
    JSON.stringify(selectedLanguages.sort()) !== JSON.stringify([...(settings.allowedTargetLanguages || [])].sort());

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">Languages</h2>
        <p className="text-[15px] text-ink-muted mt-1.5">
          Configure the target languages available for translation in your workspace's meetings.
        </p>
      </div>

      <Card className="rounded-[16px] shadow-sm border-hairline bg-surface-1/50 backdrop-blur-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Translate className="size-5 text-ink-muted" weight="duotone" />
            Allowed Languages
          </CardTitle>
          <CardDescription className="text-[13px]">
            Select the languages that participants can choose to translate meeting audio into. The maximum number of languages you can enable depends on your subscription plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {languages.map((lang: SystemLanguage) => {
                const isSelected = selectedLanguages.includes(lang.code);
                return (
                  <label
                    key={lang.code}
                    className={`flex items-center justify-between gap-3 rounded-[10px] border p-3 transition-colors cursor-pointer ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[14px] font-medium text-ink truncate">
                        {lang.name}
                      </span>
                      <span className="text-[12px] text-ink-muted truncate">
                        {lang.nativeName || lang.code}
                      </span>
                    </div>
                    <Switch
                      checked={isSelected}
                      onCheckedChange={(checked) => handleToggle(lang.code, checked)}
                    />
                  </label>
                );
              })}
            </div>

            {languages.length === 0 && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-surface-2 text-ink-muted text-sm">
                <Info className="size-5" />
                <p>There are currently no active system languages configured by the platform administrator.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sticky Save Bar */}
      {isChanged && (
        <div className="sticky bottom-6 flex items-center justify-between rounded-xl border border-border bg-surface-1/90 px-6 py-4 shadow-lg backdrop-blur-xl animate-in slide-in-from-bottom-5">
          <div className="flex flex-col">
            <p className="text-sm font-medium text-ink">Unsaved changes</p>
            <p className="text-xs text-ink-muted">You have modified the allowed languages for this workspace.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedLanguages(settings.allowedTargetLanguages || [])}
              disabled={isUpdating}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-surface-1 shadow-sm hover:bg-ink-strong transition-colors disabled:opacity-50"
            >
              {isUpdating ? <Spinner className="size-4 animate-spin" /> : <CheckCircle className="size-4" weight="bold" />}
              Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
