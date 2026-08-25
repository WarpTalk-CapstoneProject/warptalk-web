import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import {
  getMeetingSummarySeedArtifactById,
  getMeetingSummarySeedArtifacts,
  getMeetingSummarySeedParticipants,
  getMeetingSummarySeedRoom,
  isMeetingSummarySeedRoomId,
} from "@/lib/meeting/meeting-summary-seed";
import type { ArtifactAccessLevel } from "@/lib/meeting/record-sharing";
import {
  normalizeNoiseReductionMode,
  type NoiseReductionMode,
} from "@/lib/meeting/noise-reduction";
import type {
  CancelSeriesResult,
  CreateRecurringRoomResponse,
  CreateTranslationRoomRequest,
  JoinTranslationRoomByCodeRequest,
  JoinTranslationRoomRequest,
  JoinTranslationRoomResultDto,
  SubmitTranslationRoomFeedbackRequest,
  TranslationRoomArtifactDto,
  TranslationRoomDto,
  TranslationRoomFeedbackDto,
  TranslationRoomFeedbackStateDto,
  TranslationRoomHistoryResponse,
  TranslationRoomListResponse,
  TranslationRoomParticipantDto,
  TranslationRoomInvitationDto,
  TranslationRoomPreflightDto,
  TranslationRoomSessionDto,
  TranslationRoomStatus,
  UpdateRoomSettingsRequest,
  RoomPreflightResponse,
  RecurrenceRequest,
  RecurrenceSummaryResponse,
  SeriesDetail,
  UpdateSeriesRequest,
  UpdateSeriesResult,
} from "@/types/translationRoom";

type BackendRoom = Omit<TranslationRoomDto, "status" | "translationRoomType" | "targetLanguages"> & {
  status: string;
  translationRoomType: string;
  targetLanguages?: string[] | string;
};

type BackendParticipant = Omit<TranslationRoomParticipantDto, "role" | "status"> & {
  role: string;
  status: string;
};

/** WT-327: the recurring shape of the same POST, before status/language normalisation. */
type BackendRecurringCreate = {
  series: RecurrenceSummaryResponse;
  firstOccurrence: BackendRoom;
  materializedOccurrenceCount: number;
  totalOccurrenceCount: number;
};

type BackendJoinResponse = {
  room: BackendRoom;
  participant: BackendParticipant;
};

const statusMap: Record<string, TranslationRoomStatus> = {
  SCHEDULED: "scheduled",
  WAITING: "waiting",
  IN_PROGRESS: "in_progress",
  PAUSED: "paused",
  ENDED: "ended",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  FAILED: "failed",
};

function normalizeStatus(status: string): TranslationRoomStatus {
  const key = status.toUpperCase();
  return statusMap[key] ?? (status.toLowerCase() as TranslationRoomStatus);
}

function normalizeTargetLanguages(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value
      .split(",")
      .map((language) => language.trim())
      .filter(Boolean);
  }
}

function normalizeRole(role: string): TranslationRoomParticipantDto["role"] {
  return role.toLowerCase() as TranslationRoomParticipantDto["role"];
}

function normalizeParticipantStatus(status: string): TranslationRoomParticipantDto["status"] {
  const normalized = status.toLowerCase();
  return (normalized === "kicked" ? "removed" : normalized) as TranslationRoomParticipantDto["status"];
}

function normalizeRoom(room: BackendRoom): TranslationRoomDto {
  return {
    ...room,
    status: normalizeStatus(room.status || "scheduled"),
    translationRoomType: room.translationRoomType?.toLowerCase() || "scheduled",
    targetLanguages: normalizeTargetLanguages(room.targetLanguages),
  };
}

function normalizeParticipant(participant: BackendParticipant): TranslationRoomParticipantDto {
  return {
    ...participant,
    role: normalizeRole(participant.role),
    status: normalizeParticipantStatus(participant.status),
  };
}

function toBackendCreateRequest(data: CreateTranslationRoomRequest) {
  return {
    ...data,
    translationRoomType: data.translationRoomType.toUpperCase(),
    targetLanguages: data.targetLanguages,
  };
}

