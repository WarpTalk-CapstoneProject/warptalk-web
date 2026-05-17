import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CreateTranslationRoomRequest,
  JoinTranslationRoomByCodeRequest,
  JoinTranslationRoomRequest,
  JoinTranslationRoomResultDto,
  SubmitTranslationRoomFeedbackRequest,
  TranslationRoomFeedbackDto,
  TranslationRoomFeedbackStateDto,
  TranslationRoomPreflightDto,
  TranslationRoomDto,
  TranslationRoomListResponse,
  TranslationRoomParticipantDto,
  TranslationRoomStatus,
} from "@/types/translationRoom";
import {
  getAvailableTargets,
  getLanguageName,
  normalizeLanguageCode,
  parseTargetLanguages,
} from "@/lib/languages";

const DEMO_ROOM_ID = "5fd7f8b8-0e55-47ac-9f9c-c27a9b4a8d2e";
const FEEDBACK_DEMO_ROOM_ID = "wt-98-feedback-demo";
const FEEDBACK_STORAGE_PREFIX = "warptalk.feedback";
const ROOM_CACHE_KEY = "warptalk.translationRooms.demoCache";

const MOCK_ROOM: TranslationRoomPreflightDto = {
  id: DEMO_ROOM_ID,
  title: "Global Strategy Sync",
  translationRoomCode: "GSS-7X2Q",
  status: "in_progress",
  maxParticipants: 24,
  currentParticipants: 9,
  topics: ["quarterly strategy", "regional expansion", "product roadmap"],
  keyTerms: ["APAC", "compliance", "revenue forecast", "investor update"],
  sourceLanguage: "en",
  targetLanguages: ["es", "vi", "ja"],
  defaultTargetLanguage: "es",
  translationMode: "multi",
  desktopAppRequired: true,
};

const MOCK_LIST_ROOM: TranslationRoomDto = {
  id: DEMO_ROOM_ID,
  workspaceId: "mock-workspace",
  hostId: "mock-preview-host",
  title: MOCK_ROOM.title,
  description: "Demo-ready Module 1 room used while the backend list endpoint is pending.",
  translationRoomCode: MOCK_ROOM.translationRoomCode,
  status: "in_progress",
  translationRoomType: "group",
  maxParticipants: MOCK_ROOM.maxParticipants,
  sourceLanguage: MOCK_ROOM.sourceLanguage,
  targetLanguages: JSON.stringify(MOCK_ROOM.targetLanguages),
  startedAt: "2026-05-16T12:00:00.000Z",
  createdAt: "2026-05-16T11:55:00.000Z",
};

const MOCK_FEEDBACK_ROOM: TranslationRoomDto = {
  id: FEEDBACK_DEMO_ROOM_ID,
  workspaceId: "mock-workspace",
  hostId: "mock-preview-host",
  title: "WT-98 Post-room Feedback Review",
  description: "Ended mock room for reviewing the feedback UI while backend feedback endpoints are pending.",
  translationRoomCode: "FBK-98",
  status: "ended",
  translationRoomType: "group",
  maxParticipants: 18,
  sourceLanguage: "en",
  targetLanguages: JSON.stringify(["vi", "ja", "es"]),
  scheduledAt: "2026-05-16T09:00:00.000Z",
  startedAt: "2026-05-16T09:05:00.000Z",
  endedAt: "2026-05-16T09:52:00.000Z",
  createdAt: "2026-05-16T08:45:00.000Z",
};

function readCachedRooms(): TranslationRoomDto[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(ROOM_CACHE_KEY);
    return raw ? (JSON.parse(raw) as TranslationRoomDto[]) : [];
  } catch {
    window.localStorage.removeItem(ROOM_CACHE_KEY);
    return [];
  }
}

function cacheRoom(room: TranslationRoomDto) {
  if (typeof window === "undefined") return;

  const rooms = readCachedRooms().filter((item) => item.id !== room.id);
  window.localStorage.setItem(ROOM_CACHE_KEY, JSON.stringify([room, ...rooms].slice(0, 12)));
}

function getMockRoomById(id: string) {
  const cachedRoom = readCachedRooms().find((room) => room.id === id);
  if (cachedRoom) return cachedRoom;
  if (id === FEEDBACK_DEMO_ROOM_ID) return MOCK_FEEDBACK_ROOM;
  if (id === DEMO_ROOM_ID) return MOCK_LIST_ROOM;
  return undefined;
}

async function listRoomsMockAdapter(): Promise<{ data: TranslationRoomListResponse }> {
  await new Promise((resolve) => setTimeout(resolve, 250));

  return {
    data: {
      rooms: [...readCachedRooms(), MOCK_LIST_ROOM],
      source: "mock",
      knownLimitations: [
        "TODO WT-106 backend contract: GET /translationRooms list endpoint is not implemented.",
        "Local demo cache only includes rooms created in this browser plus the Global Strategy Sync sample.",
      ],
    },
  };
}

