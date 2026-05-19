"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { transcriptService } from "@/services/transcript.service";
import type { CreateCorrectionRequest, CreateTranscriptExportRequest, CreateTranscriptRequest } from "@/types/transcript";

const TRANSCRIPT_KEY = ["transcripts"] as const;

/** Fetch a single transcript by ID */
export function useTranscript(id: string) {
  return useQuery({
    queryKey: [...TRANSCRIPT_KEY, id],
    queryFn: async () => {
      const { data } = await transcriptService.get(id);
      return data;
    },
    enabled: !!id,
  });
}

export function useTranscriptByRoom(translationRoomId?: string) {
  return useQuery({
    queryKey: [...TRANSCRIPT_KEY, "by-room", translationRoomId],
    queryFn: async () => {
      const { data } = await transcriptService.getByRoom(translationRoomId!);
      return data;
    },
    enabled: !!translationRoomId,
    retry: false,
  });
}

export function useTranscriptSegments(transcriptId?: string) {
  return useQuery({
    queryKey: [...TRANSCRIPT_KEY, transcriptId, "segments"],
    queryFn: async () => {
      const { data } = await transcriptService.segments(transcriptId!, { take: 200 });
      return data;
    },
    enabled: !!transcriptId,
  });
}

export function useTranscriptTranslations(transcriptId?: string) {
  return useQuery({
    queryKey: [...TRANSCRIPT_KEY, transcriptId, "translations"],
    queryFn: async () => {
      const { data } = await transcriptService.translations(transcriptId!, { take: 500 });
      return data;
    },
    enabled: !!transcriptId,
  });
}

/** Start transcript mutation */
export function useStartTranscript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTranscriptRequest) => {
      const { data: transcript } = await transcriptService.start(data);
      return transcript;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSCRIPT_KEY });
    },
  });
}

export function useCreateTranscriptExport() {
  return useMutation({
    mutationFn: async ({ transcriptId, request }: { transcriptId: string; request: CreateTranscriptExportRequest }) => {
      const { data } = await transcriptService.createExport(transcriptId, request);
      return data;
    },
  });
}

export function useDownloadTranscriptExport() {
  return useMutation({
    mutationFn: ({ transcriptId, exportId }: { transcriptId: string; exportId: string }) =>
      transcriptService.downloadExport(transcriptId, exportId),
  });
}

export function useCorrectTranscriptSegment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transcriptId,
      segmentId,
      request,
    }: {
      transcriptId: string;
      segmentId: string;
      request: CreateCorrectionRequest;
    }) => transcriptService.correctSegment(transcriptId, segmentId, request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...TRANSCRIPT_KEY, variables.transcriptId, "segments"] });
      queryClient.invalidateQueries({ queryKey: [...TRANSCRIPT_KEY, variables.transcriptId, "translations"] });
    },
  });
}

/** Finalize transcript mutation */
export function useFinalizeTranscript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await transcriptService.finalize(id);
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [...TRANSCRIPT_KEY, id] });
    },
  });
}
