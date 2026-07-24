import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { VoiceProfileDto, CreateVoiceProfileRequest } from "@/types/voice-profile";

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
};