function toPreflight(room: TranslationRoomDto, participantCount = 0): TranslationRoomPreflightDto {
  const defaultTargetLanguage = room.targetLanguages[0] ?? room.sourceLanguage ?? "en";

  return {
    id: room.id,
    title: room.title,
    translationRoomCode: room.translationRoomCode,
    status: room.status,
    maxParticipants: room.maxParticipants,
    currentParticipants: participantCount,
    topics: [],
    keyTerms: [],
    sourceLanguage: room.sourceLanguage ?? "en",
    targetLanguages: room.targetLanguages,
    defaultTargetLanguage,
    translationMode: room.targetLanguages.length > 1 ? "multi" : "single",
    desktopAppRequired: true,
  };
}

/**
 * What flash mode is actually doing for a room, and why.
 *
 * `enabled` used to be the whole answer, and it meant "a per-room override exists and says on".
 * That is a different question from the one the switch asks — whether the room is streaming —
 * and the two diverged the moment the deployment default became on: an untouched room read
 * "off" while streaming, and turning the switch on and off again wrote a real override that
 * took away the speed it had been wrong about.
 *
 * `source` is what lets the panel say WHICH of those it is looking at.
 */
export type FlashModeState = {
  enabled: boolean;
  /** "room" = a host chose it · "deployment" = following the default · "unknown" = neither is known. */
  source: "room" | "deployment" | "unknown";
};

