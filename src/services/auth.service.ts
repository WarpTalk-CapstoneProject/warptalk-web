import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AuthResponse,
  ChangePasswordRequest,
  GoogleLoginRequest,
  LoginRequest,
  LogoutRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserDto,
  UserSettingsDto,
  UpdateUserSettingsRequest,
} from "@/types/auth";

/** Auth service — maps to AuthController endpoints */
export const authService = {
  register(data: RegisterRequest) {
    return apiClient.post<AuthResponse>(API.auth.register, data);
  },

  login(data: LoginRequest) {
    return apiClient.post<AuthResponse>(API.auth.login, data);
  },

  googleLogin(data: GoogleLoginRequest) {
    return apiClient.post<AuthResponse>(API.auth.googleLogin, data);
  },

  refresh(refreshToken: string) {
    return apiClient.post<AuthResponse>(API.auth.refresh, { refreshToken });
  },

  /**
   * Revoke the refresh token server-side.
   *
   * The endpoint is `[Authorize]`, and this is called while the session is
   * being torn down, so the departing access token has to be handed over
   * explicitly — by the time the request interceptor would look one up, the
   * store is already empty. /auth/logout is exempt from interceptor management
   * in lib/api/client.ts precisely so this header survives.
   */
  logout(data: LogoutRequest, accessToken?: string | null) {
    return apiClient.post<void>(API.auth.logout, data, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
  },

  getProfile() {
    return apiClient.get<UserDto>(API.auth.me);
  },

  updateProfile(data: UpdateProfileRequest) {
    return apiClient.put<UserDto>(API.auth.me, data);
  },

  changePassword(data: ChangePasswordRequest) {
    return apiClient.post<void>(API.auth.changePassword, data);
  },

  getSettings() {
    return apiClient.get<UserSettingsDto>(API.auth.settings);
  },

  updateSettings(data: UpdateUserSettingsRequest) {
    return apiClient.put<UserSettingsDto>(API.auth.settings, data);
  },
};
