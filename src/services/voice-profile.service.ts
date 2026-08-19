import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  VoiceProfileDto,
  CreateVoiceProfileRequest,
  VoiceCatalogItemDto,
  SetDubVoiceRequest,
  SetPreferredVoiceRequest,
  PreviewVoiceRequest,
  VoiceConsentStatusDto,
} from "@/types/voice-profile";

export const VoiceProfileService = {
  async list(): Promise<VoiceProfileDto[]> {
    const { data } = await apiClient.get<VoiceProfileDto[]>(API.voiceProfiles.list);
    return data;
  },

  async create(request: CreateVoiceProfileRequest): Promise<VoiceProfileDto> {
    const formData = new FormData();
    formData.append("displayName", request.displayName);
    formData.append("language", request.language);
    formData.append("ownVoiceConfirmed", String(request.ownVoiceConfirmed));
    formData.append("aiUseConfirmed", String(request.aiUseConfirmed));
    formData.append("syntheticVoiceAcknowledged", String(request.syntheticVoiceAcknowledged));
    formData.append("noImpersonationConfirmed", String(request.noImpersonationConfirmed));
    formData.append("retentionAcknowledged", String(request.retentionAcknowledged));
    if (request.sample) {
      formData.append("sample", request.sample);
    }
    if (request.ownVoiceConfirmed !== undefined) {
      formData.append("ownVoiceConfirmed", String(request.ownVoiceConfirmed));
    }
    if (request.aiUseConfirmed !== undefined) {
      formData.append("aiUseConfirmed", String(request.aiUseConfirmed));
    }
    if (request.syntheticVoiceAcknowledged !== undefined) {
      formData.append("syntheticVoiceAcknowledged", String(request.syntheticVoiceAcknowledged));
    }
    if (request.noImpersonationConfirmed !== undefined) {
      formData.append("noImpersonationConfirmed", String(request.noImpersonationConfirmed));
    }
    if (request.retentionAcknowledged !== undefined) {
      formData.append("retentionAcknowledged", String(request.retentionAcknowledged));
    }

    const { data } = await apiClient.post<VoiceProfileDto>(API.voiceProfiles.create, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(API.voiceProfiles.delete(id));
  },

  /**
   * Voices offered for a language. An empty list is a normal answer, not an error — the
   * catalog is a cache the AI worker fills on its next synthesis for that language.
   */
  async catalog(language: string): Promise<VoiceCatalogItemDto[]> {
    const { data } = await apiClient.get<VoiceCatalogItemDto[]>(API.voiceProfiles.catalog, {
      params: { language },
    });
    return data;
  },

  /** Returns the stored profile, or null when the preference was cleared (204). */
  async setPreferredVoice(request: SetPreferredVoiceRequest): Promise<VoiceProfileDto | null> {
    const { data, status } = await apiClient.put<VoiceProfileDto | "">(
      API.voiceProfiles.preferredVoice,
      request,
    );
    return status === 204 || !data ? null : (data as VoiceProfileDto);
  },

  /** WT-396 — the voice this user is DUBBED IN. Null means clone them live in the meeting. */
  async dubVoice(): Promise<string | null> {
    const { data } = await apiClient.get<{ voiceId: string | null }>(API.voiceProfiles.dubVoice);
    return data.voiceId ?? null;
  },

  /** Pass a null voiceId to clear the choice and go back to live cloning. */
  async setDubVoice(request: SetDubVoiceRequest): Promise<string | null> {
    const { data } = await apiClient.put<{ voiceId: string | null }>(
      API.voiceProfiles.dubVoice,
      request,
    );
    return data.voiceId ?? null;
  },

  /**
   * WAV audio of `voiceId` speaking one sentence in `language`.
   *
   * The language is required and is not cosmetic — the sample is SPOKEN in it, and the same
   * voice is a different judgement in Vietnamese than in English.
   *
   * Rendered with the same speed the meeting uses, so what you hear here is what the dub will
   * sound like. The first call for a voice waits on a real synthesis; every call after it is
   * served from the AI side's cache.
   */
  async preview(request: PreviewVoiceRequest): Promise<Blob> {
    const { data } = await apiClient.post<Blob>(API.voiceProfiles.preview, request, {
      responseType: "blob",
    });
    return data;
  },

};

export const VoiceConsentService = {
  async status(): Promise<VoiceConsentStatusDto> {
    const { data } = await apiClient.get<VoiceConsentStatusDto>(API.voiceConsent.status);
    return data;
  },

  async grant(): Promise<VoiceConsentStatusDto> {
    const { data } = await apiClient.post<VoiceConsentStatusDto>(API.voiceConsent.grant);
    return data;
  },

  async revoke(): Promise<VoiceConsentStatusDto> {
    const { data } = await apiClient.post<VoiceConsentStatusDto>(API.voiceConsent.revoke);
    return data;
  },
};
