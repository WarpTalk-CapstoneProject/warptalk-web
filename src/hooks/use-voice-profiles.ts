"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hasCloningVoiceProfile } from "@/lib/voice/profile-status";
import { VoiceConsentService, VoiceProfileService } from "@/services/voice-profile.service";
import type {
  CreateVoiceProfileRequest,
  SetDubVoiceRequest,
  SetPreferredVoiceRequest,
} from "@/types/voice-profile";

export const VOICE_PROFILE_KEYS = {
  list: () => ["voiceProfiles", "list"] as const,
  catalog: (language: string) => ["voiceProfiles", "catalog", language] as const,
  dubVoice: () => ["voiceProfiles", "dubVoice"] as const,
  /**
   * Permission to clone, which is NOT part of a profile and is deliberately keyed apart from
   * one. It is granted once for the person, outlives every profile they make or delete, and is
   * what AuthService is asked about over gRPC before a meeting may build a voice from live
   * speech. Invalidating the profile list must not refetch it, and vice versa.
   */
  consent: () => ["voiceConsent"] as const,
};

/**
 * WT-598: polls while a clone is still being built, and stops the moment none are.
 *
 * Cloning finishes on the AI side and writes the provider voice id to the row. Nothing tells the
 * browser — there is no realtime channel for it — so with only `staleTime` this query refetched
 * on remount and window focus and at no other moment. Somebody who uploaded a sample and then
 * WAITED on the page, which is exactly what the screen invites, sat on "Cloning" indefinitely;
 * navigating to another page and back remounted the query and revealed it had finished minutes
 * ago. The workaround in the report — "switch to another page" — is a remount, not a fix.
 *
 * The interval is conditional so a settled list costs nothing: with every profile ready this is
 * an ordinary cached query again. A clone that never completes keeps one request every four
 * seconds while the tab is open and focused, which is the price of not making the reader guess.
 */
export function useVoiceProfiles() {
  return useQuery({
    queryKey: VOICE_PROFILE_KEYS.list(),
    queryFn: () => VoiceProfileService.list(),
    staleTime: 30000,
    refetchInterval: (query) => (hasCloningVoiceProfile(query.state.data) ? 4000 : false),
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

/**
 * Whether this person allows a MEETING to build a voice model from their live speech.
 *
 * This is the account-level VOICE_CLONE consent, and it is a different permission from the five
 * confirmations in the create-profile dialog — those are VOICE_PROFILE_UPLOAD, recorded against
 * the recording somebody uploads. Uploading works without this one; only cloning somebody live,
 * mid-meeting, needs it. They are stored as separate rows with separate types in
 * `voice_consents`, and the UI has to say which is which or it reads as being asked twice.
 */
export function useVoiceConsent() {
  return useQuery({
    queryKey: VOICE_PROFILE_KEYS.consent(),
    queryFn: () => VoiceConsentService.status(),
    staleTime: 60_000,
  });
}

export function useGrantVoiceConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => VoiceConsentService.grant(),
    // The response IS the new status, so it is written straight in rather than refetched — a
    // decision this deliberate should not flicker back to its old value while a GET runs.
    onSuccess: (status) => queryClient.setQueryData(VOICE_PROFILE_KEYS.consent(), status),
  });
}

export function useRevokeVoiceConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => VoiceConsentService.revoke(),
    onSuccess: (status) => queryClient.setQueryData(VOICE_PROFILE_KEYS.consent(), status),
  });
}
