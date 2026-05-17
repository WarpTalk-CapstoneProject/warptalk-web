import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CreateTranslationRoomRequest,
  JoinTranslationRoomByCodeRequest,
  JoinTranslationRoomRequest,
  JoinTranslationRoomResultDto,
  TranslationRoomDto,
  TranslationRoomParticipantDto,
  TranslationRoomPreflightDto,
  TranslationRoomStatus,
} from "@/types/translationRoom";
import { getAvailableTargets, normalizeLanguageCode, parseTargetLanguages } from "@/lib/languages";

const MOCK_ROOM: TranslationRoomPreflightDto = {
  id: "5fd7f8b8-0e55-47ac-9f9c-c27a9b4a8d2e",
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

function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function isGuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function lifecycleMockAdapter(
  id: string,
  status: TranslationRoomStatus
): Promise<{ data: TranslationRoomDto }> {
  await new Promise((resolve) => setTimeout(resolve, 450));
  const now = new Date().toISOString();

  return {
    data: {
      id,
      workspaceId: "mock-workspace",
      hostId: "demo-host",
      title: MOCK_ROOM.title,
      description: "WT-96 lifecycle placeholder room.",
      translationRoomCode: MOCK_ROOM.translationRoomCode,
      status,
      translationRoomType: "group",
      maxParticipants: MOCK_ROOM.maxParticipants,
      sourceLanguage: MOCK_ROOM.sourceLanguage,
      targetLanguages: JSON.stringify(MOCK_ROOM.targetLanguages),
      scheduledAt: now,
      startedAt: status === "in_progress" ? now : undefined,
      endedAt: status === "ended" ? now : undefined,
      createdAt: now,
    },
  };
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
    KICKED: {
      status: "kicked",
      message: "You were removed from this meeting and cannot rejoin.",
    },
    REJECTED: {
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
  create(data: CreateTranslationRoomRequest) {
    return apiClient.post<TranslationRoomDto>(API.translationRooms.create, data);
  },

  get(id: string) {
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
      const targetLanguages = parseTargetLanguages(roomResponse.data.targetLanguages);

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
              targetLanguages.length > 0
                ? targetLanguages
                : getAvailableTargets(data.speakLanguage).slice(0, 1).map((language) => language.code),
            defaultTargetLanguage: normalizeLanguageCode(data.listenLanguage),
            translationMode: targetLanguages.length > 1 ? "multi" : "single",
            desktopAppRequired: true,
          },
          participant: participantResponse.data,
        } satisfies JoinTranslationRoomResultDto,
      };
    }

    return { data: await joinByCodeMockAdapter({ ...data, translationRoomCode: codeOrId }) };
  },

  /** Backend contract placeholder for WT-96: POST /translationRooms/{id}/start. */
  start(id: string) {
    return lifecycleMockAdapter(id, "in_progress");
  },

  end(id: string) {
    return apiClient.post<void>(API.translationRooms.end(id));
  },

  /** Backend contract placeholder for WT-96: POST /translationRooms/{id}/cancel. */
  cancel(id: string) {
    return lifecycleMockAdapter(id, "cancelled");
  },
};
