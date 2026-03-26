/**
 * Meeting domain types — aligned with backend MeetingService DTOs.
 * Source: WarpTalk.MeetingService.Application.DTOs.MeetingDtos
 */

// ── Response DTOs ─────────────────────────────

export type MeetingStatus = "scheduled" | "active" | "completed" | "cancelled";

export interface MeetingDto {
  id: string;
  workspaceId: string;
  hostId: string;
  title: string;
  description?: string;
  meetingCode: string;
  status: MeetingStatus;
  meetingType: string;
  maxParticipants: number;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface MeetingParticipantDto {
  id: string;
  meetingId: string;
  userId: string;
  displayName: string;
  role: "host" | "participant" | "interpreter";
  listenLanguage: string;
  speakLanguage: string;
  status: "joined" | "left" | "removed";
  joinedAt?: string;
}

// ── Request DTOs ──────────────────────────────

export interface CreateMeetingRequest {
  workspaceId?: string;
  title: string;
  description?: string;
  meetingType: "one_to_one" | "group" | "webinar" | "b2b_virtual_mic";
  maxParticipants: number;
  sourceLanguage: string;
  targetLanguages: string;
  scheduledAt?: string;
}

export interface JoinMeetingRequest {
  displayName: string;
  listenLanguage: string;
  speakLanguage: string;
}
