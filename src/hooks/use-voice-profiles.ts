"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VoiceProfileService } from "@/services/voice-profile.service";
import type {
  CreateVoiceProfileRequest,
  SetDubVoiceRequest,
  SetPreferredVoiceRequest,
} from "@/types/voice-profile";

export const VOICE_PROFILE_KEYS = {
  list: () => ["voiceProfiles", "list"] as const,
  catalog: (language: string) => ["voiceProfiles", "catalog", language] as const,
  dubVoice: () => ["voiceProfiles", "dubVoice"] as const,
};

export function useVoiceProfiles() {
  return useQuery({
    queryKey: VOICE_PROFILE_KEYS.list(),
    queryFn: () => VoiceProfileService.list(),
    staleTime: 30000,
  });
}

export function useCreateVoiceProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateVoiceProfileRequest) => VoiceProfileService.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VOICE_PROFILE_KEYS.list() });
    },
  });
}

export function useDeleteVoiceProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => VoiceProfileService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VOICE_PROFILE_KEYS.list() });
    },
  });
}

/**
 * Voices offered for `language`. The catalog is a 6h Redis cache the AI worker fills, so it
 * barely changes — but it starts empty until that worker's first synthesis for the language,
 * which is why this refetches rather than caching for the whole session.
 */
export function useVoiceCatalog(language: string, enabled = true) {
  return useQuery({
    queryKey: VOICE_PROFILE_KEYS.catalog(language),
    queryFn: () => VoiceProfileService.catalog(language),
    enabled: enabled && Boolean(language),
    staleTime: 60_000,
  });
}

export function useDubVoice() {
  return useQuery({
    queryKey: VOICE_PROFILE_KEYS.dubVoice(),
    queryFn: () => VoiceProfileService.dubVoice(),
    staleTime: 60_000,
  });
}

export function useSetDubVoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SetDubVoiceRequest) => VoiceProfileService.setDubVoice(request),
    onSuccess: () => {
      // Both: the choice itself, and the profile list that shows which one is in use.
      queryClient.invalidateQueries({ queryKey: VOICE_PROFILE_KEYS.dubVoice() });
      queryClient.invalidateQueries({ queryKey: VOICE_PROFILE_KEYS.list() });
    },
  });
}

export function useSetPreferredVoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SetPreferredVoiceRequest) =>
      VoiceProfileService.setPreferredVoice(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VOICE_PROFILE_KEYS.list() });
    },
  });
}