async function lifecycleMockAdapter(
  id: string,
  status: TranslationRoomStatus
): Promise<{ data: TranslationRoomDto }> {
  const now = new Date().toISOString();
  let room: TranslationRoomDto;

  try {
    room = (await translationRoomService.get(id)).data;
  } catch {
    room = {
      id,
      workspaceId: "mock-workspace",
      hostId: "mock-preview-host",
      title: MOCK_ROOM.title,
      description: "WT-96 lifecycle placeholder room.",
      translationRoomCode: MOCK_ROOM.translationRoomCode,
      status: "scheduled",
      translationRoomType: "group",
      maxParticipants: MOCK_ROOM.maxParticipants,
      sourceLanguage: MOCK_ROOM.sourceLanguage,
      targetLanguages: JSON.stringify(MOCK_ROOM.targetLanguages),
      scheduledAt: now,
      createdAt: now,
    };
  }

  return {
    data: {
      ...room,
      status,
      startedAt: status === "in_progress" ? room.startedAt ?? now : room.startedAt,
      endedAt: status === "ended" ? now : room.endedAt,
    },
  };
}

function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function isGuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function feedbackStorageKey(roomId: string, userId: string) {
  return `${FEEDBACK_STORAGE_PREFIX}.${roomId}.${userId}`;
}

function readFeedbackMock(roomId: string, userId: string): TranslationRoomFeedbackDto | undefined {
  if (typeof window === "undefined") return undefined;

  const stored = window.localStorage.getItem(feedbackStorageKey(roomId, userId));
  if (!stored) return undefined;

  try {
    return JSON.parse(stored) as TranslationRoomFeedbackDto;
  } catch {
    window.localStorage.removeItem(feedbackStorageKey(roomId, userId));
    return undefined;
  }
}

async function feedbackStateMockAdapter(roomId: string, userId: string): Promise<{ data: TranslationRoomFeedbackStateDto }> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const feedback = readFeedbackMock(roomId, userId);

  return {
    data: {
      hasSubmitted: Boolean(feedback),
      feedback,
    },
  };
}

async function submitFeedbackMockAdapter(
  roomId: string,
  userId: string,
  data: SubmitTranslationRoomFeedbackRequest
): Promise<{ data: TranslationRoomFeedbackDto }> {
  await new Promise((resolve) => setTimeout(resolve, 700));

  const existing = readFeedbackMock(roomId, userId);
  if (existing) {
    throw new Error("Feedback has already been submitted for this room.");
  }

  const feedback: TranslationRoomFeedbackDto = {
    id: crypto.randomUUID(),
    translationRoomId: roomId,
    userId,
    overallRating: data.overallRating,
    translationQuality: data.translationQuality,
    audioQuality: data.audioQuality,
    voiceCloneQuality: data.voiceCloneQuality,
    aiSummaryQuality: data.aiSummaryQuality,
    comments: data.comments?.trim() || undefined,
    communicationInsights:
      data.aiSummaryQuality || data.comments
        ? {
            aiSummaryQuality: data.aiSummaryQuality,
            submittedFrom: "warptalk-web",
          }
        : undefined,
    createdAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(feedbackStorageKey(roomId, userId), JSON.stringify(feedback));
  }

  return { data: feedback };
}

async function joinByCodeMockAdapter(
  request: JoinTranslationRoomByCodeRequest
): Promise<JoinTranslationRoomResultDto> {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const code = normalizeRoomCode(request.translationRoomCode);
  const statusMap: Record<string, JoinTranslationRoomResultDto> = {
    "BAD-CODE": {
      status: "invalid_code",
      message: "That room code does not match an active WarpTalk meeting.",
    },
    "OFF-LINE": {
      status: "room_unavailable",
      message: "This meeting is not available yet or has already ended.",
    },
    "FULL-ROOM": {
      status: "room_full",
      message: "This meeting is full. Ask the host to raise the participant limit.",
    },
    "KICKED": {
      status: "kicked",
      message: "You were removed from this meeting and cannot rejoin.",
    },
    "REJECTED": {
      status: "rejected",
      message: "The host rejected this join request.",
    },
  };

  if (statusMap[code]) {
    return statusMap[code];
  }

  if (!/^[A-Z0-9]{3}-?[A-Z0-9]{4,6}$/.test(code)) {
    return {
      status: "invalid_code",
      message: "Enter a valid room code, for example GSS-7X2Q.",
    };
  }

  return {
    status: "success",
    message: "Joining meeting.",
    room: {
      ...MOCK_ROOM,
      translationRoomCode: request.translationRoomCode.trim() || MOCK_ROOM.translationRoomCode,
    },
    participant: {
      id: "mock-participant",
      translationRoomId: MOCK_ROOM.id,
      userId: "mock-user",
      displayName: request.displayName,
      role: "participant",
      listenLanguage: request.listenLanguage,
      speakLanguage: request.speakLanguage,
      status: "joined",
      joinedAt: new Date().toISOString(),
    },
  };
}

