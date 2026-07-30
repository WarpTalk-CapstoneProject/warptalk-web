"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VoiceProfileService } from "@/services/voice-profile.service";
import type { CreateVoiceProfileRequest } from "@/types/voice-profile";

export const VOICE_PROFILE_KEYS = {
  list: () => ["voiceProfiles", "list"] as const,
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
