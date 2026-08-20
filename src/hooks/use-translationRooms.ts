"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translationRoomService } from "@/services/translation-room.service";
import type { FlashModeState } from "@/services/translation-room.service";
import type { NoiseReductionMode } from "@/lib/meeting/noise-reduction";
import type { ArtifactAccessLevel } from "@/lib/meeting/record-sharing";
import type {
  CreateTranslationRoomRequest,
  RecurrenceRequest,
  JoinTranslationRoomByCodeRequest,
  SubmitTranslationRoomFeedbackRequest,
  TranslationRoomFeedbackDto,
  TranslationRoomFeedbackStateDto,
  TranslationRoomDto,
  TranslationRoomParticipantDto,
  UpdateRoomSettingsRequest,
} from "@/types/translationRoom";

const MEETING_KEY = ["translationRooms"] as const;
const ROOM_FEEDBACK_KEY = ["translationRoomFeedback"] as const;
/** Exported so a room-wide Start/Stop broadcast can refresh it without re-spelling the key. */
export const sessionsKey = (roomId: string) => [...MEETING_KEY, roomId, "sessions"] as const;

export function useTranslationRooms(params?: {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  /** Pass the active workspace on any workspace-scoped screen. See `translationRoomService.list`. */
  workspaceId?: string;
  /**
   * WT-327: one row per repeating BOOKING instead of one per occurrence. See
   * `translationRoomService.list` for which screens should ask for it — the day panel and the day
   * strip must not, because they are asking about a date, and a booking has no single date.
   */
  groupBySeries?: boolean;
  /** Off for a query a screen keeps mounted but is not currently showing. */
  enabled?: boolean;
}) {
  const { enabled = true, ...listParams } = params ?? {};

  return useQuery({
    queryKey: [...MEETING_KEY, listParams],
    queryFn: async () => {
      const { data } = await translationRoomService.list(listParams);
      return data;
    },
    enabled,
  });
}

/** Fetch a single translationRoom by ID */
/**
 * @param refetchInterval poll the room's state, in ms. Off by default — only the waiting room
 * needs it, so it can notice the host starting the meeting (WT-232) without every other screen
 * paying for a poll.
 */
export function useTranslationRoom(id: string, refetchInterval?: number) {
  return useQuery({
    queryKey: [...MEETING_KEY, id],
    queryFn: async () => {
      const { data } = await translationRoomService.get(id);
      return data;
    },
    enabled: !!id,
    refetchInterval,
  });
}

/** Create translationRoom mutation */
export function useCreateTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTranslationRoomRequest) => {
      const { data: translationRoom } = await translationRoomService.create(data);
      return translationRoom;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

/**
 * WT-327: create a repeating booking.
 *
 * Separate from useCreateTranslationRoom rather than a flag on it, because the two return
 * different shapes and a caller that has to narrow a union at runtime is a caller that can
 * forget to. Invalidates the same key, so the meetings list and the day timeline pick up all
 * N occurrences at once — they are ordinary rooms and the list endpoint never learned about
 * series at all.
 */
export function useCreateRecurringTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      data: CreateTranslationRoomRequest & { recurrence: RecurrenceRequest },
    ) => {
      const { data: result } = await translationRoomService.createRecurring(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

/**
 * WT-327: stop a whole series. Future occurrences are cancelled with it; meetings that already
 * ran are untouched. Cancelling ONE occurrence is useCancelTranslationRoom and leaves the
 * series running.
 */
export function useCancelTranslationRoomSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (seriesId: string) => translationRoomService.cancelSeries(seriesId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

/** Update translationRoom settings mutation */
export function useUpdateTranslationRoomSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRoomSettingsRequest }) => {
      await translationRoomService.updateSettings(id, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, id] });
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

/**
 * WT-468 — which languages the pre-join screen may offer for a room code.
 *
 * The policy belongs to the workspace that OWNS the room, not to whichever workspace the joiner
 * has selected. The screen holds only a code and cannot resolve the room until the join itself,
 * which is why it used to fall back to the joiner's own workspace settings and offer the wrong
 * list to anyone joining across workspaces.
 *
 * Disabled below 4 characters, the same threshold the join button uses, so typing a code does not
 * fire a request per keystroke. Data is kept while a longer code is being typed
 * (`placeholderData: keepPreviousData`) so the picker does not flicker back to the full list
 * mid-edit.
 */
