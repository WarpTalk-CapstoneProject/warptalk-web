"use client";

import { useQuery } from "@tanstack/react-query";

import { adminConfigurationService } from "@/services/admin-configuration.service";

export const ADMIN_CONFIGURATION_KEYS = {
  languages: ["admin", "configuration", "languages"] as const,
  voiceConsent: ["admin", "configuration", "voice-consent"] as const,
};

/** Reference data. It changes by migration, so a long stale time is honest, not lazy. */
export function useAdminLanguageCatalog() {
  return useQuery({
    queryKey: ADMIN_CONFIGURATION_KEYS.languages,
    queryFn: () => adminConfigurationService.getLanguages(),
    staleTime: 5 * 60_000,
  });
}

export function useAdminVoiceConsentSummary() {
  return useQuery({
    queryKey: ADMIN_CONFIGURATION_KEYS.voiceConsent,
    queryFn: () => adminConfigurationService.getVoiceConsentSummary(),
    staleTime: 60_000,
  });
}
