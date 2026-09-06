"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { meetingDocumentService } from "@/services/meeting-document.service";
import { meetingMinutesService } from "@/services/meeting-minutes.service";
import { MEETING_MINUTES_KEY } from "@/hooks/use-meeting-minutes";
import { MEETING_DOCUMENTS_PAGE_SIZE } from "@/types/meetingDocument";
import type { MeetingDocumentsQuery, MeetingDocumentsResponse } from "@/types/meetingDocument";

/**
 * Workspace-FIRST, and that order is the guarantee, not a style choice: one workspace's documents
 * can never be served from another's cache entry. The filter terms are appended AFTER the
 * workspace for the same reason — they narrow a workspace's entry, they never cross it.
 *
 * Kept on one line so `check-transcript-workspace-isolation-contract.mjs` can read the shape.
 */
export const MEETING_DOCUMENTS_KEY = (workspaceId: string | null, query: MeetingDocumentsQuery) =>
  ["meeting-documents", workspaceId, query.type ?? "all", query.search?.trim() ?? "", query.page ?? 1, query.pageSize ?? MEETING_DOCUMENTS_PAGE_SIZE] as const;

export function useMeetingDocuments(workspaceId: string | null, query: MeetingDocumentsQuery = {}) {
  return useQuery({
    queryKey: MEETING_DOCUMENTS_KEY(workspaceId, query),
    enabled: Boolean(workspaceId),
    queryFn: (): Promise<MeetingDocumentsResponse> =>
      meetingDocumentService.list({ ...query, workspaceId: workspaceId! }),
    // Paging a grid should not blank it. Without this the whole page unmounts to a spinner on
    // every page change and every filter chip, which reads as the page reloading rather than
    // narrowing.
    placeholderData: (previous) => previous,
  });
}

/**
 * Draw up a meeting's minutes from the grid.
 *
 * The reason this exists at all: minutes have been buildable end to end for weeks and the
 * production table holds zero rows, because the only door was four clicks deep inside a single
 * meeting. Reusing `meetingMinutesService.createDraft` rather than adding a second write path —
 * the server's own gates stay the authority, and `canDraftMinutes` on the card is only there to
 * avoid OFFERING what it would refuse.
 *
 * Invalidates the whole `meeting-documents` tree rather than patching a row: creating minutes
 * adds a NEW document, which changes the page's total and can push a card onto another page. A
 * surgical cache edit would leave the pager lying.
 */
export function useDrawUpMinutes(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roomId: string) => (await meetingMinutesService.createDraft(roomId)).data,
    onSuccess: (minutes) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-documents", workspaceId] });
      // The room's own minutes cache, so opening that meeting shows the draft immediately
      // instead of refetching behind a spinner.
      queryClient.setQueryData(MEETING_MINUTES_KEY(minutes.translationRoomId), minutes);
    },
  });
}
