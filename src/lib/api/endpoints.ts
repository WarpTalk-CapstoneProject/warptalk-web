/**
 * Centralized API endpoints matching Gateway YARP routes.
 * Base URL is set in apiClient (NEXT_PUBLIC_API_URL).
 *
 * Gateway routing:
 *   /api/v1/auth/*          → AuthService :5101  (transforms to /api/auth/*)
 *   /api/v1/translation-rooms/*      → TranslationRoomService :5102
 *   /api/v1/transcripts/*   → TranscriptService :5103
 *   /api/v1/notifications/* → NotificationService :5104
 *   /api/v1/meetings/*      → MeetingService :5105
 */
export const API = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    googleLogin: "/auth/google-login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
    changePassword: "/auth/change-password",
  },
  translationRooms: {
    create: "/translation-rooms",
    list: "/translation-rooms",
    history: "/translation-rooms/history",
    join: "/translation-rooms/join",
    get: (id: string) => `/translation-rooms/${id}`,
    participants: (id: string) => `/translation-rooms/${id}/participants`,
    invitations: (id: string) => `/translation-rooms/${id}/invitations`,
    participantAudio: (id: string, participantId: string) =>
      `/translation-rooms/${id}/participants/${participantId}/audio`,
    admitParticipant: (id: string, participantId: string) =>
      `/translation-rooms/${id}/participants/${participantId}/admit`,
    kickParticipant: (id: string, participantId: string) =>
      `/translation-rooms/${id}/participants/${participantId}/kick`,
    leave: (id: string) => `/translation-rooms/${id}/participants/me/leave`,
    start: (id: string) => `/translation-rooms/${id}/start`,
    end: (id: string) => `/translation-rooms/${id}/end`,
    cancel: (id: string) => `/translation-rooms/${id}/cancel`,
    artifacts: (id: string) => `/translation-rooms/${id}/artifacts`,
    settings: (id: string) => `/translation-rooms/${id}/settings`,
    feedbackState: (id: string) => `/translation-rooms/${id}/feedback/me`,
    feedback: (id: string) => `/translation-rooms/${id}/feedback`,
  },
  transcripts: {
    start: "/transcripts",
    get: (id: string) => `/transcripts/${id}`,
    byRoom: (translationRoomId: string) => `/transcripts/by-room/${translationRoomId}`,
    segments: (id: string) => `/transcripts/${id}/segments`,
    translations: (id: string) => `/transcripts/${id}/translations`,
    exports: (id: string) => `/transcripts/${id}/exports`,
    exportDownload: (id: string, exportId: string) => `/transcripts/${id}/exports/${exportId}/download`,
    correctSegment: (id: string, segmentId: string) => `/transcripts/${id}/segments/${segmentId}/correct`,
    corrections: (id: string, segmentId: string) => `/transcripts/${id}/segments/${segmentId}/corrections`,
    audio: (id: string) => `/transcripts/${id}/audio`,
    finalize: (id: string) => `/transcripts/${id}/finalize`,
  },
  notifications: {
    preferences: "/notifications/preferences",
  },
  meetings: {
    join: (translationRoomId: string) => `/meetings/rooms/${translationRoomId}/join`,
    triggerAi: (translationRoomId: string) => `/meetings/rooms/${translationRoomId}/trigger-ai`,
    chatList: (roomId: string) => `/meetings/rooms/${roomId}/chat`,
    chatSend: (roomId: string) => `/meetings/rooms/${roomId}/chat`,
    chatTranslate: (roomId: string, messageId: string) => `/meetings/rooms/${roomId}/chat/${messageId}/translate`,
    chatModerate: (roomId: string, messageId: string) => `/meetings/rooms/${roomId}/chat/${messageId}/moderate`,
    rejectParticipant: (roomId: string, participantId: string) => `/meetings/rooms/${roomId}/participants/${participantId}/reject`,
    transferHost: (roomId: string, newHostId: string) => `/meetings/rooms/${roomId}/transfer-host/${newHostId}`,
    kickParticipant: (roomId: string, participantId: string) => `/meetings/rooms/${roomId}/participants/${participantId}/kick`,
    endMeeting: (roomId: string) => `/meetings/rooms/${roomId}/end`,
  },
  workspaces: {
    list: "/workspaces",
    get: (id: string) => `/workspaces/${id}`,
    members: (id: string) => `/workspaces/${id}/members`,
  },
} as const;
