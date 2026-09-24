"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminConfigurationService } from "@/services/admin-configuration.service";
import type {
  AdminCreateLanguageRequest,
  AdminUpdateLanguageRequest,
} from "@/types/admin-configuration";

export const ADMIN_CONFIGURATION_KEYS = {
  languages: ["admin", "configuration", "languages"] as const,
  voiceConsent: ["admin", "configuration", "voice-consent"] as const,
};

/**
 * The catalog, with live/scheduled meeting counts per language. Those counts decide whether a
 * language can be switched off, so the stale time is short now that this screen can act on them.
 */
export function useAdminLanguageCatalog() {
  return useQuery({
    queryKey: ADMIN_CONFIGURATION_KEYS.languages,
    queryFn: () => adminConfigurationService.getLanguages(),
    staleTime: 30_000,
  });
}

function useInvalidateLanguages() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ADMIN_CONFIGURATION_KEYS.languages });
}

export function useCreateAdminLanguage() {
  const invalidate = useInvalidateLanguages();
  return useMutation({
    mutationFn: (request: AdminCreateLanguageRequest) =>
      adminConfigurationService.createLanguage(request),
    onSuccess: invalidate,
  });
}

export function useUpdateAdminLanguage() {
  const invalidate = useInvalidateLanguages();
  return useMutation({
    mutationFn: ({ code, request }: { code: string; request: AdminUpdateLanguageRequest }) =>
      adminConfigurationService.updateLanguage(code, request),
    onSuccess: invalidate,
  });
}

/** Enable, or disable (with `confirmUpcoming` when scheduled meetings use it). */
export function useSetAdminLanguageActive() {
  const invalidate = useInvalidateLanguages();
  return useMutation({
    mutationFn: ({
      code,
      isActive,
      confirmUpcoming,
    }: {
      code: string;
      isActive: boolean;
      confirmUpcoming?: boolean;
    }) =>
      isActive
        ? adminConfigurationService.enableLanguage(code)
        : adminConfigurationService.disableLanguage(code, { confirmUpcoming }),
    // Refetch on failure too: a 409 means the usage counts on screen were stale.
    onSettled: invalidate,
  });
}

export function useAdminVoiceConsentSummary() {
  return useQuery({
    queryKey: ADMIN_CONFIGURATION_KEYS.voiceConsent,
    queryFn: () => adminConfigurationService.getVoiceConsentSummary(),
    staleTime: 60_000,
  });
}
