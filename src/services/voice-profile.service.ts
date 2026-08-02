import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  VoiceProfileDto,
  CreateVoiceProfileRequest,
  VoiceCatalogItemDto,
  SetPreferredVoiceRequest,
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
    if (request.sample) {
      formData.append("sample", request.sample);
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
};
