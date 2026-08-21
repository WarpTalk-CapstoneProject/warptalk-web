"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { transcriptService } from "@/services/transcript.service";
import type {
  CreateCorrectionRequest,
  CreateTranscriptExportRequest,
  CreateTranscriptRequest,
  PagedResult,
} from "@/types/transcript";

const TRANSCRIPT_KEY = ["transcripts"] as const;

/** One request's worth of rows. Small enough to be cheap, large enough that most meetings fit. */
const PAGE_SIZE = 200;

/**
 * A ceiling on how much of one transcript we will pull, so a corrupt `totalCount` cannot spin
 * the loop forever. ~14 hours of talking at the rate STT finalizes chunks — past any meeting
 * this product runs, and it fails by fetching too much rather than by never stopping.
 */
const MAX_ROWS = 20_000;

/**
 * Every page of a paginated transcript read, as one result.
 *
 * These reads used to ask for a single page and present it as the whole thing: segments took
 * 200 and translations took 500. A meeting longer than that came back silently truncated —
 * the tab counted 200 while the panel showed the 145 utterances those 200 chunks merged into,
 * and the conversation simply stopped mid-sentence with nothing on screen saying so. Reading a
 * transcript in one language makes it worse, not better: the language dropdown would be built
 * from a fraction of the meeting and confidently report coverage for the rest.
 *
 * `skip` advances by the page size rather than by how many rows came back. The translations
 * endpoint filters its page AFTER paging it (a link whose content row is missing is dropped),
 * so a short page does not mean the last page, and counting rows would stop early.
 */
async function collectAllPages<T>(
  fetchPage: (skip: number, take: number) => Promise<PagedResult<T>>,
): Promise<PagedResult<T>> {
  const items: T[] = [];
  let totalCount = 0;
  let skip = 0;

  while (skip < MAX_ROWS) {
    const page = await fetchPage(skip, PAGE_SIZE);
    items.push(...(page.items ?? []));
    totalCount = page.totalCount ?? items.length;
    skip += PAGE_SIZE;
    if (skip >= totalCount) break;
  }

  return { totalCount, items };
}

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
    queryFn: () =>
      collectAllPages(async (skip, take) => {
        const { data } = await transcriptService.segments(transcriptId!, { skip, take });
        return data;
      }),
    enabled: !!transcriptId,
  });
}

export function useTranscriptTranslations(transcriptId?: string) {
  return useQuery({
    queryKey: [...TRANSCRIPT_KEY, transcriptId, "translations"],
    queryFn: () =>
      collectAllPages(async (skip, take) => {
        const { data } = await transcriptService.translations(transcriptId!, { skip, take });
        return data;
      }),
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
