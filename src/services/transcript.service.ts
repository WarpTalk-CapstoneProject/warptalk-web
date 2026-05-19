import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CreateCorrectionRequest,
  CreateTranscriptExportRequest,
  CreateTranscriptRequest,
  PagedResult,
  ProcessAudioChunkRequest,
  TranscriptDto,
  TranscriptExportDto,
  TranscriptSegmentDto,
  TranscriptTranslationDto,
} from "@/types/transcript";

/** Transcript service — maps to TranscriptsController endpoints */
export const transcriptService = {
  start(data: CreateTranscriptRequest) {
    return apiClient.post<TranscriptDto>(API.transcripts.start, data);
  },

  get(id: string) {
    return apiClient.get<TranscriptDto>(API.transcripts.get(id));
  },

  getByRoom(translationRoomId: string) {
    return apiClient.get<TranscriptDto>(API.transcripts.byRoom(translationRoomId));
  },

  segments(id: string, params?: { skip?: number; take?: number }) {
    return apiClient.get<PagedResult<TranscriptSegmentDto>>(API.transcripts.segments(id), { params });
  },

  translations(id: string, params?: { skip?: number; take?: number }) {
    return apiClient.get<PagedResult<TranscriptTranslationDto>>(API.transcripts.translations(id), { params });
  },

  createExport(id: string, data: CreateTranscriptExportRequest) {
    return apiClient.post<TranscriptExportDto>(API.transcripts.exports(id), data);
  },

  async downloadExport(id: string, exportId: string) {
    const response = await apiClient.get<Blob>(API.transcripts.exportDownload(id, exportId), {
      responseType: "blob",
    });
    return response.data;
  },

  correctSegment(id: string, segmentId: string, data: CreateCorrectionRequest) {
    return apiClient.post<void>(API.transcripts.correctSegment(id, segmentId), data);
  },

  processAudioChunk(id: string, data: ProcessAudioChunkRequest) {
    return apiClient.post<void>(API.transcripts.audio(id), data);
  },

  finalize(id: string) {
    return apiClient.post<void>(API.transcripts.finalize(id));
  },
};
