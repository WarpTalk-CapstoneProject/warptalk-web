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
    description:
      "Cost deducted per minute of audio processed for speech recognition.",
    color: "text-blue-500",
  },
  {
    key: "translationPerMinute",
    label: "Real-time Translation",
    unit: "credits / min",
    icon: Translate,
    description:
      "Cost per minute for real-time multilingual translation services.",
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
  const { data: rates, isLoading } = useQuery({
    queryKey: ["billing", "serviceRates"],
    queryFn: () => billingService.getServiceRates(),
    staleTime: 60_000,
  });

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
              Change BillingRates through the deployment environment and
              redeploy Billing Service so every replica uses the same rates.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RATE_FIELDS.map((f) => (
              <div
                key={f.key}
                className="h-20 rounded-lg bg-surface-2 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RATE_FIELDS.map((field) => {
              const Icon = field.icon;
              const value = rates?.[field.key] ?? 0;
              return (
                <div
                  key={field.key}
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
                      {typeof value === "number"
                        ? value.toLocaleString()
                        : value}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {field.unit}
                    </span>
                  </div>

                  {/* Tooltip on hover */}
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {field.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {rates && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            These rates are applied globally across all workspaces and plans.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
