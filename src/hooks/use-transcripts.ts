"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { transcriptService } from "@/services/transcript.service";
import type { CreateTranscriptRequest } from "@/types/transcript";

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