export function useJoinLanguagePolicy(code: string) {
  const trimmed = code.trim();
  return useQuery({
    queryKey: ["translationRooms", "joinLanguagePolicy", trimmed],
    queryFn: () => translationRoomService.getJoinLanguagePolicy(trimmed),
    enabled: trimmed.length >= 4,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Join translationRoom by room code for the web preflight flow */
export function useJoinTranslationRoomByCode() {
  return useMutation({
    mutationFn: async (data: JoinTranslationRoomByCodeRequest) => {
      const { data: joinResult } = await translationRoomService.joinByCode(data);
      return joinResult;
    },
  });
}

/**
 * WT-480: publish or unpublish a finished meeting's record.
 *
 * Invalidates the room so the banner, the badge and the button all re-derive from the stored
 * setting rather than from local optimism — the whole point of this control is that the screen
 * tells the truth about who can read the record.
 */
export function useSetArtifactAccess(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (level: ArtifactAccessLevel) => {
      await translationRoomService.setArtifactAccess(roomId, level);
      return level;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, roomId] });
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

export function useStartTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: translationRoom } = await translationRoomService.start(id);
      return translationRoom;
    },
    onSuccess: (translationRoom, id) => {
      queryClient.setQueryData<TranslationRoomDto>([...MEETING_KEY, id], translationRoom);
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
      queryClient.invalidateQueries({ queryKey: sessionsKey(id) });
    },
  });
}

export function usePauseTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await translationRoomService.pause(id);
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<TranslationRoomDto>([...MEETING_KEY, id], (current) =>
        current ? { ...current, status: "paused" } : current,
      );
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
      queryClient.invalidateQueries({ queryKey: sessionsKey(id) });
    },
  });
}

/**
 * Stop Translation. The room stays live — only the translation session ends — so the transcript
 * keeps arriving and the room's own query data is deliberately left alone. What changes is the
 * session list, which is where "is translation running" is read from.
 */
export function useStopTranslation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await translationRoomService.stopTranslation(id);
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: sessionsKey(id) });
    },
  });
}

export function useResumeTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await translationRoomService.resume(id);
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<TranslationRoomDto>([...MEETING_KEY, id], (current) =>
        current ? { ...current, status: "in_progress" } : current,
      );
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
      queryClient.invalidateQueries({ queryKey: sessionsKey(id) });
    },
  });
}

/** All translation sessions for a room — used to bucket transcript segments into
 * "Translation 1", "Translation 2"... blocks. Polls while the room is live so every
 * participant's transcript picks up a Start/Pause/Resume without a manual refresh. */
export function useTranslationRoomSessions(roomId: string, enabled = true) {
  return useQuery({
    queryKey: sessionsKey(roomId),
    queryFn: async () => {
      const { data } = await translationRoomService.sessions(roomId);
      return data;
    },
    enabled: Boolean(roomId) && enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

/** Self-service consent (or withdrawal) to have MY OWN voice cloned in this room —
 * see TranslationRoomAudioRouteController.SetVoiceCloneConsent. */
export function useSetVoiceCloneConsent(roomId: string) {
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      await translationRoomService.setVoiceCloneConsent(roomId, enabled);
    },
  });
}

/**
 * Make a dub-voice change taken in AuthService reach THIS meeting now.
 *
 * Called after VoiceProfileService.setDubVoice, never instead of it: the setting lives in
 * AuthService, which knows nothing about rooms, and the AI pipeline learns it only from a route
 * payload TranslationRoomService builds. Without this the change is correct everywhere except
 * the meeting the person is standing in.
 */
export function useRefreshDubVoice(roomId: string) {
  return useMutation({
    mutationFn: async () => {
      await translationRoomService.refreshDubVoice(roomId);
    },
  });
}

/**
 * WT-B "flash mode" for THIS room — read by anyone in it, written by the host.
 *
 * Read on an interval as well as on mount, because the host can move it from another client and
 * a guest looking at a stale switch has no way to tell. Cheap: one small GET, and only while the
 * meeting UI is mounted.
 */
export function useFlashMode(roomId: string, enabled = true) {
  return useQuery({
    queryKey: ["translation-room", roomId, "flash-mode"],
    queryFn: () => translationRoomService.getFlashMode(roomId),
    enabled: enabled && Boolean(roomId),
    refetchInterval: 30_000,
    // A room that cannot answer is not an error worth showing anybody. It is NOT rendered as
    // "off" any more, though: the AI side falls back to the deployment default, so "off" was a
    // claim about the room that nothing had actually checked — and it became a false one the day
    // that default turned on. "unknown" renders the same switch position without asserting it.
    retry: false,
    initialData: { enabled: false, source: "unknown" } satisfies FlashModeState,
  });
}

export function useSetFlashMode(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => translationRoomService.setFlashMode(roomId, enabled),
    onSuccess: (enabled) => {
      // Seeded from what the SERVER returned, not from what was asked for. A 403 never reaches
      // here, so the switch cannot show a state the room does not actually have.
      queryClient.setQueryData(["translation-room", roomId, "flash-mode"], enabled);
    },
  });
}

/**
 * How much the STT provider denoises THIS user's own microphone in this meeting.
 *
 * No polling interval, unlike useFlashMode above, and the difference is not an oversight: flash
 * mode is a ROOM setting somebody else can change under you, so a guest's switch has to keep
 * catching up. This is the caller's own microphone and nobody else can move it, so the only writer
 * is the mutation below — which seeds the cache itself.
 */
