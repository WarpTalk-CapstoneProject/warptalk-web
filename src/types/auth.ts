/**
 * Auth domain types — aligned with backend AuthService DTOs.
 * Source: WarpTalk.AuthService.Application.DTOs.AuthDtos
 */

// ── Response DTOs ─────────────────────────────

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  phone?: string;
  preferredLanguage?: string;
  timezone?: string;
  emailVerified: boolean;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO DateTime
  user: UserDto;
}

// ── Request DTOs ──────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface UpdateProfileRequest {
  fullName?: string;
  phone?: string;
  preferredLanguage?: string;
  timezone?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UserSettingsDto {
  userId: string;
  defaultSpeakLanguage: string;
  defaultListenLanguage: string;
  voiceCloneEnabled: boolean;
  micNoiseSuppression: boolean;
  defaultTranslationRoomType: string;
  autoRecordTranslationRooms: boolean;
  autoGenerateSummary: boolean;
  defaultMaxParticipants: number;
  theme: string;
  transcriptFontSize: number;
  showOriginalTranscript: boolean;
  showTranslatedTranscript: boolean;
  highContrast: boolean;
  screenReaderMode: boolean;
  updatedAt: string;
}

export interface UpdateUserSettingsRequest {
  defaultSpeakLanguage?: string;
  defaultListenLanguage?: string;
  voiceCloneEnabled?: boolean;
  micNoiseSuppression?: boolean;
  defaultTranslationRoomType?: string;
  autoRecordTranslationRooms?: boolean;
  autoGenerateSummary?: boolean;
  defaultMaxParticipants?: number;
  theme?: string;
  transcriptFontSize?: number;
  showOriginalTranscript?: boolean;
  showTranslatedTranscript?: boolean;
  highContrast?: boolean;
  screenReaderMode?: boolean;
}
