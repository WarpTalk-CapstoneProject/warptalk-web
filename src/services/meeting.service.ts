import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { BridgeTokenDto, JoinMeetingResponseDto, RecordingStateDto, TriggerAiRequest } from "@/types/meeting";

export const meetingService = {
  join(translationRoomId: string, displayName?: string) {
    return apiClient.post<JoinMeetingResponseDto>(API.meetings.join(translationRoomId), { displayName });
  },

  /**
   * WT-525. A publish-only LiveKit token for the stand-in seat of an EXTERNAL_BRIDGE room, so a
   * second connection can carry the far side of a Google Meet call into the meeting under an
   * identity the pipeline attributes to them rather than to the host.
   *
   * The server refuses unless the caller hosts the room AND the room is a bridge, so a 403 here
   * is a real answer, not a transient one — do not retry it.
   */
  bridgeToken(translationRoomId: string) {
    return apiClient.post<BridgeTokenDto>(API.meetings.bridgeToken(translationRoomId));
  },

  triggerAi(translationRoomId: string, data: TriggerAiRequest) {
    return apiClient.post<{ message: string }>(API.meetings.triggerAi(translationRoomId), data);
  },

  chatList(roomId: string) {
    return apiClient.get<import("@/types/realtime").ChatMessageDto[]>(API.meetings.chatList(roomId));
  },

  chatSend(roomId: string, data: { originalText: string; originalLanguage: string; translationEnabled: boolean; mentions?: import("@/types/realtime").ChatMentionDto[] }) {
    return apiClient.post<import("@/types/realtime").ChatMessageDto>(API.meetings.chatSend(roomId), data);
  },

  chatSendFile(roomId: string, file: File, onUploadProgress?: (percent: number) => void) {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post<import("@/types/meeting-chat-file").ChatFileMessageDto>(
      API.meetings.chatSendFile(roomId),
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (onUploadProgress && event.total) {
            onUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      }
    );
  },

  chatTranslate(roomId: string, messageId: string, targetLanguage: string) {
    return apiClient.post<import("@/types/realtime").ChatMessageTranslationDto>(
      API.meetings.chatTranslate(roomId, messageId),
      { targetLanguage }
    );
  },

  chatModerate(roomId: string, messageId: string, reason: string) {
    return apiClient.post<void>(API.meetings.chatModerate(roomId, messageId), { reason });
  },

  rejectParticipant(roomId: string, participantId: string) {
    return apiClient.post<{ message: string }>(API.meetings.rejectParticipant(roomId, participantId));
  },

  transferHost(roomId: string, newHostId: string) {
    return apiClient.post<{ message: string }>(API.meetings.transferHost(roomId, newHostId));
  },

  /**
   * Silences a participant's microphone at the SFU. There is no unmute counterpart on
   * purpose: turning somebody's microphone back on without them touching it is not a host
   * power any conferencing product grants, and LiveKit does not pretend otherwise.
   */
  muteParticipant(roomId: string, participantId: string) {
    return apiClient.post<{ message: string }>(API.meetings.muteParticipant(roomId, participantId));
  },

  kickParticipant(roomId: string, participantId: string) {
    return apiClient.post<{ message: string }>(API.meetings.kickParticipant(roomId, participantId));
  },

  endMeeting(roomId: string) {
    return apiClient.post<{ message: string }>(API.meetings.endMeeting(roomId));
  },

  setLock(roomId: string, locked: boolean) {
    return apiClient.post<{ message: string }>(API.meetings.setLock(roomId), { locked });
  },

  setMuteOnEntry(roomId: string, muteOnEntry: boolean) {
    return apiClient.post<{ message: string }>(API.meetings.setMuteOnEntry(roomId), { muteOnEntry });
  },

  setRecording(roomId: string, action: "start" | "stop") {
    return apiClient.post<RecordingStateDto>(API.meetings.setRecording(roomId), { action });
  },
};