export function useNoiseReduction(roomId: string, enabled = true) {
  return useQuery({
    queryKey: ["translation-room", roomId, "noise-reduction"],
    queryFn: () => translationRoomService.getNoiseReduction(roomId),
    enabled: enabled && Boolean(roomId),
    // A room that cannot answer is not an error worth showing anybody: the STT worker falls back
    // when it cannot read the key, and "off" is the honest thing to render.
    retry: false,
    initialData: "off" as NoiseReductionMode,
  });
}

export function useSetNoiseReduction(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: NoiseReductionMode) =>
      translationRoomService.setNoiseReduction(roomId, mode),
    onSuccess: (mode) => {
      // Seeded from what the SERVER returned, not from what was asked for — the endpoint refuses
      // an unusable mode, and the menu must never show a mode the pipeline did not accept.
      queryClient.setQueryData(["translation-room", roomId, "noise-reduction"], mode);
    },
  });
}

/** End translationRoom mutation */
export function useEndTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await translationRoomService.end(id);
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<TranslationRoomDto>([...MEETING_KEY, id], (current) =>
        current
          ? {
              ...current,
              status: "ended",
              endedAt: current.endedAt ?? new Date().toISOString(),
            }
          : current
      );
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, id] });
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
      queryClient.invalidateQueries({ queryKey: sessionsKey(id) });
    },
  });
}

export function useCancelTranslationRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: translationRoom } = await translationRoomService.cancel(id);
      return translationRoom;
    },
    onSuccess: (translationRoom, id) => {
      queryClient.setQueryData<TranslationRoomDto>([...MEETING_KEY, id], translationRoom);
      queryClient.invalidateQueries({ queryKey: MEETING_KEY });
    },
  });
}

export function useTranslationRoomParticipants(roomId: string, enabled = true) {
  return useQuery({
    queryKey: [...MEETING_KEY, roomId, "participants"],
    queryFn: async () => {
      const { data } = await translationRoomService.participants(roomId);
      return data;
    },
    enabled: Boolean(roomId) && enabled,
    refetchInterval: 3000,
  });
}

export function useTranslationRoomInvitations(roomId: string) {
  return useQuery({
    queryKey: [...MEETING_KEY, roomId, "invitations"],
    queryFn: async () => {
      const { data } = await translationRoomService.invitations(roomId);
      return data;
    },
    enabled: Boolean(roomId),
  });
}

export function useUpdateParticipantAudio(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      participantId,
      isTranslationAudioEnabled,
    }: {
      participantId: string;
      isTranslationAudioEnabled: boolean;
    }) => {
      await translationRoomService.updateParticipantAudio(roomId, participantId, isTranslationAudioEnabled);
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<TranslationRoomParticipantDto[]>([...MEETING_KEY, roomId, "participants"], (current) =>
        current?.map((participant) =>
          participant.id === variables.participantId
            ? { ...participant, isTranslationAudioEnabled: variables.isTranslationAudioEnabled }
            : participant
        )
      );
    },
  });
}

export function useAdmitParticipant(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participantId: string) => {
      await translationRoomService.admitParticipant(roomId, participantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, roomId, "participants"] });
    },
  });
}

export function useKickParticipant(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participantId: string) => {
      await translationRoomService.kickParticipant(roomId, participantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, roomId, "participants"] });
    },
  });
}

export function useLeaveTranslationRoom(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await translationRoomService.leave(roomId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MEETING_KEY, roomId, "participants"] });
    },
  });
}

export function useTranslationRoomFeedbackState(roomId: string) {
  return useQuery({
    queryKey: [...ROOM_FEEDBACK_KEY, roomId],
    queryFn: async () => {
      const { data } = await translationRoomService.getFeedbackState(roomId);
      return data;
    },
    enabled: Boolean(roomId),
  });
}

export function useSubmitTranslationRoomFeedback(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SubmitTranslationRoomFeedbackRequest) => {
      const { data: feedback } = await translationRoomService.submitFeedback(roomId, data);
      return feedback;
    },
    onSuccess: (feedback) => {
      queryClient.setQueryData<TranslationRoomFeedbackStateDto>(
        [...ROOM_FEEDBACK_KEY, roomId],
        {
          hasSubmitted: true,
          feedback,
        }
      );
      queryClient.setQueryData<TranslationRoomFeedbackDto>(
        [...ROOM_FEEDBACK_KEY, roomId, "submission"],
        feedback
      );
    },
  });
}

export function useRoomPreflight(roomCode: string, enabled = true) {
  return useQuery({
    queryKey: ["translationRooms", "preflight", roomCode],
    queryFn: () => translationRoomService.preflight(roomCode),
    enabled: enabled && !!roomCode,
    staleTime: 5000,
  });
}
