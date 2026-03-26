/**
 * Centralized API endpoints matching Gateway YARP routes.
 * Base URL is set in apiClient (NEXT_PUBLIC_API_URL).
 *
 * Gateway routing:
 *   /api/v1/auth/*          → AuthService :5101  (transforms to /api/auth/*)
 *   /api/v1/meetings/*      → MeetingService :5102
 *   /api/v1/transcripts/*   → TranscriptService :5103
 *   /api/v1/notifications/* → NotificationService :5104
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
  meetings: {
    create: "/meetings",
    get: (id: string) => `/meetings/${id}`,
    join: (id: string) => `/meetings/${id}/join`,
    end: (id: string) => `/meetings/${id}/end`,
  },
  transcripts: {
    start: "/transcripts",
    get: (id: string) => `/transcripts/${id}`,
    audio: (id: string) => `/transcripts/${id}/audio`,
    finalize: (id: string) => `/transcripts/${id}/finalize`,
  },
  notifications: {
    preferences: "/notifications/preferences",
  },
} as const;