/** TranslationRoom service — maps to TranslationRoomsController endpoints */
export const translationRoomService = {
  async create(data: CreateTranslationRoomRequest) {
    const response = await apiClient.post<TranslationRoomDto>(API.translationRooms.create, data);
    cacheRoom(response.data);
    return response;
  },

  /**
   * Backend contract placeholder for WT-92/WT-106.
   * Proposed real endpoint: GET /translationRooms?workspaceId=&status=&cursor=
   * Should return current, scheduled, and ended rooms the authenticated user can access.
   */
  list() {
    return listRoomsMockAdapter();
  },

  async get(id: string) {
    const mockRoom = getMockRoomById(id);
    if (mockRoom) return { data: mockRoom };

    return apiClient.get<TranslationRoomDto>(API.translationRooms.get(id));
  },

  join(id: string, data: JoinTranslationRoomRequest) {
    return apiClient.post<TranslationRoomParticipantDto>(API.translationRooms.join(id), data);
  },

  async joinByCode(data: JoinTranslationRoomByCodeRequest) {
    const codeOrId = normalizeRoomCode(data.translationRoomCode);

    if (isGuid(data.translationRoomCode.trim())) {
      const [roomResponse, participantResponse] = await Promise.all([
        this.get(data.translationRoomCode.trim()),
        this.join(data.translationRoomCode.trim(), data),
      ]);

      return {
        data: {
          status: "success",
          message: "Joining meeting.",
          room: {
            id: roomResponse.data.id,
            title: roomResponse.data.title,
            translationRoomCode: roomResponse.data.translationRoomCode,
            status: roomResponse.data.status,
            maxParticipants: roomResponse.data.maxParticipants,
            currentParticipants: 0,
            topics: [],
            keyTerms: [],
            sourceLanguage: normalizeLanguageCode(roomResponse.data.sourceLanguage ?? data.speakLanguage),
            targetLanguages:
              parseTargetLanguages(roomResponse.data.targetLanguages).length > 0
                ? parseTargetLanguages(roomResponse.data.targetLanguages)
                : getAvailableTargets(data.speakLanguage).slice(0, 1).map((language) => language.code),
            defaultTargetLanguage: normalizeLanguageCode(data.listenLanguage),
            translationMode:
              parseTargetLanguages(roomResponse.data.targetLanguages).length > 1 ? "multi" : "single",
            desktopAppRequired: true,
          },
          participant: participantResponse.data,
        } satisfies JoinTranslationRoomResultDto,
      };
    }

    return { data: await joinByCodeMockAdapter({ ...data, translationRoomCode: codeOrId }) };
  },

  /**
   * Backend contract placeholder for WT-96.
   * Proposed real endpoint: POST /translationRooms/{id}/start -> TranslationRoomDto
   * Legal transition: waiting/scheduled -> in_progress.
   */
  start(id: string) {
    return lifecycleMockAdapter(id, "in_progress");
  },

  end(id: string) {
    return apiClient.post<void>(API.translationRooms.end(id));
  },

  /**
   * Backend contract placeholder for WT-96.
   * Proposed real endpoint: POST /translationRooms/{id}/cancel -> TranslationRoomDto
   * Legal transition: scheduled/waiting -> cancelled.
   */
  cancel(id: string) {
    return lifecycleMockAdapter(id, "cancelled");
  },

  /**
   * Backend contract placeholder for WT-98.
   * Proposed real endpoint: GET /translationRooms/{id}/feedback -> TranslationRoomFeedbackStateDto
   * Should return whether the authenticated user already submitted feedback.
   */
  getFeedbackState(id: string, userId: string) {
    return feedbackStateMockAdapter(id, userId);
  },

  /**
   * Backend contract placeholder for WT-98.
   * Proposed real endpoint: POST /translationRooms/{id}/feedback -> TranslationRoomFeedbackDto
   * Payload maps to translation_room.translation_room_feedback:
   * overall_rating, translation_quality, audio_quality, voice_clone_quality,
   * ai_summary_quality, comments, communication_insights.
   */
  submitFeedback(id: string, userId: string, data: SubmitTranslationRoomFeedbackRequest) {
    return submitFeedbackMockAdapter(id, userId, data);
  },
};

export const supportedLanguageService = {
  async list() {
    return {
      data: getAvailableTargets("auto").map((language) => ({
        ...language,
        label: `${getLanguageName(language.code)} (${language.nativeName})`,
      })),
    };
  },
};
