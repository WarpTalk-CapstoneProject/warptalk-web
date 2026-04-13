import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  CreateTranslationRoomRequest,
  JoinTranslationRoomRequest,
  TranslationRoomDto,
  TranslationRoomParticipantDto,
} from "@/types/translationRoom";

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

  end(id: string) {
    return apiClient.post<void>(API.translationRooms.end(id));
  },
};
