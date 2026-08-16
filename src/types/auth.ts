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

/**
 * No `refreshToken`. The server stopped sending one in the body when the session moved into
 * HttpOnly cookies; the field stayed declared here for a while and was therefore a lie the
 * compiler enforced — every `const { refreshToken } = res.data` type-checked and every one of
 * them was `undefined` at runtime, which is how the client ended up unable to refresh at all.
 * The refresh token is in the `warptalk_refresh` cookie and is not readable from JS by design.
 */
export interface AuthResponse {
  accessToken: string;
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
  /**
   * The sign-up wizard's third step, sent with the account rather than saved afterwards:
   * self-registration returns no session (BR-02), so there is no authenticated moment in which
   * the client could PUT them. Omitted, the server falls back to the platform defaults.
   */
  defaultSpeakLanguage?: string;
  defaultListenLanguage?: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

// No RefreshTokenRequest / LogoutRequest. Both carried a refresh token this side can no longer
// read, and both endpoints take it from the HttpOnly cookie instead — the request bodies are
// empty now. The server's DTOs already had the field nullable for exactly this.

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
