"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Microphone,
  Translate,
  Robot,
  SpeakerHigh,
  UserSound,
  ChatCircleText,
  Info,
} from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { billingService } from "@/services/billing.service";
import type { UsageRateCardDto } from "@/types/billing";

interface RateField {
  chargeType: string;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

const RATE_FIELDS: RateField[] = [
  {
    chargeType: "STT",
    label: "Speech-to-Text (STT)",
    icon: Microphone,
    description:
      "Cost deducted per minute of audio processed for speech recognition.",
    color: "text-blue-500",
  },
  {
    chargeType: "TRANSLATION_TEXT",
    label: "Real-time Translation",
    icon: Translate,
    description:
      "Cost per minute for real-time multilingual translation services.",
    color: "text-violet-500",
  },
  {
    chargeType: "AUDIO_DUBBING_STANDARD",
    label: "Text-to-Speech (TTS)",
    icon: SpeakerHigh,
    description: "Cost per minute for standard synthesized voice output.",
    color: "text-emerald-500",
  },
  {
    chargeType: "AUDIO_DUBBING_VOICE_CLONE",
    label: "Voice Clone TTS",
    icon: UserSound,
    description: "Premium rate per minute for cloned voice synthesis.",
    color: "text-amber-500",
  },
  {
    chargeType: "AI_SUMMARY",
    label: "AI Summary",
    icon: Robot,
    description: "Cost per AI-generated meeting summary request.",
    color: "text-pink-500",
  },
  {
    chargeType: "AI_ASSISTANT",
    label: "AI Workspace Chat",
    icon: ChatCircleText,
    description: "Cost per AI chat message sent in a workspace.",
    color: "text-cyan-500",
  },
];

export function AdminServiceRatesCard() {
  const { data: rateCards, isLoading } = useQuery({
    queryKey: ["billing", "usageRateCard"],
    queryFn: () => billingService.getUsageRateCard(),
    staleTime: 60_000,
  });

  const ratesByChargeType = React.useMemo(() => {
    const map = new Map<string, UsageRateCardDto[]>();
    for (const rate of rateCards ?? []) {
      if (!rate.isActive) continue;
      const items = map.get(rate.chargeType) ?? [];
      items.push(rate);
      map.set(rate.chargeType, items);
    }
    return map;
  }, [rateCards]);

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

      </CardHeader>

      <CardContent className="pt-0">
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Deployment-managed configuration</p>
            <p className="text-xs opacity-80 mt-0.5">
              Rates are stored in the billing database and edited through the
              usage rate-card configuration.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RATE_FIELDS.map((f) => (
              <div
                key={f.chargeType}
                className="h-20 rounded-lg bg-surface-2 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RATE_FIELDS.map((field) => {
              const Icon = field.icon;
              const items = ratesByChargeType.get(field.chargeType) ?? [];
              const primaryRate = items[0];
              return (
                <div
                  key={field.chargeType}
                  className="group relative flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2 p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-md bg-surface-1 border border-hairline ${field.color}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-ink leading-tight">
                      {field.label}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold tracking-tight text-ink font-mono">
                      {primaryRate
                        ? primaryRate.unitPrice.toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })
                        : "-"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      credits / {primaryRate?.unit ?? "unit"}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {primaryRate
                      ? `${primaryRate.provider} / ${primaryRate.model} (${items.length} active rate${items.length === 1 ? "" : "s"})`
                      : field.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {rateCards && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            These rates are applied globally unless a workspace contract stores negotiated terms.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
