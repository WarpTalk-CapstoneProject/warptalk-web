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
  TranscriptLanguageCoverage,
  TranscriptSegmentDto,
  TranscriptPauseWindowDto,
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

  /**
   * WT-605 — stop writing the transcript down. Host-only; translation, dubbing, subtitles and
   * LiveKit are untouched.
   *
   * 204 on success. 403 when the caller is not the room's host, 409 when it is already paused —
   * both of which are ordinary answers rather than faults, so the caller shows them as such.
   */
  pauseByRoom(translationRoomId: string) {
    return apiClient.post<void>(API.transcripts.pauseByRoom(translationRoomId));
  },

  /** The other half of the switch. Host-only, 409 when it is not paused. */
  resumeByRoom(translationRoomId: string) {
    return apiClient.post<void>(API.transcripts.resumeByRoom(translationRoomId));
  },

  /**
   * Every pause this room has had, open ones included.
   *
   * This is the only way somebody who joins mid-pause can learn the transcript is not running:
   * the broadcast that told everybody else fired before they were in the group.
   */
  pauseWindows(translationRoomId: string) {
    return apiClient.get<TranscriptPauseWindowDto[]>(
      API.transcripts.pauseWindows(translationRoomId),
    );
  },

  segments(id: string, params?: { skip?: number; take?: number }) {
    return apiClient.get<PagedResult<TranscriptSegmentDto>>(API.transcripts.segments(id), { params });
  },

  translations(id: string, params?: { skip?: number; take?: number }) {
    return apiClient.get<PagedResult<TranscriptTranslationDto>>(API.transcripts.translations(id), { params });
  },

  /**
   * How much of this transcript is readable in one language, and whether a backfill of the rest
   * is already running. Cheap enough to poll — the counts ARE the progress.
   */
  translationCoverage(id: string, targetLanguage: string) {
    return apiClient.get<TranscriptLanguageCoverage>(API.transcripts.translationCoverage(id), {
      params: { targetLanguage },
    });
  },

  /**
   * Translate the lines that have no version in this language. Answers 202 with the coverage as
   * it stands; the work lands asynchronously, so follow it with translationCoverage.
   */
  backfillTranslations(id: string, targetLanguage: string) {
    return apiClient.post<TranscriptLanguageCoverage>(API.transcripts.translationBackfill(id), {
      targetLanguage,
    });
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
