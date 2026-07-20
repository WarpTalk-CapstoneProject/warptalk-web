"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Microphone, Translate, Robot, SpeakerHigh, UserSound, ChatCircleText, PencilSimple, FloppyDisk, X, Info, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { billingService } from "@/services/billing.service";
import type { ServiceRatesDto } from "@/types/billing";

interface RateField {
  key: keyof ServiceRatesDto;
  label: string;
  unit: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

const RATE_FIELDS: RateField[] = [
  {
    key: "sttPerMinute",
    label: "Speech-to-Text (STT)",
    unit: "credits / min",
    icon: Microphone,
    description: "Cost deducted per minute of audio processed for speech recognition.",
    color: "text-blue-500",
  },
  {
    key: "translationPerMinute",
    label: "Real-time Translation",
    unit: "credits / min",
    icon: Translate,
    description: "Cost per minute for real-time multilingual translation services.",
    color: "text-violet-500",
  },
  {
    key: "standardTtsPerMinute",
    label: "Text-to-Speech (TTS)",
    unit: "credits / min",
    icon: SpeakerHigh,
    description: "Cost per minute for standard synthesized voice output.",
    color: "text-emerald-500",
  },
  {
    key: "voiceClonePerMinute",
    label: "Voice Clone TTS",
    unit: "credits / min",
    icon: UserSound,
    description: "Premium rate per minute for cloned voice synthesis.",
    color: "text-amber-500",
  },
  {
    key: "aiSummaryPerRequest",
    label: "AI Summary",
    unit: "credits / request",
    icon: Robot,
    description: "Cost per AI-generated meeting summary request.",
    color: "text-pink-500",
  },
  {
    key: "aiChatPerRequest",
    label: "AI Workspace Chat",
    unit: "credits / request",
    icon: ChatCircleText,
    description: "Cost per AI chat message sent in a workspace.",
    color: "text-cyan-500",
  },
];

export function AdminServiceRatesCard() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ServiceRatesDto | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: rates, isLoading } = useQuery({
    queryKey: ["billing", "serviceRates"],
    queryFn: () => billingService.getServiceRates(),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (updated: ServiceRatesDto) => billingService.updateServiceRates(updated),
    onSuccess: (saved) => {
      queryClient.setQueryData(["billing", "serviceRates"], saved);
      setIsEditing(false);
      setDraft(null);
      setSaveError(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    },
    onError: (err: any) => {
      setSaveError(err?.response?.data?.message ?? "Failed to save rates. Please try again.");
    },
  });

  const handleEdit = () => {
    if (rates) {
      setDraft({ ...rates });
      setIsEditing(true);
      setSaveError(null);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraft(null);
    setSaveError(null);
  };

  const handleSave = () => {
    if (!draft) return;
    mutation.mutate(draft);
  };

  const updateDraft = (key: keyof ServiceRatesDto, value: string) => {
    if (!draft) return;
    const num = parseFloat(value);
    setDraft({ ...draft, [key]: isNaN(num) ? 0 : num });
  };

  const displayRates = isEditing ? draft : rates;

  return (
    <Card className="rounded-xl border border-hairline bg-surface-1 shadow-linear">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base font-semibold text-ink">
            AI Service Rates
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Credit cost charged to workspaces per unit of AI service usage.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-muted-foreground hover:text-ink rounded-md"
                onClick={handleCancel}
                disabled={mutation.isPending}
              >
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 px-4 rounded-md"
                onClick={handleSave}
                disabled={mutation.isPending}
              >
                <FloppyDisk className="h-4 w-4 mr-1" />
                {mutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 rounded-md"
              onClick={handleEdit}
              disabled={isLoading}
            >
              <PencilSimple className="h-4 w-4 mr-1" />
              Edit Rates
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {saveError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            {saveError}
          </div>
        )}

        {saveSuccess && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" weight="fill" />
            <div>
              <p className="font-medium">Rates updated successfully.</p>
              <p className="text-xs opacity-80 mt-0.5">All workspace owners have been notified of the rate change via in-app notification.</p>
            </div>
          </div>
        )}

        {isEditing && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Saving will notify all workspace owners</p>
              <p className="text-xs opacity-80 mt-0.5">Changes take effect immediately for all new sessions. Existing running sessions are not affected.</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RATE_FIELDS.map((f) => (
              <div key={f.key} className="h-20 rounded-lg bg-surface-2 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RATE_FIELDS.map((field) => {
              const Icon = field.icon;
              const value = displayRates?.[field.key] ?? 0;
              return (
                <div
                  key={field.key}
                  className="group relative flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2 p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md bg-surface-1 border border-hairline ${field.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-ink leading-tight">{field.label}</span>
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={draft?.[field.key] ?? ""}
                          onChange={(e) => updateDraft(field.key, e.target.value)}
                          className="h-8 text-sm font-mono rounded-md border-hairline bg-surface-1"
                        />
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{field.unit.split("/")[1]?.trim()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-bold tracking-tight text-ink font-mono">
                        {typeof value === "number" ? value.toLocaleString() : value}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{field.unit}</span>
                    </div>
                  )}

                  {/* Tooltip on hover */}
                  <p className="text-[11px] text-muted-foreground leading-snug">{field.description}</p>
                </div>
              );
            })}
          </div>
        )}

        {!isEditing && rates && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            These rates are applied globally across all workspaces and plans.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
