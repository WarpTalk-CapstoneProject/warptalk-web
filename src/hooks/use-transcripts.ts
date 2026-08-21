"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { transcriptService } from "@/services/transcript.service";
import type {
  CreateCorrectionRequest,
  CreateTranscriptExportRequest,
  CreateTranscriptRequest,
  PagedResult,
} from "@/types/transcript";

const TRANSCRIPT_KEY = ["transcripts"] as const;

/**
 * One request's worth of rows.
 *
 * 500 rather than a smaller page because of what the translations endpoint costs per CALL, not
 * per row: `GetTranslationsAsync` loads every segment and every current link for the transcript
 * before it skips and takes, so each page is a full scan. The longest meeting in production is
 * 751 segments — two requests at this size, eight at 100.
 */
const PAGE_SIZE = 500;

/**
 * A ceiling on how much of one transcript we will pull, so a corrupt `totalCount` cannot spin
 * the loop forever. ~14 hours of talking at the rate STT finalizes chunks — past any meeting
 * this product runs, and it fails by fetching too much rather than by never stopping.
 */
const MAX_ROWS = 20_000;

/** How often a running backfill is checked on. Its batches land a few seconds apart. */
const POLL_INTERVAL_MS = 2500;

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

/**
 * Reading a transcript in a language it was never fully translated into.
 *
 * A meeting only ever produced the target language that was selected while it was running, so
 * choosing a language here used to mean "the part of the meeting that happens to exist in it".
 * This asks the server to translate the rest, then follows the counts until they close.
 *
 * The poll is the progress bar: the work is done by warptalk-ai and lands in the database over
 * Redis, so there is nothing to await — `missing` falling is what "it is working" looks like.
 * Every time it falls, the translations query is invalidated so the lines that just arrived are
 * rendered rather than waiting for the run to finish.
 */
export function useTranscriptLanguageBackfill(transcriptId?: string, targetLanguage?: string) {
  const queryClient = useQueryClient();
  const active = Boolean(transcriptId) && Boolean(targetLanguage);
  const lastMissing = useRef<number | null>(null);

  const coverage = useQuery({
    queryKey: [...TRANSCRIPT_KEY, transcriptId, "coverage", targetLanguage],
    queryFn: async () => {
      const { data } = await transcriptService.translationCoverage(transcriptId!, targetLanguage!);
      return data;
    },
    enabled: active,
    // Only while somebody is filling it in. An idle gap is a standing fact about the meeting,
    // not something that changes on its own, and polling it forever would put every open
    // transcript tab on a timer for no reason.
    refetchInterval: (query) => (query.state.data?.status === "running" ? POLL_INTERVAL_MS : false),
  });

  const missing = coverage.data?.missing ?? null;

  useEffect(() => {
    if (missing === null) {
      lastMissing.current = null;
      return;
    }
    const previous = lastMissing.current;
    lastMissing.current = missing;
    if (previous !== null && missing < previous) {
      queryClient.invalidateQueries({
        queryKey: [...TRANSCRIPT_KEY, transcriptId, "translations"],
      });
    }
  }, [missing, queryClient, transcriptId]);

  const start = useMutation({
    mutationFn: async ({ language }: { language: string }) => {
      const { data } = await transcriptService.backfillTranslations(transcriptId!, language);
      return data;
    },
    onSuccess: (data) => {
      // Seed the poll with what the server just said, so the first frame after a click already
      // shows the real number instead of a spinner over a stale one.
      queryClient.setQueryData([...TRANSCRIPT_KEY, transcriptId, "coverage", data.targetLanguage], data);
    },
  });

  return {
    coverage: coverage.data ?? null,
    isLoading: coverage.isLoading,
    isStarting: start.isPending,
    /** Safe to call on every pick: the server does nothing when the language is already complete. */
    request: (language: string) => {
      if (!transcriptId || !language) return;
      start.mutate({ language });
    },
    failedToStart: start.isError,
  };
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