export const translationRoomService = {
  async create(data: CreateTranslationRoomRequest) {
    const response = await apiClient.post<BackendRoom>(API.translationRooms.create, toBackendCreateRequest(data));
    return { ...response, data: normalizeRoom(response.data) };
  },

  /**
   * WT-327: create a repeating booking.
   *
   * A separate method rather than a union return from `create`, so no caller has to type-guard
   * a response shape at runtime — the dialog already knows which one it asked for. The server
   * hands back the first materialised occurrence, which is an ordinary room, so the success
   * screen that follows is exactly the one a single meeting produces.
   */
  async createRecurring(data: CreateTranslationRoomRequest & { recurrence: RecurrenceRequest }) {
    const response = await apiClient.post<BackendRecurringCreate>(
      API.translationRooms.create,
      toBackendCreateRequest(data),
    );
    const normalized: CreateRecurringRoomResponse = {
      ...response.data,
      firstOccurrence: normalizeRoom(response.data.firstOccurrence),
    };
    return { ...response, data: normalized };
  },

  /**
   * WT-327: the booking, its rule, and every occurrence the caller may see.
   *
   * Occurrences come back as ordinary rooms and are normalised as such — the series view renders
   * each one with the same status vocabulary the meetings list uses, so a skipped Tuesday reads
   * as "Cancelled" there exactly as it does anywhere else.
   */
  async getSeries(seriesId: string) {
    const response = await apiClient.get<SeriesDetail & { occurrences: BackendRoom[] }>(
      API.translationRoomSeries.get(seriesId),
    );

    const normalized: SeriesDetail = {
      ...response.data,
      occurrences: response.data.occurrences.map((room) => normalizeRoom(room)),
    };
    return normalized;
  },

  /**
   * WT-327: edit the BOOKING. The server applies it to the template and to every occurrence still
   * ahead — meetings that already started keep what they ran with.
   */
  async updateSeries(seriesId: string, data: UpdateSeriesRequest) {
    const response = await apiClient.patch<UpdateSeriesResult>(
      API.translationRoomSeries.update(seriesId),
      data,
    );
    return response.data;
  },

  /**
   * WT-327: stop the whole series. Future occurrences are cancelled with it; meetings that
   * already ran are left alone. Cancelling a SINGLE occurrence is the ordinary
   * `translationRoomService.cancel(roomId)` and does not touch the series.
   */
  async cancelSeries(seriesId: string, keepOccurrenceId?: string) {
    const response = await apiClient.post<CancelSeriesResult>(
      API.translationRoomSeries.cancel(seriesId, keepOccurrenceId),
    );
    return response.data;
  },

  async list(params?: {
    status?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    /**
     * Scopes the list to one workspace. Send it from any workspace-scoped screen: the server can
     * only widen the list to a workspace Owner/Admin when it knows which workspace is being asked
     * about, so omitting it is what left an Admin looking at "No active meetings found." for a
     * workspace full of rooms. It also keeps a workspace-scoped page from listing another
     * workspace's meetings.
     */
    workspaceId?: string;
    /**
     * WT-327: collapse a repeating booking's occurrences into the ONE meeting the user booked.
     *
     * Send it from the meetings list, where a daily standup is one answer to "what meetings do I
     * have?", not fourteen. Do NOT send it from the home day panel, where the occurrence IS the
     * meeting and collapsing would empty every day but one.
     */
    groupBySeries?: boolean;
  }) {
    const response = await apiClient.get<TranslationRoomListResponse>(API.translationRooms.list, { params });
    return {
      ...response,
      data: {
        ...response.data,
        rooms: response.data.rooms.map((room) => normalizeRoom(room as BackendRoom)),
      },
    };
  },

  async get(id: string) {
    const seedRoom = getMeetingSummarySeedRoom(id);
    if (seedRoom) {
      return { data: seedRoom };
    }
    const response = await apiClient.get<BackendRoom>(API.translationRooms.get(id));
    return { ...response, data: normalizeRoom(response.data) };
  },

  async participants(id: string) {
    const seedParticipants = getMeetingSummarySeedParticipants(id);
    if (seedParticipants) {
      return { data: seedParticipants };
    }
    const response = await apiClient.get<BackendParticipant[]>(API.translationRooms.participants(id));
    return { ...response, data: response.data.map(normalizeParticipant) };
  },

  async updateParticipantAudio(id: string, participantId: string, isTranslationAudioEnabled: boolean) {
    return apiClient.put<void>(API.translationRooms.participantAudio(id, participantId), {
      isTranslationAudioEnabled,
    });
  },

  async admitParticipant(id: string, participantId: string) {
    return apiClient.put<void>(API.translationRooms.admitParticipant(id, participantId));
  },

  async kickParticipant(id: string, participantId: string) {
    return apiClient.put<void>(API.translationRooms.kickParticipant(id, participantId));
  },

  async leave(id: string) {
    return apiClient.put<void>(API.translationRooms.leave(id));
  },

  /**
   * WT-433 (Linear): join by room ID — what a shared LINK produces. Server-gated on membership
   * of the room's workspace; a requires-approval room lands the caller in the waiting room, so
   * this is how an uninvited teammate asks to join instead of dead-ending on the detail page.
   */
  async joinById(roomId: string, data: JoinTranslationRoomRequest) {
    // WT-555: no `translationRoomCode` key at all. It used to send "" to satisfy a shared request
    // type, and the server's by-code validator — which also ran on this route — answered every
    // shared meeting link with 400 "The TranslationRoomCode field is required." The route names
    // the room; the server reads the code off it.
    return apiClient.post<BackendJoinResponse>(`/translation-rooms/${roomId}/join`, {
      displayName: data.displayName.trim(),
      speakLanguage: data.speakLanguage,
      listenLanguage: data.listenLanguage,
    });
  },

  /**
   * WT-468 — the language whitelist of the workspace that OWNS the room behind this code.
   *
   * Always resolves. The server answers 200 with an empty list for an unknown or half-typed
   * code, and empty means unrestricted, so a caller may poll this as the user types without
   * painting an error over an incomplete code or momentarily emptying a picker.
   */
  /**
   * WT-480: share this meeting's record with everyone who took part, or take it back.
   *
   * One call covers the transcript, the AI summary and the recording — they are governed by a
   * single room setting, which is why the button that calls this names all three.
   *
   * Its own route rather than the settings PUT: that endpoint refuses any room past WAITING, and
   * a record can only be shared once the meeting has ended and the artifacts exist.
   */
  async setArtifactAccess(roomId: string, level: ArtifactAccessLevel) {
    await apiClient.put<void>(API.translationRooms.artifactAccess(roomId), { level });
  },

  async getJoinLanguagePolicy(code: string) {
    // WT-490: `roomLanguages` is the set the ROOM declares (source + targets). Both lists arrive
    // separately and are intersected client-side by meetingLanguagesForRoom, because an empty list
    // means "unrestricted from this source" and pre-intersecting would make either empty read as
    // "offer nothing". Optional in the type so a web build in front of an older backend degrades to
    // the previous behaviour instead of offering an empty picker.
    const response = await apiClient.get<{
      allowedTargetLanguages: string[];
      roomLanguages?: string[];
    }>(API.translationRooms.joinLanguagePolicy(code));
    return response.data;
  },

  async joinByCode(data: JoinTranslationRoomByCodeRequest) {
    const response = await apiClient.post<BackendJoinResponse>(API.translationRooms.join, {
      translationRoomCode: data.translationRoomCode.trim(),
      displayName: data.displayName.trim(),
      speakLanguage: data.speakLanguage,
      listenLanguage: data.listenLanguage,
    });
    const room = normalizeRoom(response.data.room);
    const participant = normalizeParticipant(response.data.participant);

    return {
      ...response,
      data: {
        status: "success",
        message: participant.status === "waiting" ? "Waiting for host approval." : "Joining meeting.",
        room: toPreflight(room, participant.status === "waiting" ? 0 : 1),
        participant,
      } satisfies JoinTranslationRoomResultDto,
    };
  },

  async generateAudioRoutes(id: string) {
    return apiClient.post<void>(API.translationRooms.generateAudioRoutes(id));
  },

  /** Consent (or withdraw consent) to have MY OWN voice cloned for every listener I
   * currently speak to in this room — see TranslationRoomAudioRouteController.
   * SetVoiceCloneConsent. Biometric data: only ever called from an explicit user action. */
  async setVoiceCloneConsent(id: string, enabled: boolean) {
    return apiClient.post<void>(API.translationRooms.voiceCloneConsent(id), { enabled });
  },

  /**
   * Tell this room to re-read every speaker's chosen dub voice from AuthService and republish
   * its routes.
   *
   * Called AFTER VoiceProfileService.setDubVoice, never instead of it. The setting itself lives
   * in AuthService, which knows nothing about rooms — so without this the change is correct
   * everywhere except the meeting the person is currently in, until somebody joins or
   * translation is restarted and a publish happens for some other reason.
   */
  async refreshDubVoice(id: string) {
    return apiClient.post<void>(API.translationRooms.refreshDubVoice(id));
  },

  /**
   * WT-B "flash mode" — whether this ROOM streams audio to STT while a speaker is still talking.
   *
   * Readable by any participant, so a guest can render the switch where the host left it rather
   * than guessing. Writing is host-only and answers 403 to anybody else, which the caller must
   * surface rather than swallow: a switch that silently springs back is worse than one that says
   * it is not yours to move.
   */
  async getFlashMode(id: string): Promise<FlashModeState> {
    const { data } = await apiClient.get<FlashModeState>(API.translationRooms.flashMode(id));
    // An older gateway sends only `enabled`. Reading that as "unknown" rather than inventing a
    // source keeps the copy hedged during a rolling deploy instead of confidently wrong.
    return { enabled: Boolean(data?.enabled), source: data?.source ?? "unknown" };
  },

  async setFlashMode(id: string, enabled: boolean): Promise<FlashModeState> {
    const { data } = await apiClient.put<FlashModeState>(
      API.translationRooms.flashMode(id),
      { enabled },
    );
    // Always "room" once this succeeds: setting it IS the act of creating an override.
    return { enabled: Boolean(data?.enabled), source: data?.source ?? "room" };
  },

  /**
   * How much the STT provider denoises THIS caller's own microphone in this meeting.
   *
   * NOT the noise-suppression toggle in the same menu. That one is Krisp/the browser filtering the
   * raw microphone, which changes what other people HEAR. This one changes how accurately what you
   * say is RECOGNISED, and touches nobody else's audio — which is also why, unlike flash mode
   * above, any participant may set it for themselves without the host.
   *
   * Self-service, so there is no 403 branch to think about: the only failure worth surfacing is a
   * write that did not happen.
   */
  async getNoiseReduction(id: string) {
    const { data } = await apiClient.get<{ mode: NoiseReductionMode }>(
      API.translationRooms.noiseReduction(id),
    );
    return normalizeNoiseReductionMode(data?.mode);
  },

  async setNoiseReduction(id: string, mode: NoiseReductionMode) {
    const { data } = await apiClient.put<{ mode: NoiseReductionMode }>(
      API.translationRooms.noiseReduction(id),
      { mode },
    );
    return normalizeNoiseReductionMode(data?.mode);
  },

  async start(id: string) {
    const response = await apiClient.post<BackendRoom>(API.translationRooms.start(id));
    return { ...response, data: normalizeRoom(response.data) };
  },

  pause(id: string) {
    return apiClient.post<void>(API.translationRooms.pause(id));
  },

  resume(id: string) {
    return apiClient.post<void>(API.translationRooms.resume(id));
  },
  /**
   * Ends the room's translation session and leaves the room IN_PROGRESS, so transcription
   * carries on. `pause` moves the room to PAUSED, which the AI workers read as "ignore this
   * room's microphone" — that stops the transcript too, and is a different thing to ask for.
   */
  stopTranslation(id: string) {
    return apiClient.post<void>(API.translationRooms.stopTranslation(id));
  },

  end(id: string) {
    return apiClient.post<void>(API.translationRooms.end(id));
  },

  async cancel(id: string) {
    const response = await apiClient.post<BackendRoom>(API.translationRooms.cancel(id));
    return { ...response, data: normalizeRoom(response.data) };
  },

  async history(params?: {
    workspaceId?: string;
    status?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const response = await apiClient.get<TranslationRoomHistoryResponse>(API.translationRooms.history, { params });
    return {
      ...response,
      data: {
        ...response.data,
        rooms: response.data.rooms.map((item) => ({
          ...item,
          room: normalizeRoom(item.room as BackendRoom),
          participants: item.participants.map((participant) => normalizeParticipant(participant as BackendParticipant)),
        })),
      },
    };
  },

  /**
   * WT-333 — the caller's own meetings in one workspace, past and upcoming together (UC 25).
   *
   * Same response shape as `history`, and normalised the same way, so the two stay interchangeable
   * for anything that consumes a room + roster + artifacts. What differs is on the server: this
   * route pins the scope to the caller, carries no status filter, and orders by the booked slot.
   *
   * `workspaceId` is required by the server; sending nothing gets a 400 rather than every
   * workspace, which is the intended answer.
   */
  async myMeetings(params: {
    workspaceId: string;
    from?: string;
    to?: string;
    search?: string;
    status?: string;
    pageSize?: number;
  }) {
    const response = await apiClient.get<TranslationRoomHistoryResponse>(API.translationRooms.myMeetings, { params });
    return {
      ...response,
      data: {
        ...response.data,
        rooms: response.data.rooms.map((item) => ({
          ...item,
          room: normalizeRoom(item.room as BackendRoom),
          participants: item.participants.map((participant) => normalizeParticipant(participant as BackendParticipant)),
        })),
      },
    };
  },

  async artifacts(id: string) {
    const seedArtifacts = getMeetingSummarySeedArtifacts(id);
    if (seedArtifacts) {
      return { data: seedArtifacts };
    }
    return apiClient.get<TranslationRoomArtifactDto[]>(API.translationRooms.artifacts(id));
  },

  artifactDownload(id: string) {
    const seedArtifact = getMeetingSummarySeedArtifactById(id);
    if (seedArtifact) {
      return Promise.resolve({
        data: {
          url: null,
          content: seedArtifact.content ?? `Seed artifact: ${seedArtifact.title}`,
          fileName: `${seedArtifact.title.toLowerCase().replace(/\s+/g, "-")}.${seedArtifact.fileFormat ?? "txt"}`,
          contentType: seedArtifact.fileFormat === "json" ? "application/json" : "text/plain",
        },
      });
    }
    return apiClient.get<{
      url?: string | null;
      content?: string | null;
      fileName: string;
      contentType: string;
    }>(API.roomArtifacts.download(id));
  },

  approveArtifactConsent(id: string) {
    if (getMeetingSummarySeedArtifactById(id)) {
      return Promise.resolve();
    }
    return apiClient.post<void>(API.roomArtifacts.consent(id));
  },

  /**
   * Ask for this meeting's summary to be written again in a different shape.
   *
   * Answers 202, not 200 — the summary is not rewritten when this resolves. It arrives on
   * the artifact, so the caller has to refetch rather than trust the response body.
   */
  regenerateSummary(roomId: string, templateKey: string) {
    if (isMeetingSummarySeedRoomId(roomId)) {
      return Promise.resolve({ data: { message: `Seed summary already available as ${templateKey}.` } });
    }
    return apiClient.post<{ message: string }>(
      API.roomArtifacts.regenerateSummary(roomId),
      { templateKey },
    );
  },

  async invitations(id: string) {
    return apiClient.get<TranslationRoomInvitationDto[]>(API.translationRooms.invitations(id));
  },

  /**
   * WT-552: add somebody to a meeting that is already running.
   *
   * POST to the same path the invitation list is read from. Not `updateSettings` — that endpoint
   * freezes at IN_PROGRESS on purpose, because languages and approval policy must not change
   * under people already in the room.
   *
   * Returns the number actually invited, which can be LOWER than the list submitted: the server
   * treats re-inviting somebody as a no-op. That count is the truth for the toast — this client
   * may not have refetched the invitation list.
   */
  async inviteParticipants(id: string, emails: string[]) {
    const { data } = await apiClient.post<{ invited: number }>(
      API.translationRooms.invitations(id),
      { emails },
    );
    return data;
  },

  /**
   * Accept the invitation addressed to the signed-in account's email.
   *
   * Takes no body: the server matches the row from the caller's own email claim, because
   * invitations are keyed by address and an invitee may have no participant row to name. Sending
   * an invitation id from the client would let one be accepted on somebody else's behalf.
   *
   * Idempotent server-side, so the same notification may be accepted from the popup and again
   * from the bell without the second click failing.
   */
  async acceptInvitation(id: string) {
    const { data } = await apiClient.post<TranslationRoomInvitationDto>(
      API.translationRooms.acceptInvitation(id),
    );
    return data;
  },

  async updateSettings(id: string, data: UpdateRoomSettingsRequest) {
    await apiClient.put<void>(API.translationRooms.settings(id), data);
  },

  getFeedbackState(id: string) {
    return apiClient.get<TranslationRoomFeedbackStateDto>(API.translationRooms.feedbackState(id));
  },

  submitFeedback(id: string, data: SubmitTranslationRoomFeedbackRequest) {
    return apiClient.post<TranslationRoomFeedbackDto>(API.translationRooms.feedback(id), data);
  },

  async preflight(roomCode: string): Promise<RoomPreflightResponse> {
    const { data } = await apiClient.get<RoomPreflightResponse>(API.translationRooms.preflight(roomCode));
    return data;
  },

  downloadCalendarIcs(id: string) {
    return apiClient.get<Blob>(API.translationRooms.calendarIcs(id), {
      responseType: "blob",
    });
  },

  /** Every Start/Resume→Pause/End window for this room, newest first — see
   * TranslationRoomSessionsController.GetSessions. */
  sessions(id: string) {
    return apiClient.get<TranslationRoomSessionDto[]>(API.translationRooms.sessions(id));
  },
};

/** WT-14: "Add to Google Calendar" quick-add link — pure URL template, no backend call. */
export function buildGoogleCalendarUrl(params: {
  title: string;
  scheduledAt: string;
  joinLink: string;
  description?: string;
  durationMinutes?: number;
}): string {
  const start = new Date(params.scheduledAt);
  const end = new Date(start.getTime() + (params.durationMinutes ?? 60) * 60_000);
  const toGoogleDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const details = params.description
    ? `${params.description}\n\nJoin link: ${params.joinLink}`
    : `Join link: ${params.joinLink}`;

  const search = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
    details,
  });

  return `https://calendar.google.com/calendar/render?${search.toString()}`;
}
