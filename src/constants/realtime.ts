/**
 * Centralized Real-time Constants for SignalR, Redis events, timing, and query keys.
 */

export const SIGNALR_HUBS = {
  NOTIFICATION: "/hubs/notification",
  TRANSLATION_ROOM: "/hubs/translation-room",
  MEETING_CHAT: "/api/v1/meetings/chat-hub",
  ASSISTANT: "/api/v1/assistant/chat-hub",
  BILLING: "/hubs/billing",
} as const;

export const SIGNALR_EVENTS = {
  // Billing. The Gateway relays every `billing.*` notification under this name as well as under
  // NewNotification, so a screen that only cares about money can listen for this one instead of
  // filtering the whole notification firehose.
  BILLING_NOTIFICATION: "BillingNotification",

  // Notifications
  NEW_NOTIFICATION: "NewNotification",
  NOTIFICATION_READ: "NotificationRead",
  ALL_NOTIFICATIONS_READ: "AllNotificationsRead",

  // Workspace & Members
  WORKSPACE_EVENT: "WorkspaceEvent",
  MEMBER_ROLE_UPDATED: "MemberRoleUpdated",
  MEMBER_REMOVED: "MemberRemoved",
  USER_PRESENCE_CHANGED: "UserPresenceChanged",
  WORKSPACE_SETTINGS_UPDATED: "WorkspaceSettingsUpdated",
  USER_PROFILE_UPDATED: "UserProfileUpdated",

  // Meetings & Rooms
  MEETING_EVENT: "MeetingEvent",
  MEETING_CREATED: "MeetingCreated",
  MEETING_STATUS_CHANGED: "MeetingStatusChanged",
  MEETING_STARTED: "MeetingStarted",
  MEETING_DELETED: "MeetingDeleted",

  // Documents & AI Summaries
  DOCUMENT_STATUS_CHANGED: "DocumentStatusChanged",
  DOCUMENT_COMMENT_ADDED: "DocumentCommentAdded",
  DOCUMENT_DELETED: "DocumentDeleted",
  AI_SUMMARY_PROGRESS: "AISummaryProgress",

  // Live Room Interactions
  REACTION_RECEIVED: "ReactionReceived",
  COLLABORATIVE_NOTE_UPDATED: "CollaborativeNoteUpdated",
  PARTICIPANT_ADMITTED: "ParticipantAdmitted",
  // WT-428: the knock — somebody just landed in the waiting room. Only hosts act on it.
  PARTICIPANT_WAITING: "ParticipantWaiting",
} as const;

export const QUERY_KEYS = {
  NOTIFICATIONS: "notifications",
  UNREAD_COUNT: "unread-count",
  ROOMS: "rooms",
  TRANSLATION_ROOMS: "translationRooms",
  WORKSPACE_ROOMS: "workspace-rooms",
  MEETINGS: "meetings",
  WORKSPACE_MEMBERS: "workspace-members",
  WORKSPACES: "workspaces",
  WORKSPACE_SETTINGS: "workspace-settings",
  USER_PROFILE: "user-profile",
  DOCUMENTS: "documents",
  DOCUMENT_DETAIL: "document-detail",
  AI_SUMMARIES: "ai-summaries",
  SUMMARY: "summary",
} as const;

export const BROADCAST_CHANNELS = {
  NOTIFICATIONS_SYNC: "warptalk_notifications",
} as const;

export const ALLOWED_REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👏", "😮"] as const;

export const REALTIME_TIMINGS = {
  DEBOUNCE_NOTE_MS: 400,
  TOAST_DURATION_MS: 10000,
  FLOATING_EMOJI_DURATION_MS: 3000,
  MAX_FLOATING_EMOJIS: 20,
} as const;
