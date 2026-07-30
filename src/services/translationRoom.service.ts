import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CreateTranslationRoomRequest,
  JoinTranslationRoomByCodeRequest,
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
  TranslationRoomStatus,
  UpdateRoomSettingsRequest,
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

export const translationRoomService = {
  async create(data: CreateTranslationRoomRequest) {
    const response = await apiClient.post<BackendRoom>(API.translationRooms.create, toBackendCreateRequest(data));
    return { ...response, data: normalizeRoom(response.data) };
  },

  async list(params?: {
    status?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
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
    const response = await apiClient.get<BackendRoom>(API.translationRooms.get(id));
    return { ...response, data: normalizeRoom(response.data) };
  },

  async participants(id: string) {
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

  end(id: string) {
    return apiClient.post<void>(API.translationRooms.end(id));
  },

  async cancel(id: string) {
    const response = await apiClient.post<BackendRoom>(API.translationRooms.cancel(id));
    return { ...response, data: normalizeRoom(response.data) };
  },

  async history(params?: {
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

  async artifacts(id: string) {
    return apiClient.get<TranslationRoomArtifactDto[]>(API.translationRooms.artifacts(id));
  },

  artifactDownload(id: string) {
    return apiClient.get<{
      url?: string | null;
      content?: string | null;
      fileName: string;
      contentType: string;
    }>(API.roomArtifacts.download(id));
  },

  approveArtifactConsent(id: string) {
    return apiClient.post<void>(API.roomArtifacts.consent(id));
  },

  async invitations(id: string) {
    return apiClient.get<TranslationRoomInvitationDto[]>(API.translationRooms.invitations(id));
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

  downloadCalendarIcs(id: string) {
    return apiClient.get<Blob>(API.translationRooms.calendarIcs(id), {
      responseType: "blob",
    });
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
