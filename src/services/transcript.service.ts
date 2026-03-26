import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CreateTranscriptRequest,
  ProcessAudioChunkRequest,
  TranscriptDto,
} from "@/types/transcript";

/** Transcript service — maps to TranscriptsController endpoints */
export const transcriptService = {
  start(data: CreateTranscriptRequest) {
    return apiClient.post<TranscriptDto>(API.transcripts.start, data);
  },

  get(id: string) {
    return apiClient.get<TranscriptDto>(API.transcripts.get(id));
  },

  processAudioChunk(id: string, data: ProcessAudioChunkRequest) {
    return apiClient.post<void>(API.transcripts.audio(id), data);
  },

  finalize(id: string) {
    return apiClient.post<void>(API.transcripts.finalize(id));
  },
};
